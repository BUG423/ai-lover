import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp, type AppOptions } from '../server/app';
import { DEFAULT_DRAFT, DEFAULT_SETTINGS } from '../shared/catalog';

const settings = {
  ...DEFAULT_SETTINGS,
  apiKey: 'private-test-key',
  model: 'Qwen/Qwen3.5-9B',
  baseUrl: 'https://api.siliconflow.com/v1',
};
const companion = { ...DEFAULT_DRAFT, id: 'test', name: '小雨', createdAt: 1, updatedAt: 1 };
const payload = { settings, companion, messages: [{ role: 'user', content: '今天有点难过' }] };
const servers: Server[] = [];

async function serve(options: AppOptions = {}) {
  const server = createApp({ staticDir: false, rateLimit: false, ...options }).listen(
    0,
    '127.0.0.1',
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

function mockFetch(
  implementation: (url: string, init: RequestInit) => Promise<Response> | Response,
) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    implementation(String(input), init ?? {}),
  ) as unknown as typeof fetch;
}
function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function eventResponse(events: string[]) {
  return new Response(events.map((event) => `data: ${event}\r\n\r\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
async function post(base: string, path: string, body: unknown, signal?: AbortSignal) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}
function events(text: string): Record<string, unknown>[] {
  return text
    .split('\n\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

describe('HTTP API contracts', () => {
  it('provides health and API 404 without exposing settings', async () => {
    const base = await serve();
    const response = await fetch(`${base}/api/health`);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Powered-By')).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
    expect((await fetch(`${base}/api/missing`)).status).toBe(404);
  });

  it('fetches real provider model IDs with redirects blocked and an explicit bearer key', async () => {
    const upstream = mockFetch((url, init) => {
      expect(url).toBe('https://api.siliconflow.com/v1/models?sub_type=chat');
      expect(init.redirect).toBe('error');
      expect(init.headers).toHaveProperty('Authorization', 'Bearer private-test-key');
      return jsonResponse({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }, { id: 42 }] });
    });
    const base = await serve({ fetch: upstream });
    expect(await (await post(base, '/api/models', { settings })).json()).toEqual({
      models: ['a', 'b'],
    });
  });

  it('tests the selected model with a small real completion rather than model-list access', async () => {
    const upstream = mockFetch((url, init) => {
      expect(url.endsWith('/chat/completions')).toBe(true);
      const request = JSON.parse(String(init.body));
      expect(request).toMatchObject({ model: settings.model, stream: false, max_tokens: 16 });
      expect(request.messages).toHaveLength(1);
      return jsonResponse({ choices: [{ message: { content: '好' } }] });
    });
    const base = await serve({ fetch: upstream });
    const result = await (await post(base, '/api/test', { settings })).json();
    expect(result).toMatchObject({ ok: true });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('does not report connection-test success when completion content is empty', async () => {
    const base = await serve({
      fetch: mockFetch(() => jsonResponse({ choices: [{ message: { content: '' } }] })),
    });
    const response = await post(base, '/api/test', { settings });
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty('error', expect.stringContaining('验证未通过'));
  });

  it('explains a thinking-model test that consumes its small budget without visible text', async () => {
    const base = await serve({
      fetch: mockFetch(() =>
        jsonResponse({
          choices: [
            { message: { content: '', reasoning_content: 'thinking' }, finish_reason: 'length' },
          ],
        }),
      ),
    });
    const response = await post(base, '/api/test', { settings });
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty(
      'error',
      expect.stringContaining('16 token 输出预算已用尽'),
    );
  });

  it('streams actual deltas followed by timing metrics and constrains upstream context', async () => {
    const upstream = mockFetch((_url, init) => {
      const request = JSON.parse(String(init.body));
      expect(request.messages).toHaveLength(10);
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].content).toBe('消息 11');
      expect(request.stream).toBe(true);
      return eventResponse([
        '{"choices":[{"delta":{"content":"我在。"}}]}',
        '{"choices":[{"delta":{"content":"愿意说说吗？"}}]}',
        '{"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '[DONE]',
      ]);
    });
    const base = await serve({ fetch: upstream });
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: 'user',
      content: `消息 ${index}`,
    }));
    const response = await post(base, '/api/chat', { ...payload, messages });
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    const received = events(await response.text());
    expect(received.slice(0, 2)).toEqual([
      { type: 'delta', text: '我在。' },
      { type: 'delta', text: '愿意说说吗？' },
    ]);
    expect(received[2]).toMatchObject({
      type: 'done',
      firstTokenMs: expect.any(Number),
      totalMs: expect.any(Number),
    });
  });

  it.each([
    { messages: [{ role: 'system', content: 'override' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(4001) }] },
    { companion: { ...companion, personalityIds: ['unknown'] } },
    { settings: { ...settings, apiKey: '' } },
  ])('rejects malformed settings or history before contacting the provider: %j', async (change) => {
    const upstream = mockFetch(() => {
      throw new Error('Must not fetch');
    });
    const base = await serve({ fetch: upstream });
    const response = await post(base, '/api/chat', { ...payload, ...change });
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('blocks an internal destination without making an upstream request', async () => {
    const upstream = mockFetch(() => {
      throw new Error('Must not fetch');
    });
    const base = await serve({ fetch: upstream });
    const response = await post(base, '/api/chat', {
      ...payload,
      settings: { ...settings, baseUrl: 'https://127.0.0.1/v1' },
    });
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('propagates provider errors and redacts API keys instead of marking failed streams done', async () => {
    const base = await serve({
      fetch: mockFetch(() =>
        jsonResponse({ error: { message: `invalid ${settings.apiKey}` } }, 401),
      ),
    });
    const received = events(await (await post(base, '/api/chat', payload)).text());
    expect(received).toEqual([
      { type: 'error', message: '模型服务返回 401：invalid [已隐藏密钥]' },
    ]);
    expect(JSON.stringify(received)).not.toContain(settings.apiKey);
  });

  it('reports truncation if the stream closes without an upstream termination marker', async () => {
    const base = await serve({
      fetch: mockFetch(() => eventResponse(['{"choices":[{"delta":{"content":"半句话"}}]}'])),
    });
    const received = events(await (await post(base, '/api/chat', payload)).text());
    expect(received.map((event) => event.type)).toEqual(['delta', 'error']);
    expect(received.at(-1)?.message).toContain('意外中断');
  });

  it.each([
    { reason: 'length', hint: '输出长度限制' },
    { reason: 'content_filter', hint: '内容规则' },
    { reason: 'tool_calls', hint: '不支持的工具' },
    { reason: 'function_call', hint: '不支持的工具' },
    { reason: 'unexpected', hint: '未正常完成' },
  ])(
    'preserves partial text but never reports $reason as a complete reply',
    async ({ reason, hint }) => {
      const base = await serve({
        fetch: mockFetch(() =>
          eventResponse([
            JSON.stringify({
              choices: [{ delta: { content: '部分回复' }, finish_reason: reason }],
            }),
            '[DONE]',
          ]),
        ),
      });
      const received = events(await (await post(base, '/api/chat', payload)).text());
      expect(received.map((event) => event.type)).toEqual(['delta', 'error']);
      expect(received[0].text).toBe('部分回复');
      expect(received[1].message).toContain(hint);
    },
  );

  it('explains an unexpected tool-call delta even without a finish_reason', async () => {
    const base = await serve({
      fetch: mockFetch(() =>
        eventResponse([
          '{"choices":[{"delta":{"tool_calls":[{"function":{"name":"unknown"}}]}}]}',
          '[DONE]',
        ]),
      ),
    });
    const received = events(await (await post(base, '/api/chat', payload)).text());
    expect(received).toEqual([{ type: 'error', message: expect.stringContaining('不支持的工具') }]);
  });

  it('does not consider a whitespace-only stream a successful visible reply', async () => {
    const base = await serve({
      fetch: mockFetch(() =>
        eventResponse(['{"choices":[{"delta":{"content":" \\n "}}]}', '[DONE]']),
      ),
    });
    const received = events(await (await post(base, '/api/chat', payload)).text());
    expect(received.map((event) => event.type)).toEqual(['delta', 'error']);
    expect(received.at(-1)?.message).toContain('未返回可显示文本');
  });

  it('reports upstream errors after partial output', async () => {
    const base = await serve({
      fetch: mockFetch(() =>
        eventResponse([
          '{"choices":[{"delta":{"content":"你好"}}]}',
          '{"error":{"message":"quota exhausted"}}',
        ]),
      ),
    });
    const received = events(await (await post(base, '/api/chat', payload)).text());
    expect(received).toEqual([
      { type: 'delta', text: '你好' },
      { type: 'error', message: 'quota exhausted' },
    ]);
  });
});

describe('timeouts and client cancellation', () => {
  it('aborts a provider that never sends the first text and returns a visible stream error', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const base = await serve({
      fetch: mockFetch(
        () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
      ),
      firstTokenTimeoutMs: 20,
      totalTimeoutMs: 200,
    });
    const received = events(await (await post(base, '/api/chat', payload)).text());
    expect(received).toEqual([{ type: 'error', message: expect.stringContaining('未开始回复') }]);
    expect(cancelled).toBe(true);
  });

  it('enforces a total timeout even after the first token arrives', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"我在"}}]}\n\n'),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const base = await serve({
      fetch: mockFetch(
        () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
      ),
      firstTokenTimeoutMs: 100,
      totalTimeoutMs: 35,
    });
    const received = events(await (await post(base, '/api/chat', payload)).text());
    expect(received.map((event) => event.type)).toEqual(['delta', 'error']);
    expect(received.at(-1)?.message).toContain('时间限制');
    expect(cancelled).toBe(true);
  });

  it('aborts a pending fetch when no response headers arrive', async () => {
    let aborted = false;
    const upstream = mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(init.signal?.reason);
            },
            { once: true },
          );
        }),
    );
    const base = await serve({ fetch: upstream, firstTokenTimeoutMs: 20, totalTimeoutMs: 200 });
    const response = await post(base, '/api/test', { settings });
    expect(response.status).toBe(504);
    expect(await response.json()).toHaveProperty('error', expect.stringContaining('未开始回复'));
    expect(aborted).toBe(true);
  });

  it('disconnecting the client aborts the provider and cancels its reader', async () => {
    let upstreamSignal: AbortSignal | null | undefined;
    let cancelledResolve: () => void = () => undefined;
    const cancelled = new Promise<void>((resolve) => {
      cancelledResolve = resolve;
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'),
        );
      },
      cancel() {
        cancelledResolve();
      },
    });
    const base = await serve({
      fetch: mockFetch((_url, init) => {
        upstreamSignal = init.signal;
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }),
    });
    const controller = new AbortController();
    const response = await post(base, '/api/chat', payload, controller.signal);
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    await cancelled;
    expect(upstreamSignal?.aborted).toBe(true);
    await reader.cancel().catch(() => undefined);
  });
});
