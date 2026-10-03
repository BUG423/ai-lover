import { test, expect, type Page, type Locator } from '@playwright/test';

async function tapNav(page: Page, label: string) {
  await page
    .getByRole('navigation', { name: '手机主导航' })
    .getByRole('button', { name: label, exact: true })
    .tap();
}
async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}
async function reachable(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}

for (const viewport of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]) {
  test(`mobile smoke ${viewport.width}px: create, configure, chat, return and restore`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const health = await request.get('/api/health');
    expect(health.ok()).toBe(true);
    expect(await health.json()).toEqual({ ok: true });

    await page.route('**/api/models', (route) =>
      route.fulfill({ json: { models: ['Qwen/Qwen3.5-9B', 'test/mobile-chat'] } }),
    );
    let testedModel = '';
    await page.route('**/api/test', (route) => {
      testedModel = route.request().postDataJSON().settings.model;
      return route.fulfill({ json: { ok: true, latencyMs: 30 } });
    });
    let chatBody:
      | {
          companion: { name: string; gender: string; stage: string };
          messages: { content: string }[];
        }
      | undefined;
    await page.route('**/api/chat', (route) => {
      chatBody = route.request().postDataJSON();
      return route.fulfill({
        contentType: 'text/event-stream',
        body: 'data: {"type":"delta","text":"我在听，"}\n\ndata: {"type":"delta","text":"慢慢说。"}\n\ndata: {"type":"done","firstTokenMs":20,"totalMs":30}\n\n',
      });
    });

    await page.goto('/');
    await page.getByRole('navigation', { name: '手机主导航' }).waitFor();
    await noOverflow(page);
    await page.getByRole('button', { name: '创建陪伴对象', exact: true }).tap();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /怎么称呼/ }).fill('阿狸');
    await dialog.getByRole('combobox', { name: /^你的性别/ }).selectOption('undefined');
    await dialog.getByRole('combobox', { name: /^TA 的性别/ }).selectOption('animal');
    await dialog.getByRole('textbox', { name: /动物种类/ }).fill('狐狸');
    await dialog.getByRole('button', { name: /清冷慢热/ }).tap();
    await dialog.getByRole('button', { name: /离异后/ }).tap();
    await noOverflow(page);
    await reachable(page, dialog.getByRole('button', { name: '开始认识 TA' }));
    await dialog.getByRole('button', { name: '开始认识 TA' }).tap();
    await expect(page.getByRole('region', { name: '与阿狸的会话' })).toBeVisible();
    await noOverflow(page);
    await page.getByRole('button', { name: '返回聊天列表' }).tap();

    await tapNav(page, '设置');
    await noOverflow(page);
    await page
      .getByRole('textbox', { name: 'API 密钥', exact: true })
      .fill('sk-mobile-smoke-test-not-a-real-key');
    await page.getByRole('button', { name: '读取模型', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText('已读取 2 个');
    await page.getByLabel(/对话模型/).selectOption('test/mobile-chat');
    await page.getByRole('button', { name: '测试连接', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText('连接成功');
    expect(testedModel).toBe('test/mobile-chat');
    await reachable(page, page.getByRole('button', { name: '保存设置', exact: true }));
    await page.getByRole('button', { name: '保存设置', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText('设置已保存');

    await tapNav(page, '通讯录');
    await noOverflow(page);
    await page.getByRole('button', { name: '查看阿狸的详细信息' }).tap();
    await page.getByRole('dialog').getByRole('button', { name: '聊一聊', exact: true }).tap();
    const composer = page.getByRole('textbox', { name: '发送给阿狸的消息' });
    await reachable(page, composer);
    await composer.fill('今天有点累，想和你聊聊');
    const send = page.getByRole('button', { name: '发送', exact: true });
    await reachable(page, send);
    await send.tap();
    const conversation = page.getByRole('region', { name: '与阿狸的会话' });
    await expect(conversation.getByText('我在听，慢慢说。', { exact: true })).toBeVisible();
    expect(chatBody?.companion).toMatchObject({
      name: '阿狸',
      gender: 'animal',
      stage: 'divorced',
    });
    expect(chatBody?.messages).toEqual([{ role: 'user', content: '今天有点累，想和你聊聊' }]);
    await noOverflow(page);
    await page.getByRole('button', { name: '返回聊天列表' }).tap();
    await expect(page.getByRole('region', { name: '聊天列表' })).toBeVisible();
    await page.reload();
    await page.getByRole('navigation', { name: '手机主导航' }).waitFor();
    await page
      .getByRole('region', { name: '聊天列表' })
      .getByRole('button', { name: /^阿狸/ })
      .tap();
    await expect(
      page
        .getByRole('region', { name: '与阿狸的会话' })
        .getByText('我在听，慢慢说。', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
