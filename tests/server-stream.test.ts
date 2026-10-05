import { describe, expect, it } from 'vitest';
import {
  apiBaseUrl,
  completionBody,
  connectionTestTokens,
  parseCompletionEvent,
  parseSSE,
  providerHeaders,
} from '../server/upstream';
import { DEFAULT_SETTINGS } from '../shared/catalog';
import type { ApiSettings } from '../shared/types';

function fragmented(text: string, chunkSize = 1): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize)
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      controller.close();
    },
  });
}

describe('actual upstream SSE parsing', () => {
  it('parses UTF-8, CRLF, comments, role metadata and DONE even when each byte is separate', async () => {
    const frames = [
      ': ping\r\n\r\n',
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"你好，🌷"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\r\n\r\n',
      'data: [DONE]\r\n\r\n',
    ];
    const events = [];
    for await (const data of parseSSE(fragmented(frames.join(''))))
      events.push(parseCompletionEvent(data, 'secret'));
    expect(events).toEqual([
      { text: undefined, finished: false },
      { text: '你好，🌷', finished: false },
      { text: undefined, finished: true, finishReason: 'stop' },
      { done: true },
    ]);
  });

  it('joins multiple data lines and accepts a final event without a newline', async () => {
    const text =
      'event: message\ndata: {"choices":\ndata: [{"delta":{"content":"一起走走"}}]}\n\ndata: [DONE]';
    const events = [];
    for await (const data of parseSSE(fragmented(text, 3)))
      events.push(parseCompletionEvent(data, ''));
    expect(events[0].text).toBe('一起走走');
    expect(events.at(-1)).toEqual({ done: true });
  });

  it('surfaces malformed events and upstream error frames without revealing a key', () => {
    expect(() => parseCompletionEvent('{bad', 'secret')).toThrow('无法解析');
    expect(() => parseCompletionEvent('{"error":{"message":"invalid secret"}}', 'secret')).toThrow(
      'invalid [已隐藏密钥]',
    );
    expect(() => parseCompletionEvent('{"choices":[{"delta":{"content":42}}]}', '')).toThrow(
      '不支持的文本格式',
    );
    expect(parseCompletionEvent('{"choices":[],"usage":{"total_tokens":10}}', '')).toEqual({
      text: undefined,
      finished: false,
    });
    expect(
      parseCompletionEvent('{"choices":[{"delta":{"content":"你好","tool_calls":[]}}]}', ''),
    ).toEqual({ text: '你好', finished: false });
  });

  it('cancels a blocked upstream reader when the request aborts', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const iterator = parseSSE(stream, controller.signal);
    const next = iterator.next();
    const rejected = expect(next).rejects.toThrow('cancelled by user');
    controller.abort(new Error('cancelled by user'));
    await rejected;
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });
});

