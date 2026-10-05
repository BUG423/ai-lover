// Documentation-only renderer. Uses isolated fictional data and never calls a model.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const baseUrl = process.env.PROMO_UI_URL ?? 'http://127.0.0.1:5173';
const output = resolve('docs/media/screenshots');
await mkdir(output, { recursive: true });
const now = Date.parse('2026-10-05T20:30:00+08:00');
const companion = {
  id: randomUUID(),
  name: '小满',
  gender: 'female',
  userGender: 'undefined',
  animalType: '',
  personalityIds: ['warm', 'playful'],
  stage: 'flirting',
  background: '文学硕士，喜欢钢琴、散步和逛书店。温柔，愿意认真倾听。',
  userBackground: '程序员，周末喜欢爬山。希望聊天轻松自然，不急着给建议。',
  avatar: '🌷',
  color: 'sage',
  createdAt: now,
  updatedAt: now,
};
const others = [
  { name: '阿岚', avatar: '🌲', color: 'sky', personalityIds: ['mature', 'rational'] },
  { name: '橙子', avatar: '🍊', color: 'peach', personalityIds: ['playful', 'sunny'] },
].map((item) => ({
  ...companion,
  ...item,
  id: randomUUID(),
  gender: 'undefined',
  stage: 'new',
  background: '喜欢分享生活里的小事，也愿意安静地听你说。',
  userBackground: '',
}));
const dialogue = [
  ['user', '今天有点累，感觉自己还不够好。'],
  ['assistant', '先不用给自己打分。你已经很认真了，慢慢说，我在听。'],
  ['user', '想安静一会儿，又想有人陪着。'],
  ['assistant', '好，就按你的节奏来。想说话时，我们就聊两句。'],
].map(([role, content], index) => ({
  id: randomUUID(),
  role,
  content,
  createdAt: now + index * 60_000,
  status: 'complete',
}));
const data = {
  version: 1,
  companions: [companion, ...others],
  conversations: {
    [companion.id]: dialogue,
    ...Object.fromEntries(others.map((item) => [item.id, []])),
  },
  activeId: companion.id,
};
const browser = await chromium.launch({ headless: true });
const errors = [];

async function createPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, locale: 'zh-CN' });
  await context.addInitScript((seed) => {
    if (!sessionStorage.getItem('promo.seeded')) {
      localStorage.clear();
      localStorage.setItem('zhixin.data.v1', JSON.stringify(seed));
      sessionStorage.setItem('promo.seeded', '1');
    }
  }, data);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseUrl).origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) {
      errors.push('Promotional captures must not call a model endpoint');
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await navigate(page, '设置');
  // Deliberately invalid placeholder, encrypted through the ordinary settings UI.
  await page.getByRole('textbox', { name: 'API 密钥', exact: true }).fill('tp-demo-only');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('设置已保存');
  await page.getByRole('button', { name: '关闭提示' }).click();
  await navigate(page, '聊天');
  await page
    .getByRole('region', { name: '聊天列表' })
    .getByRole('button', { name: /小满/ })
    .click();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function navigate(page, label) {
  if ((await page.locator('nav:visible').count()) === 0)
    await page.getByRole('button', { name: '返回聊天列表' }).click();
  await page
    .locator('nav:visible')
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .first()
    .click();
}
async function capture(page, name) {
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
  console.log(`Captured ${name}`);
}
try {
  const mobile = await createPage({ width: 390, height: 844 });
  await capture(mobile, 'android-chat');
  await mobile.getByRole('button', { name: '更多会话操作' }).click();
  await mobile.getByRole('button', { name: '编辑设定', exact: true }).click();
  await mobile
    .getByRole('dialog')
    .locator('.dialog-body')
    .evaluate((element) => {
      const target = element.querySelector('.personality-options');
      element.scrollTop +=
        target.getBoundingClientRect().top - element.getBoundingClientRect().top - 45;
    });
  await capture(mobile, 'android-personality');
  await mobile
    .getByRole('dialog')
    .locator('fieldset')
    .filter({ hasText: 'TA 的个性' })
    .screenshot({
      path: `${output}/android-personality-options.png`,
      animations: 'disabled',
    });
  await mobile
    .getByRole('dialog')
    .getByRole('textbox', { name: /对我的描述/ })
    .scrollIntoViewIfNeeded();
  await capture(mobile, 'android-descriptions');
  const descriptions = await mobile
    .getByRole('dialog')
    .getByRole('textbox', { name: /对 TA 的描述|对我的描述/ })
    .evaluateAll((textareas) => {
      const fields = textareas.map((element) => element.closest('label').getBoundingClientRect());
      return {
        x: Math.min(...fields.map((r) => r.x)),
        y: Math.min(...fields.map((r) => r.y)),
        width: Math.max(...fields.map((r) => r.right)) - Math.min(...fields.map((r) => r.x)),
        height: Math.max(...fields.map((r) => r.bottom)) - Math.min(...fields.map((r) => r.y)),
      };
    });
  await mobile.screenshot({
    path: `${output}/android-description-fields.png`,
    clip: descriptions,
    animations: 'disabled',
  });
  await mobile.getByRole('button', { name: '关闭弹窗' }).click();
  await navigate(mobile, '通讯录');
  await capture(mobile, 'android-contacts');
  await navigate(mobile, '设置');
  await capture(mobile, 'android-settings');
  const desktop = await createPage({ width: 1440, height: 960 });
  await capture(desktop, 'windows-chat');
  await navigate(desktop, '设置');
  await capture(desktop, 'windows-settings');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
