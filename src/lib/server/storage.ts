import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Agent } from 'node:https';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

export class ConflictError extends Error {}
export interface StoredObject { body: string; etag: string }
let client: S3Client | undefined;
function s3() {
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) throw new Error('Storage is not configured');
  return client ??= new S3Client({ endpoint: process.env.S3_ENDPOINT || 'https://s3.twcstorage.ru', region: 'ru-1', forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 3,
    requestHandler: { httpsAgent: new Agent({ keepAlive: true, maxSockets: 8 }), connectionTimeout: 10000, requestTimeout: 30000, throwOnRequestTimeout: true },
  });
}

export async function listObjects(prefix: string, limit = 30, cursor?: string) {
  if (!/^cms\/payments\/(index|pending)\/(live|sandbox)\//.test(prefix) || prefix.includes('..')) throw new Error('Invalid list prefix');
  if (isLocal()) {
    let entries: string[];
    try { entries = (await readdir(localPath(prefix))).sort().filter((name) => !cursor || name > cursor); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { names: [], cursor: undefined }; throw error; }
    const selected = entries.slice(0, limit);
    return { names: selected.map((name) => `${prefix}${name}`), cursor: entries.length > limit ? selected.at(-1) : undefined };
  }
  const result = await s3().send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: key(prefix), MaxKeys: limit, ContinuationToken: cursor }));
  const root = key(prefix).slice(0, -prefix.length);
  return { names: (result.Contents || []).flatMap((entry) => entry.Key?.startsWith(root) ? [entry.Key.slice(root.length)] : []), cursor: result.NextContinuationToken };
}
export async function deleteQueueObject(name: string) {
  if (!/^cms\/payments\/pending\/(live|sandbox)\/[\da-f-]+\.json$/.test(name)) throw new Error('Invalid queue key');
  if (isLocal()) { try { await unlink(localPath(name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } return; }
  await s3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key(name) }));
}
function key(name: string) {
  const prefix = name.startsWith('cms/') && process.env.CMS_STORAGE_PREFIX ? process.env.CMS_STORAGE_PREFIX : process.env.S3_PREFIX || 'chaika-lanch';
  return `${prefix}/${name}`;
}
function localPath(name: string) {
  if (!/^[a-zA-Z0-9/._-]+$/.test(name) || name.includes('..')) throw new Error('Invalid storage key');
  const namespace = process.env.MENU_LOCAL_NAMESPACE || '';
  if (namespace && !/^[a-z0-9-]+$/.test(namespace)) throw new Error('Invalid local namespace');
  return path.join(process.cwd(), '.local-menu', namespace, name);
}
function isLocal() { return process.env.MENU_STORE === 'local'; }
export async function readObject(name: string): Promise<StoredObject | null> {
  if (isLocal()) {
    try { const body = await readFile(localPath(name), 'utf8'); return { body, etag: createHash('sha256').update(body).digest('hex') }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key(name) }));
    if (!result.Body || !result.ETag) throw new Error('Empty storage response');
    return { body: await result.Body.transformToString(), etag: result.ETag };
  } catch (error) { if ((error as { name?: string }).name === 'NoSuchKey') return null; throw error; }
}
// The local adapter is for development only; a queue mirrors S3 conditional writes.
let localQueue: Promise<void> = Promise.resolve();
export async function writeObject(name: string, body: string | Uint8Array, options: { expected?: string | null; type?: string; immutable?: boolean } = {}) {
  if (isLocal()) {
    const operation = localQueue.then(async () => {
      if ('expected' in options && (await readObject(name))?.etag !== (options.expected ?? undefined)) throw new ConflictError();
      const target = localPath(name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(`${target}.tmp`, body, { mode: 0o600 });
      await rename(`${target}.tmp`, target);
    });
    localQueue = operation.catch(() => {});
    return operation;
  }
  try {
    await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key(name), Body: body,
      ContentType: options.type || 'application/json', CacheControl: options.immutable ? 'public,max-age=31536000,immutable' : 'no-store',
      // Timeweb S3 expects a bare ETag for conditional PUT (GET returns quotes).
      ...('expected' in options ? options.expected ? { IfMatch: options.expected.replaceAll('"', '') } : { IfNoneMatch: '*' } : {}),
    }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 412 || status === 409) throw new ConflictError();
    throw error;
  }
}