describe('provider compatibility and SSRF boundaries', () => {
  it.each([
    { provider: 'siliconflow' as const, url: 'https://api.siliconflow.cn/v1/' },
    { provider: 'mimo' as const, url: 'https://api.xiaomimimo.com/v1' },
    { provider: 'mimo' as const, url: 'https://api.xiaomimimo.com/v1/' },
    { provider: 'mimo' as const, url: 'https://token-plan-cn.xiaomimimo.com/v1' },
    { provider: 'mimo' as const, url: 'https://token-plan-sgp.xiaomimimo.com/v1' },
    { provider: 'mimo' as const, url: 'https://token-plan-ams.xiaomimimo.com/v1/' },
  ])('allows the exact provider endpoint $url', ({ provider, url }) => {
    expect(apiBaseUrl(url, provider)).toBe(url.replace(/\/$/u, ''));
  });

  it.each([
    'http://api.siliconflow.com/v1',
    'http://127.0.0.1:3001/v1',
    'https://localhost/v1',
    'https://api.siliconflow.com.evil.example/v1',
    'https://evil.example@api.siliconflow.com/v1',
    'https://api.siliconflow.com:444/v1',
    'https://api.siliconflow.com/v1?redirect=evil',
    'https://api.siliconflow.com/v1?',
    'https://api.siliconflow.com/v1#',
    'https://api.siliconflow.com/v1#fragment',
    'https://api.siliconflow.com/admin',
    'https://api.siliconflow.com/../v1',
    'https://api.siliconflow.com\\@evil.example/v1',
    'https://api.siliconflow.com',
    'https://api.siliconflow.com:443/v1',
    'https://api.openai.com/v1',
    'https://trusted.example/v1',
    'https://token-plan-cn.xiaomimimo.com/v1',
    'https://token-plan-sgp.xiaomimimo.com/v1',
    'https://token-plan-ams.xiaomimimo.com/v1',
    'https://api.xiaomimimo.com/v1/coding',
  ])('rejects untrusted or ambiguous URL %s', (url) => {
    expect(() => apiBaseUrl(url, 'siliconflow')).toThrow();
  });

  it.each([
    { provider: 'mimo' as const, url: 'https://api.siliconflow.com/v1' },
    { provider: 'siliconflow' as const, url: 'https://api.siliconflow.com/v1' },
    { provider: 'siliconflow' as const, url: 'https://api.xiaomimimo.com/v1' },
    {
      provider: 'siliconflow' as const,
      url: 'https://token-plan-cn.xiaomimimo.com/v1',
    },
  ])('prevents a key for $provider from being sent to $url', ({ provider, url }) => {
    expect(() => apiBaseUrl(url, provider)).toThrow('不匹配');
  });

  it('does not permit the removed custom provider or an environment allowlist override', () => {
    const previous = process.env.ALLOWED_API_ORIGINS;
    process.env.ALLOWED_API_ORIGINS = 'https://trusted.example';
    try {
      expect(() =>
        apiBaseUrl('https://trusted.example/v1', 'custom' as ApiSettings['provider']),
      ).toThrow('不匹配');
      expect(() => apiBaseUrl('https://trusted.example/v1', 'mimo')).toThrow('不匹配');
    } finally {
      if (previous === undefined) delete process.env.ALLOWED_API_ORIGINS;
      else process.env.ALLOWED_API_ORIGINS = previous;
    }
  });

  it('only sends SiliconFlow enable_thinking for documented model IDs', () => {
    const body = completionBody(
      { ...DEFAULT_SETTINGS, provider: 'siliconflow', model: 'Qwen/Qwen3.5-9B' },
      [{ role: 'user', content: '你好' }],
      true,
    );
    expect(body).toMatchObject({ stream: true, max_tokens: 384 });
    expect(body).not.toHaveProperty('enable_thinking');
    expect(
      completionBody(
        { ...DEFAULT_SETTINGS, provider: 'siliconflow', model: 'Qwen/Qwen3-8B' },
        [],
        true,
      ),
    ).toHaveProperty('enable_thinking', false);
  });

  it('uses MiMo-specific auth and disables thinking with the documented request shape', () => {
    const mimo = {
      ...DEFAULT_SETTINGS,
      provider: 'mimo' as const,
      model: 'mimo-v2.6-flash',
      temperature: 2,
      apiKey: 'fake-mimo-test-key',
    };
    const body = completionBody(mimo, [{ role: 'user', content: '你好' }], true);
    expect(body).toMatchObject({
      model: 'mimo-v2.6-flash',
      stream: true,
      max_completion_tokens: 384,
      temperature: 1.5,
      thinking: { type: 'disabled' },
    });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('enable_thinking');
    expect(providerHeaders(mimo)).toEqual({ 'api-key': 'fake-mimo-test-key' });
    expect(connectionTestTokens(mimo)).toBe(32);
    expect(providerHeaders({ ...mimo, provider: 'siliconflow' })).toEqual({
      Authorization: 'Bearer fake-mimo-test-key',
    });
    expect(connectionTestTokens({ ...mimo, provider: 'siliconflow' })).toBe(16);
  });
});
