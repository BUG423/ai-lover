// Export native HTML/CSS campaign layouts; raster illustration comes from imagegen.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('docs/marketing/xiaohongshu');
await mkdir(directory, { recursive: true });
await mkdir(resolve('artifacts/marketing'), { recursive: true });
const dataUri = async (path, type = 'image/png') =>
  `data:${type};base64,${(await readFile(path)).toString('base64')}`;
const illustration = await dataUri('docs/media/companion-illustration.png');
const icon = await dataUri('packages/ui/public/icon.svg', 'image/svg+xml');
const screenshots = {};
for (const name of [
  'android-chat',
  'android-personality',
  'android-descriptions',
  'android-personality-options',
  'android-description-fields',
  'windows-chat',
])
  screenshots[name] = await dataUri(`docs/media/screenshots/${name}.png`);
let fontCss = '';
if (process.env.PROMO_FONT_FILE)
  fontCss = `@font-face{font-family:PromoNoto;src:url(${await dataUri(process.env.PROMO_FONT_FILE, 'font/ttf')});font-weight:100 900}`;

const css = `
${fontCss}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:PromoNoto,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#28483d;background:#f8f5ee;font-synthesis:none}
.canvas{width:1080px;height:1440px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 100% 15%,#e3ebdf 0%,transparent 42%),#f8f5ee}
.canvas:after{content:'';position:absolute;inset:24px;border:1px solid #526c5714;border-radius:28px;pointer-events:none}
.brand{position:absolute;left:78px;top:70px;display:flex;align-items:center;gap:18px;font-size:27px;font-weight:650;letter-spacing:1px}
.brand img{width:58px;height:58px;border-radius:16px}.brand span small{display:block;font-size:13px;font-weight:500;letter-spacing:3px;margin-top:4px;color:#7d8d7e}
.index{position:absolute;right:80px;top:86px;color:#8b9987;font-size:19px;letter-spacing:3px}.index b{color:#52715f;font-weight:500}
.kicker{position:absolute;left:82px;top:177px;letter-spacing:4px;color:#7c927e;font-size:19px;font-weight:550}
h1{position:absolute;top:212px;left:78px;margin:0;font-size:73px;font-weight:700;line-height:1.28;letter-spacing:-2px}h1 em{font-style:normal;color:#71936e}
.sub{position:absolute;left:82px;top:414px;color:#7c8c7d;font-size:25px;line-height:1.8;margin:0}.footer{position:absolute;left:82px;right:82px;bottom:45px;border-top:1px solid #71817130;padding-top:18px;display:flex;justify-content:space-between;gap:20px;color:#899383;font-size:17px;letter-spacing:.4px}
.phone{position:absolute;background:#fafbf7;border:2px solid #d7dfd1;border-radius:42px;padding:11px;box-shadow:0 32px 70px #344b3720,0 3px 8px #344b3710;overflow:hidden}
.phone img{width:100%;display:block;border-radius:30px}.phone.dark{border:2px solid #64826c;background:#64826c}
.shot{position:absolute;background:#fbfcf8;border:1px solid #e1e7dc;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px #344b3715}.shot img{display:block;width:100%}
.art{position:absolute;object-fit:contain}.tag{display:inline-flex;padding:12px 22px;border:1px solid #a8bba254;border-radius:100px;background:#fdfdf8a8;font-size:20px;letter-spacing:.5px;color:#65805e}
.note{color:#85927f;font-size:21px;line-height:1.85}.big{font-size:104px;letter-spacing:-4px;font-weight:650;line-height:1;color:#5e805f}.label{font-size:26px;line-height:1.6;color:#637d62}.line{height:1px;background:#a8b6a64a;margin:35px 0}.number{font-size:19px;color:#6e8a6b;letter-spacing:3px}
.cover h1{font-size:79px;top:197px}.cover .sub{top:429px;font-size:24px}.cover .phone{width:426px;left:570px;top:416px;transform:rotate(3deg)}.cover .art{width:606px;height:420px;left:12px;top:658px;transform:rotate(-7deg)}
.cover .side{position:absolute;left:83px;top:1110px;font-size:34px;line-height:1.6;letter-spacing:1px}.cover .side small{display:block;font-size:20px;color:#8a9785;margin-top:19px;letter-spacing:0}.cover .tiny-tag{position:absolute;left:82px;top:575px}
.conversation h1{font-size:70px}.conversation .shot{left:180px;top:438px;width:720px;height:864px;border-radius:36px}.conversation .shot img{margin-top:0}.conversation .caption{position:absolute;left:180px;top:1318px;font-size:22px;line-height:1.3;color:#6d8169}.conversation .caption b{font-weight:500;color:#43674d}.conversation .sub{top:389px;font-size:21px;line-height:1.4}
.persona h1{font-size:75px}.persona .sub{top:405px;font-size:23px;line-height:1.4}.persona .shot{left:114px;top:471px;width:852px;padding:29px;border-radius:30px}.persona .relation-note{position:absolute;left:115px;top:1302px;font-size:23px;color:#7d8e77}.persona .relation-note b{font-weight:600;color:#527750}
.profiles h1{font-size:78px}.profiles .sub{top:405px;font-size:23px;line-height:1.4}.profiles .shot{left:82px;top:550px;width:916px;padding:28px;border-radius:30px}.profiles .art{width:275px;height:184px;left:733px;top:198px;transform:rotate(8deg)}.profiles .keyline{position:absolute;left:85px;top:1301px;font-size:23px;line-height:1.4;color:#5e7b5c}
.platform h1{font-size:73px}.platform .sub{top:405px;font-size:24px}.platform .desktop{left:82px;top:517px;width:916px;height:638px;background:#fbfcf8;border:10px solid #eef1e9;border-radius:24px}.desktop:before{content:'';display:block;height:22px;background:#eef1e9}.desktop img{height:auto}.platform .phone{width:278px;left:690px;top:733px;border-radius:32px;padding:8px;box-shadow:0 20px 50px #344b3730}.platform .phone img{border-radius:22px}.platform .platform-tag{position:absolute;left:85px;top:1190px}.platform .platform-note{position:absolute;left:85px;top:1250px;font-size:22px;line-height:1.75;color:#84907d}.platform .status{position:absolute;right:85px;top:460px;font-size:19px;color:#75936e;letter-spacing:.5px}
.start h1{font-size:69px}.start .steps{position:absolute;left:82px;top:489px;width:916px}.start .step{height:177px;border-top:1px solid #7b907234;display:flex;align-items:center;gap:36px}.start .step .step-num{font-size:56px;color:#8fa28a;font-weight:450;letter-spacing:-2px}.start .step h2{margin:0 0 14px;font-size:32px;font-weight:600;letter-spacing:.5px}.start .step p{margin:0;color:#7e8d76;font-size:23px;line-height:1.7}.start .providers{position:absolute;left:82px;top:1108px;display:flex;gap:14px}.start .cost{position:absolute;left:84px;top:1197px;font-size:23px;line-height:1.8;color:#829179}.start .repo{position:absolute;left:84px;top:1293px;font-size:23px;color:#527250;font-weight:550;letter-spacing:1px}.start .art{width:282px;height:200px;left:760px;top:292px;transform:rotate(9deg)}
.hero{width:1600px;height:900px}.hero:after{inset:22px}.hero .brand{left:78px;top:73px}.hero h1{left:77px;top:205px;font-size:64px;line-height:1.36}.hero .intro{position:absolute;left:81px;top:432px;font-size:24px;color:#809078;line-height:1.8}.hero .hero-tags{position:absolute;left:80px;top:538px;display:flex;gap:12px}.hero .art{left:0;top:595px;width:508px;height:340px}.hero .desktop{left:630px;top:196px;width:914px;height:638px;border:10px solid #e5eadf;border-radius:24px}.hero .desktop:before{height:20px;background:#e5eadf}.hero .phone{width:306px;left:1180px;top:92px;border-radius:32px;padding:9px;transform:rotate(3deg)}.hero .phone img{border-radius:21px}.hero .hero-caption{position:absolute;left:649px;top:853px;color:#85937c;font-size:17px}
.gallery{width:1600px;height:1120px;background:#f8f5ee}.gallery .gallery-title{position:absolute;top:48px;left:64px;margin:0;font-size:38px;font-weight:650}.gallery .gallery-note{position:absolute;top:1064px;left:64px;font-size:20px;color:#85927d}.gallery .col{position:absolute;top:133px;width:428px}.gallery .col h2{font-size:26px;font-weight:550;margin:0 0 23px}.gallery .phone{position:relative;width:404px;left:0;top:0;border-radius:32px;padding:9px}.gallery .phone img{border-radius:23px}
`;
const shell = (type, page, content) =>
  `<main class="canvas ${type}"><div class="brand"><img alt="知心应用图标" src="${icon}"><span>知心<small>AI LOVER</small></span></div><div class="index"><b>0${page}</b> / 06</div>${content}<div class="footer"><span>Android · Windows x64</span><span>当前版本界面 · 图中人物与对话均为虚构</span></div></main>`;
