import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const outputDirectory = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const screens = [
  { file: 'mobile-chat.png', title: '聊天', description: '从一句你好开始' },
  { file: 'mobile-create.png', title: '创建对象', description: '定义每一份独特个性' },
  { file: 'mobile-contacts.png', title: '通讯录', description: '每一位，都有自己的温度' },
  { file: 'mobile-settings.png', title: '设置', description: '连接模型，开启对话' },
];

const images = await Promise.all(
  screens.map(async (screen, index) => ({
    ...screen,
    index: index + 1,
    source: `data:image/png;base64,${(await readFile(`${outputDirectory}/${screen.file}`)).toString('base64')}`,
  })),
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 780 } });
  await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif; color: #365543; }
    main { height: 780px; padding: 34px 36px; border-radius: 26px; overflow: hidden; background: radial-gradient(ellipse at 3% 5%,#e2ecd7,transparent 48%),radial-gradient(ellipse at 98% 94%,#eddcd1,transparent 45%),#f4f6ef; }
    header { display: flex; align-items: center; justify-content: space-between; margin: 0 5px 28px; }
    h1 { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: 2px; }
    .subtitle { margin-top: 9px; color: #718067; font-size: 14px; }
    .badge { padding: 10px 17px; border: 1px solid #fff; border-radius: 24px; background: #ffffff96; color: #60775d; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 24px; }
    article { min-width: 0; text-align: center; }
    .phone { width: 246px; padding: 9px; margin: 0 auto; border: 1px solid #fff; border-radius: 32px; background: linear-gradient(145deg,#fdfef9,#e0e7d9); box-shadow: 0 18px 34px #5365461a, inset 0 0 0 1px #dbe4d4; }
    img { display: block; width: 226px; height: 489px; object-fit: cover; object-position: top; border-radius: 24px; background: #f9faf4; }
    h2 { margin: 22px 0 8px; font-size: 19px; font-weight: 500; }
    .number { display: inline-block; vertical-align: 2px; font-size: 11px; padding: 4px 6px; margin-right: 8px; border-radius: 6px; color: #6e8664; background: #e5eddf; }
    p { margin: 0; font-size: 12px; color: #73816a; }
    footer { margin-top: 32px; text-align: center; color: #7c8a73; font-size: 12px; letter-spacing: 1px; }
  </style></head><body><main><header><div><h1>把陪伴放进口袋</h1><div class="subtitle">知心 · AI Lover 的手机界面</div></div><div class="badge">Android · 界面预览</div></header><div class="grid">${images
    .map(
      (screen) =>
        `<article><div class="phone"><img src="${screen.source}" alt="${screen.title}"></div><h2><span class="number">0${screen.index}</span>${screen.title}</h2><p>${screen.description}</p></article>`,
    )
    .join(
      '',
    )}</div><footer>微信式操作路径 · 磨砂玻璃视觉 · 每个对象拥有独立设定</footer></main></body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  await page.evaluate(() => document.fonts.ready);
  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({ path: `${outputDirectory}/mobile-gallery.png`, animations: 'disabled' });
  console.log('Updated docs/screenshots/mobile-gallery.png');
} finally {
  await browser.close();
}
