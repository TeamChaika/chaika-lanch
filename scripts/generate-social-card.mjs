import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const data = async (path, type) => `data:${type};base64,${(await readFile(new URL(path, root))).toString('base64')}`;
const logo = await data('public/brand/logo.png', 'image/png');
const photo = await data('public/images/optimized/lunch-photo-007-1280-9982c56a83d8.webp', 'image/webp');
const font = await data('node_modules/@fontsource-variable/golos-text/files/golos-text-cyrillic-wght-normal.woff2', 'font/woff2');
const latin = await data('node_modules/@fontsource-variable/golos-text/files/golos-text-latin-wght-normal.woff2', 'font/woff2');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="ru"><meta charset="UTF-8"><style>
    @font-face{font-family:Golos;src:url('${font}');font-weight:100 900;unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
    @font-face{font-family:Golos;src:url('${latin}');font-weight:100 900}
    *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#153c35;font-family:Golos,sans-serif;color:#fffdf9;overflow:hidden}
    .photo{position:absolute;inset:0;width:1200px;height:630px;object-fit:cover;object-position:center 48%}
    .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(21,60,53,.04) 0%,rgba(21,60,53,0) 36%,rgba(21,60,53,.88) 63%,#153c35 95%)}
    .brand-mark{position:absolute;left:450px;top:20px;width:300px;height:100px;background:#fffdf9ed;border-radius:20px;display:flex;align-items:center;justify-content:center}
    .logo{width:276px;height:90px;object-fit:contain;mix-blend-mode:multiply}
    .message{position:absolute;left:320px;top:375px;width:560px;text-align:center}
    h1{font-size:62px;line-height:1.1;letter-spacing:-2px;margin:0 0 8px;font-weight:720;white-space:nowrap}
    .price{font-size:108px;line-height:1.04;font-weight:780;color:#e3edc9;letter-spacing:-4px;margin:0}
    .caption{font-size:22px;line-height:1.4;margin:6px 0 0;color:#e9eee2}
    .side-note{position:absolute;bottom:28px;width:240px;font-size:17px;line-height:1.5;color:#e0e7da}
    .left{left:30px}.right{right:30px;text-align:right}
  </style><img class="photo" src="${photo}" alt=""><div class="shade"></div><div class="brand-mark"><img class="logo" src="${logo}" alt="CHAIKATEAM"></div><div class="message"><h1>Чайка Обеды</h1><p class="price">550 ₽</p><p class="caption">за полный обед</p></div><div class="side-note left">Ялта · Севастополь<br>Симферополь</div><div class="side-note right">Пример подачи<br>Доставка оплачивается<br>отдельно</div></html>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  // WhatsApp can crop the wide image to its central square. Keep essential copy inside it.
  for (const selector of ['.brand-mark', 'h1', '.price']) {
    const box = await page.locator(selector).boundingBox();
    if (!box || box.x < 285 || box.x + box.width > 915 || box.y < 0 || box.y + box.height > 630) throw new Error('Social card exceeds the central square');
  }
  await mkdir(new URL('public/social/', root), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('public/social/chaika-lunch-v2.jpg', root)), type: 'jpeg', quality: 90 });
} finally { await browser.close(); }
