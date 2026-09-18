import { randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { requireOwner } from '@/lib/server/auth';
import { writeObject } from '@/lib/server/storage';
import { checkOrigin, failure, HttpError, json, limitedBody } from '@/lib/server/http';
import type { ImageVariant } from '@/data/menu';
export const runtime = 'nodejs';
// Bound CPU/memory use in the image worker; input pixels are separately limited.
sharp.concurrency(1);
export async function POST(request: Request) {
  try {
    checkOrigin(request); await requireOwner();
    if (process.env.MENU_STORE === 'local') throw new HttpError(503, 'Загрузка фото требует подключения S3. Локальный режим предназначен для проверки меню.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(request.headers.get('content-type') || '')) throw new HttpError(415, 'Загрузите JPG, PNG или WebP');
    const input = await limitedBody(request, 12 * 1024 * 1024);
    let metadata: Metadata;
    try { metadata = await sharp(input, { limitInputPixels: 40_000_000, animated: false }).metadata(); }
    catch { throw new HttpError(400, 'Не удалось прочитать фотографию'); }
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) throw new HttpError(400, 'Нужна обычная фотография JPG, PNG или WebP');
    if (Math.min(metadata.width, metadata.height) < 100 || Math.max(metadata.width, metadata.height) / Math.min(metadata.width, metadata.height) > 3) throw new HttpError(400, 'Фото должно быть не меньше 100 × 100 пикселей и не слишком узким');
    const id = randomUUID();
    const widths = [160, 320, 640, 960, 1280].filter((width) => width < metadata.width!);
    widths.push(Math.min(metadata.width, 1280));
    const variants: ImageVariant[] = [];
    for (const width of [...new Set(widths)]) {
      let output;
      try { output = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width, height: 2560, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer({ resolveWithObject: true }); }
      catch { throw new HttpError(400, 'Не удалось обработать фотографию'); }
      const path = `/images/uploads/${id}-${output.info.width}.webp`;
      if (variants.some((variant) => variant.width === output.info.width)) continue;
      await writeObject(path.slice(1), output.data, { type: 'image/webp', immutable: true });
      variants.push({ width: output.info.width, height: output.info.height, path, bytes: output.data.length });
    }
    return json({ image: `/images/uploads/${id}.webp`, imageVariants: variants, originalBytes: input.byteLength, optimizedBytes: variants.at(-1)!.bytes });
  } catch (error) { return failure(error); }
}
