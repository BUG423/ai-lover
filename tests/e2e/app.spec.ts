import { test, expect, type Page } from '@playwright/test';
import { dataSchema } from '../../src/lib/validation';

const KEY = 'tp-e2e-test-only-not-a-real-api-key';

test('restricts providers and isolates credentials, models and account types', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/models', (route) => {
    requests++;
    return route.fulfill({ json: { models: ['mimo-v2.6-flash', 'mimo-v2.6-pro'] } });
  });
  await page.goto('/');
  await navigate(page, '设置');
  const providers = page.getByRole('group', { name: '模型服务商' });
  await expect(providers.getByRole('button')).toHaveCount(3);
  await expect(providers.getByRole('button', { name: /小米 MiMo/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const key = page.getByRole('textbox', { name: 'API 密钥', exact: true });
  await key.fill(KEY);
  await page.getByRole('button', { name: '读取模型', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已读取 2 个');
  await expect(page.getByLabel(/对话模型/).locator('option')).toContainText([
    'mimo-v2.6-flash',
    'mimo-v2.6-pro',
  ]);
  await providers.getByRole('button', { name: /硅基流动 · 国内站/ }).click();
  await expect(key).toHaveValue('');
  await expect(page.getByLabel(/对话模型/).locator('option')).not.toContainText(['mimo-v2.6-pro']);
  await key.fill(KEY);
  await page.getByRole('button', { name: '读取模型', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不能用于硅基流动');
  expect(requests).toBe(1);
  await providers.getByRole('button', { name: /小米 MiMo/ }).click();
  await expect(key).toHaveValue('');
  await page.getByRole('combobox', { name: /MiMo/ }).selectOption('https://api.xiaomimimo.com/v1');
  await key.fill(KEY);
  await page.getByRole('button', { name: '读取模型', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('套餐专用地址');
  expect(requests).toBe(1);
});

test('clearing data discards a delayed backup import', async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('zhixin.data.v1')))
    .not.toBeNull();
  const backup = await page.evaluate(() => localStorage.getItem('zhixin.data.v1'));
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function () {
      (window as unknown as Record<string, boolean>).importStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const result = await original.call(this);
      (window as unknown as Record<string, boolean>).importFinished = true;
      return result;
    };
  });
  await navigate(page, '设置');
  await page.getByLabel('导入聊天数据文件').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup!),
  });
  await page.getByRole('dialog').getByRole('button', { name: '导入并替换', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as Record<string, boolean>).importStarted);
  await page.getByRole('button', { name: '清除所有数据', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '清除所有数据', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as Record<string, boolean>).importFinished);
  await expect(page.getByRole('status')).toContainText('已清除');
  await page.reload();
  await expect(page.getByRole('heading', { name: '有些话，想说给懂你的人听' })).toBeVisible();
});
async function navigate(page: Page, label: string) {
  await page
    .locator('nav:visible')
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .first()
    .click();
}
async function configure(page: Page) {
  await navigate(page, '设置');
  await page.getByRole('textbox', { name: 'API 密钥', exact: true }).fill(KEY);
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('设置已保存');
}
async function openChat(page: Page, name = '小满') {
  await navigate(page, '聊天');
  await page
    .getByRole('region', { name: '聊天列表' })
    .getByRole('button', { name: new RegExp(name) })
    .click();
}