const phone = (name, extra = '') =>
  `<div class="phone ${extra}"><img alt="${name}" src="${screenshots[name]}"></div>`;
const art = () => `<img class="art" alt="陪伴插画" src="${illustration}">`;
const cards = [
  [
    '01-cover',
    shell(
      'cover',
      1,
      `<div class="kicker">给心情，留一点空间</div><h1>有些话，<br>想慢慢说给 <em>TA</em> 听。</h1><p class="sub">一款简单的 AI 陪伴聊天软件</p><span class="tag tiny-tag">从一句「今天有点累」开始</span>${phone('android-chat')}${art()}<div class="side">把今天的心情，<br>慢慢聊完。<small>自备模型 API Key · 源码与安装包公开</small></div>`,
    ),
  ],
  [
    '02-conversation',
    shell(
      'conversation',
      2,
      `<div class="kicker">01 / 陪你把话说完</div><h1>今天不想很厉害，<br>只想<em>被好好听见。</em></h1><p class="sub">轻一点的界面，留给聊天更多空间。</p><div class="shot"><img alt="真实聊天界面，虚构演示对话" src="${screenshots['android-chat']}"></div><div class="caption">不急着给建议，<b>按你喜欢的相处方式聊。</b></div>`,
    ),
  ],
  [
    '03-personality',
    shell(
      'persona',
      3,
      `<div class="kicker">02 / 先认识 TA</div><h1>想和怎样的 TA，<br><em>慢慢靠近？</em></h1><p class="sub">16 种个性，每位对象可组合 1–3 项。</p><div class="shot"><img alt="真实客户端的16种个性选项" src="${screenshots['android-personality-options']}"></div><div class="relation-note"><b>6 个关系阶段</b>，按你的想法手动选择。</div>`,
    ),
  ],
  [
    '04-profiles',
    shell(
      'profiles',
      4,
      `<div class="kicker">03 / 两个人，两份故事</div><h1>TA 的故事，<br><em>你的故事。</em></h1><p class="sub">TA 的学历与爱好，你的经历与聊天偏好，分别填写。</p>${art()}<div class="shot"><img alt="真实客户端中双方分别填写的资料，内容为虚构示例" src="${screenshots['android-description-fields']}"></div><div class="keyline">两项都可以选填，从一个名字开始也很好。</div>`,
    ),
  ],
  [
    '05-platforms',
    shell(
      'platform',
      5,
      `<div class="kicker">04 / 手机与电脑</div><h1>在熟悉的设备上，<br><em>留一个聊天角落。</em></h1><p class="sub">Android 与 Windows，都可以独立使用。</p><span class="status">OPPO A32 已实机测试可用</span><div class="shot desktop"><img alt="Windows 客户端共用界面" src="${screenshots['windows-chat']}"></div>${phone('android-chat', 'dark')}<div class="platform-tag"><span class="tag">Android</span><span class="tag" style="margin-left:10px">Windows x64</span></div><div class="platform-note">聊天和对象资料保存在当前设备。<br>目前不自动跨设备同步。</div>`,
    ),
  ],
  [
    '06-start',
    shell(
      'start',
      6,
      `<div class="kicker">05 / 三步开始</div><h1>带上你的小钥匙，<br><em>就能开始。</em></h1>${art()}<div class="steps"><div class="step"><span class="step-num">01</span><div><h2>下载客户端</h2><p>安卓安装 APK，Windows 安装或解压运行。</p></div></div><div class="step"><span class="step-num">02</span><div><h2>填入自己的模型密钥</h2><p>选择服务商，读取模型、测试连接并保存。</p></div></div><div class="step"><span class="step-num">03</span><div><h2>创建 TA，发出第一句话</h2><p>名字、性格、关系与双方资料，都由你设定。</p></div></div></div><div class="providers"><span class="tag">小米 MiMo</span><span class="tag">硅基流动 · 国内站</span></div><div class="cost">密钥在本机加密保存，安装包不内置用户密钥。<br>模型调用费用由你的服务商账户承担。</div><div class="repo">GitHub · BUG423 / ai-lover</div>`,
    ),
  ],
];
const hero = `<main class="canvas hero"><div class="brand"><img alt="知心应用图标" src="${icon}"><span>知心<small>AI LOVER</small></span></div><h1>有些话，<br>慢慢说给 <em>TA</em> 听。</h1><div class="intro">带着自己的个性与故事，<br>留一处可以好好聊天的角落。</div><div class="hero-tags"><span class="tag">Android</span><span class="tag">Windows x64</span></div>${art()}<div class="shot desktop"><img alt="Windows 共用界面" src="${screenshots['windows-chat']}"></div>${phone('android-chat')}<div class="hero-caption">当前版本界面展示 · 人物与对话为虚构示例 · 自备模型 API Key</div></main>`;
const gallery = `<main class="canvas gallery"><h1 class="gallery-title">从一句你好，到自己的相处方式。</h1>${[
  ['Android · 聊天', 'android-chat'],
  ['性格与关系', 'android-personality'],
  ['TA 与我的资料', 'android-descriptions'],
]
  .map(
    ([label, name], i) =>
      `<section class="col" style="left:${64 + i * 515}px"><h2>${label}</h2>${phone(name)}</section>`,
  )
  .join('')}<div class="gallery-note">当前版本界面展示 · 人物资料与对话均为虚构示例。</div></main>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const render = async (body, width, height, path) => {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><style>${css}</style></head><body>${body}</body></html>`,
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
  });
  const emptyImages = await page
    .locator('img')
    .evaluateAll((images) => images.filter((img) => !img.naturalWidth).length);
  if (emptyImages) throw new Error(`${path}: image did not load`);
  // Editorial copy stays inside the canvas; deliberately cropped screenshot images are excluded.
  const outside = await page
    .locator('h1,h2,.sub,.footer,.tag,.note,.cost,.repo,.caption')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const r = element.getBoundingClientRect();
          return r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight;
        })
        .map((element) => element.textContent),
    );
  if (outside.length) throw new Error(`Text outside ${path}: ${outside.join(', ')}`);
  await page.screenshot({ path, animations: 'disabled' });
  console.log(`Rendered ${path}`);
};
try {
  for (const [name, body] of cards) await render(body, 1080, 1440, `${directory}/${name}.png`);
  await render(hero, 1600, 900, resolve('docs/media/hero.png'));
  await render(gallery, 1600, 1120, resolve('docs/media/interface-gallery.png'));
  const previews = await Promise.all(
    cards.map(
      async ([name]) => `<img alt="${name}" src="${await dataUri(`${directory}/${name}.png`)}">`,
    ),
  );
  await page.setViewportSize({ width: 1200, height: 1080 });
  await page.setContent(
    `<style>body{margin:0;background:#e8ecdf;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:14px}img{width:100%;display:block;border-radius:10px}</style>${previews.join('')}`,
  );
  await page.evaluate(async () => Promise.all([...document.images].map((img) => img.decode())));
  await page.screenshot({ path: `${directory}/preview.png`, fullPage: true });
  await writeFile(
    resolve('artifacts/marketing/layouts.html'),
    `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><style>${css}body{display:flex;flex-wrap:wrap;gap:24px;padding:24px}.canvas{flex-shrink:0}</style>${cards.map(([, body]) => body).join('')}</html>`,
  );
} finally {
  await browser.close();
}
