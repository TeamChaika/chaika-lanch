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
    *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f8f5ec;font-family:Golos,sans-serif;color:#23372b;overflow:hidden}
    .photo{position:absolute;right:0;top:0;width:585px;height:630px;object-fit:cover;object-position:48% center}
    .panel{position:absolute;inset:0 auto 0 0;width:670px;background:linear-gradient(90deg,#f8f5ec 86%,rgba(248,245,236,0));padding:38px 48px}
    .logo{width:222px;height:73px;object-fit:contain;mix-blend-mode:multiply;display:block;margin-left:-14px}
    .brand{font-size:19px;font-weight:600;letter-spacing:2px;margin:12px 0 22px;text-transform:uppercase}
    h1{font-size:65px;line-height:1.04;letter-spacing:-2.8px;margin:0;font-weight:750}
    .line{font-size:21px;line-height:1.4;margin:22px 0;color:#5c6c5a}
    .price{display:inline-flex;align-items:center;gap:14px;padding:12px 22px 14px;border-radius:18px;background:#deecb7;font-size:43px;font-weight:750;letter-spacing:-1.3px}
    .price small{font-size:17px;line-height:1.2;font-weight:500;letter-spacing:0;max-width:100px}
    footer{position:absolute;bottom:36px;left:48px;font-size:18px;font-weight:550;line-height:1.6}
    footer span{font-size:15px;color:#6e7b67;font-weight:400}
    .caption{position:absolute;bottom:20px;right:20px;color:white;font-size:11px;background:#203428a6;padding:6px 10px;border-radius:20px}
  </style><img class="photo" src="${photo}" alt=""><div class="panel"><img class="logo" src="${logo}" alt="CHAIKATEAM"><p class="brand">Чайка Обеды</p><h1>Обед готов.<br>День свободен.</h1><p class="line">Горячее, суп, салат и компот.<br>Каждый день — новое меню.</p><div class="price">550 ₽<small>за полный<br>обед</small></div></div><footer>Ялта · Севастополь · Симферополь<br><span>lunch.chaika.team · Доставка оплачивается отдельно</span></footer><div class="caption">Пример подачи</div></html>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  await mkdir(new URL('public/social/', root), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('public/social/chaika-lunch-v1.jpg', root)), type: 'jpeg', quality: 90 });
} finally { await browser.close(); }