test('creates and edits an animal companion, restores it and deletes only that companion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '创建陪伴对象', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /怎么称呼/ }).fill('阿狸');
  await dialog.getByRole('combobox', { name: /^你的性别/ }).selectOption('male');
  await dialog.getByRole('combobox', { name: /^TA 的性别/ }).selectOption('animal');
  await dialog.getByRole('textbox', { name: /动物种类/ }).fill('狐狸');
  await dialog.getByRole('button', { name: /清冷慢热/ }).click();
  await dialog.getByRole('button', { name: /离异后/ }).click();
  await dialog.getByRole('textbox', { name: /再多说一点/ }).fill('喜欢听我讲生活里的小事。');
  await dialog.getByRole('button', { name: '开始认识 TA' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '与阿狸的会话' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '与阿狸的会话' })).toBeVisible();
  await page.getByRole('button', { name: '更多会话操作' }).click();
  await page.getByRole('button', { name: '编辑设定', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /怎么称呼/ })
    .fill('小狐狸');
  await page.getByRole('button', { name: '保存设定', exact: true }).click();
  await expect(page.getByRole('region', { name: '与小狐狸的会话' })).toBeVisible();
  await navigate(page, '通讯录');
  await page.getByRole('button', { name: '查看小狐狸的详细信息' }).click();
  await page.getByRole('button', { name: '删除对象', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除对象', exact: true }).click();
  await expect(page.getByRole('heading', { name: '小满', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '小狐狸', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('saves encrypted credentials, reads models, verifies the selected model and exports without credentials', async ({
  page,
}) => {
  await page.route('**/api/models', (route) =>
    route.fulfill({ json: { models: ['mimo-v2.6-flash', 'test/model'] } }),
  );
  let testedModel = '';
  await page.route('**/api/test', (route) => {
    testedModel = route.request().postDataJSON().settings.model;
    return route.fulfill({ json: { ok: true, latencyMs: 250 } });
  });
  await page.goto('/');
  await configure(page);
  const raw = await page.evaluate(() => localStorage.getItem('zhixin.settings.v1'));
  expect(raw).not.toContain(KEY);
  expect(JSON.parse(raw!).secret.ciphertext).toBeTruthy();
  await page.reload();
  await navigate(page, '设置');
  await expect(page.getByRole('textbox', { name: 'API 密钥', exact: true })).toHaveValue(KEY);
  await page.getByRole('button', { name: '读取模型', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已读取 2 个');
  await page.getByLabel(/对话模型/).selectOption('test/model');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('连接成功');
  expect(testedModel).toBe('test/model');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出备份', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const backup = Buffer.concat(chunks).toString();
  expect(backup).not.toContain(KEY);
  expect(JSON.parse(backup).companions).toHaveLength(1);
});

test('streams real event payloads into chat and keeps each companion context separate', async ({
  page,
}) => {
  const requests: { companion: { name: string }; messages: { role: string; content: string }[] }[] =
    [];
  await page.route('**/api/chat', (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"delta","text":"今天辛苦了，"}\n\ndata: {"type":"delta","text":"慢慢说，我在听。"}\n\ndata: {"type":"done","firstTokenMs":40,"totalMs":120}\n\n',
    });
  });
  await page.goto('/');
  await configure(page);
  await openChat(page);
  await page.getByRole('textbox', { name: '发送给小满的消息' }).fill('今天做项目很累');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: '与小满的会话' })
      .getByText('今天辛苦了，慢慢说，我在听。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: '发送给小满的消息' }).fill('你还记得我刚刚说了什么吗');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].messages).toEqual([
    { role: 'user', content: '今天做项目很累' },
    { role: 'assistant', content: '今天辛苦了，慢慢说，我在听。' },
    { role: 'user', content: '你还记得我刚刚说了什么吗' },
  ]);
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建陪伴对象', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /怎么称呼/ })
    .fill('阿森');
  await page.getByRole('button', { name: '开始认识 TA' }).click();
  await page.getByRole('textbox', { name: '发送给阿森的消息' }).fill('你好');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].companion.name).toBe('阿森');
  expect(requests[2].messages).toEqual([{ role: 'user', content: '你好' }]);
});

test('offers retry after API failure without duplicating the user message', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/chat', (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 401, json: { error: 'API 密钥无效，请重新填写' } })
      : route.fulfill({
          contentType: 'text/event-stream',
          body: 'data: {"type":"delta","text":"我在这里。"}\n\ndata: {"type":"done","firstTokenMs":20,"totalMs":30}\n\n',
        });
  });
  await page.goto('/');
  await configure(page);
  await openChat(page);
  await page.getByRole('textbox', { name: '发送给小满的消息' }).fill('陪我聊一会儿');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('API 密钥无效');
  await page.getByRole('button', { name: /重试/ }).click();
  await expect(
    page.getByRole('region', { name: '与小满的会话' }).getByText('我在这里。', { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  await expect(page.locator('.message-row.outgoing')).toHaveCount(1);
});

test('rejects malformed imports without replacing existing companions', async ({ page }) => {
  await page.goto('/');
  await navigate(page, '设置');
  await page.getByLabel('导入聊天数据文件').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      '{"version":1,"companions":[],"conversations":{"orphan":[]},"activeId":null}',
    ),
  });
  await page.getByRole('button', { name: '导入并替换', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不存在的对象');
  await navigate(page, '通讯录');
  await expect(page.getByRole('heading', { name: '小满', exact: true })).toBeVisible();
});

