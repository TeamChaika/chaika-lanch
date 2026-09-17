import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = path.join(root, 'assets/images');
const output = path.join(root, 'public/images/optimized');
const widths = [160, 320, 640, 960, 1280];
const manifest = {};
const report = [];
await mkdir(output, { recursive: true });

for (const file of (await readdir(input)).filter((name) => name.endsWith('.png')).sort()) {
  const source = await readFile(path.join(input, file));
  const metadata = await sharp(source).metadata();
  const name = path.basename(file, '.png');
  const variants = [];
  const targetWidths = [...new Set(widths.map((width) => Math.min(width, metadata.width)))];
  for (const width of targetWidths) {
    const { data, info } = await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
    const filename = `${name}-${info.width}-${hash}.webp`;
    await writeFile(path.join(output, filename), data);
    variants.push({ width: info.width, height: info.height, path: `/images/optimized/${filename}`, bytes: data.length });
  }
  manifest[`/images/${name}.webp`] = variants;
  report.push({ image: name, originalBytes: source.length, variants });
}

// Keep earlier hashed variants for existing deployments and cached pages.
await writeFile(path.join(root, 'src/data/image-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(path.join(root, 'docs'), { recursive: true });
await writeFile(path.join(root, 'docs/image-sizes.json'), `${JSON.stringify(report, null, 2)}\n`);
const before = report.reduce((sum, image) => sum + image.originalBytes, 0);
const after = report.reduce((sum, image) => sum + image.variants.at(-1).bytes, 0);
console.log(`${report.length} images: ${before.toLocaleString()} → ${after.toLocaleString()} bytes (largest WebP variants, −${(100 * (1 - after / before)).toFixed(1)}%).`);
