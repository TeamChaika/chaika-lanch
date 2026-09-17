import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('src/data/image-manifest.json', root), 'utf8'));
const hosting = JSON.parse(await readFile(new URL('src/data/image-hosting.json', root), 'utf8'));
const url = new URL(hosting.baseUrl);
const [bucket, ...segments] = url.pathname.split('/').filter(Boolean);
const prefix = segments.join('/');
if (url.protocol !== 'https:' || !bucket || prefix !== 'chaika-lanch') throw new Error('Expected a dedicated chaika-lanch prefix in image-hosting.json');
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) throw new Error('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for this upload process. Never commit credentials.');

const client = new S3Client({
  endpoint: url.origin,
  region: 'ru-1',
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
let bytes = 0;
let count = 0;
for (const variants of Object.values(manifest)) {
  for (const variant of variants) {
    if (!/^\/images\/optimized\/[a-z0-9-]+-[a-f0-9]{12}\.webp$/.test(variant.path)) throw new Error('Invalid asset path');
    const data = await readFile(fileURLToPath(new URL(`public${variant.path}`, root)));
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
    if (!variant.path.endsWith(`-${hash}.webp`) || data.length !== variant.bytes) throw new Error(`Asset changed: ${variant.path}. Run images:optimize first.`);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}${variant.path}`,
      Body: data,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    // Anonymous reads verify the same URL visitors will use, including metadata.
    const response = await fetch(`${hosting.baseUrl}${variant.path}`, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    if (!response.ok || response.headers.get('content-type') !== 'image/webp' || Number(response.headers.get('content-length')) !== data.length) throw new Error(`Public image verification failed: ${variant.path}`);
    bytes += data.length;
    count++;
  }
}
console.log(`Uploaded and publicly verified ${count} WebP files (${bytes.toLocaleString()} bytes) under ${hosting.baseUrl}/images/optimized/.`);