test('mobile navigation, modal keyboard dismissal and chat return work without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '手机主导航' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: '创建陪伴对象', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('region', { name: '聊天列表' })
    .getByRole('button', { name: /小满/ })
    .click();
  await expect(page.getByRole('region', { name: '与小满的会话' })).toBeVisible();
  await page.getByRole('button', { name: '返回聊天列表' }).click();
  await page
    .getByRole('navigation', { name: '手机主导航' })
    .getByRole('button', { name: '设置', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /^设置/ })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('keeps requests bounded after 60 rounds while preserving full local history', async ({
  page,
}) => {
  let sentMessages: { content: string }[] = [];
  await page.route('**/api/chat', (route) => {
    sentMessages = route.request().postDataJSON().messages;
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"delta","text":"我记得近期对话。"}\n\ndata: {"type":"done","firstTokenMs":20,"totalMs":30}\n\n',
    });
  });
  await page.goto('/');
  await configure(page);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('zhixin.data.v1')))
    .not.toBeNull();
  await page.addInitScript(() => {
    const data = JSON.parse(localStorage.getItem('zhixin.data.v1')!);
    data.conversations[data.activeId] = Array.from({ length: 120 }, (_, index) => ({
      id: crypto.randomUUID(),
      role: index % 2 ? 'assistant' : 'user',
      content: `历史消息${index}`,
      createdAt: Date.now() - (120 - index) * 1000,
      status: 'complete',
    }));
    localStorage.setItem('zhixin.data.v1', JSON.stringify(data));
  });
  await page.reload();
  await openChat(page);
  await page.getByRole('textbox', { name: '发送给小满的消息' }).fill('第61轮仍然能继续');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: '与小满的会话' })
      .getByText('我记得近期对话。', { exact: true }),
  ).toBeVisible();
  expect(sentMessages).toHaveLength(9);
  expect(sentMessages.at(-1)?.content).toBe('第61轮仍然能继续');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('zhixin.data.v1')!);
        return data.conversations[data.activeId].length;
      }),
    )
    .toBe(122);
});

test('stops an outstanding request and deleting its companion cannot restore orphaned data', async ({
  page,
}) => {
  await page.route('**/api/chat', () => {});
  await page.goto('/');
  await configure(page);
  await openChat(page);
  await page.getByRole('textbox', { name: '发送给小满的消息' }).fill('这条回复等待中');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '停止回复', exact: true }).click();
  await expect(page.getByText('已停止生成', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '发送给小满的消息' }).fill('删除时仍在生成');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '停止回复', exact: true }).waitFor();
  await page.getByRole('button', { name: '更多会话操作' }).click();
  await page.getByRole('button', { name: '对象详情', exact: true }).click();
  await page.getByRole('button', { name: '删除对象', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除对象', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('zhixin.data.v1')!).companions.length),
    )
    .toBe(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('zhixin.data.v1')!));
  expect(dataSchema.safeParse(stored).success).toBe(true);
  expect(Object.keys(stored.conversations)).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: '有些话，想说给懂你的人听' })).toBeVisible();
});

test('clearing data invalidates an API key save already waiting for encryption', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'encrypt', {
      value: async (...args: Parameters<typeof original>) => {
        (window as unknown as Record<string, boolean>).encryptionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const result = await original(...args);
        (window as unknown as Record<string, boolean>).encryptionFinished = true;
        return result;
      },
    });
  });
  await page.goto('/');
  await navigate(page, '设置');
  await page.getByRole('textbox', { name: 'API 密钥', exact: true }).fill(KEY);
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.waitForFunction(
    () => (window as unknown as Record<string, boolean>).encryptionStarted,
  );
  await page.getByRole('button', { name: '清除所有数据', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '清除所有数据', exact: true }).click();
  await page.waitForFunction(
    () => (window as unknown as Record<string, boolean>).encryptionFinished,
  );
  await expect(page.getByRole('textbox', { name: 'API 密钥', exact: true })).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('zhixin.settings.v1'))).toBeNull();
  await page.reload();
  await navigate(page, '设置');
  await expect(page.getByRole('textbox', { name: 'API 密钥', exact: true })).toHaveValue('');
});
