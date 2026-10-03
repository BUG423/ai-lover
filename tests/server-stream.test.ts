import { describe, expect, it } from 'vitest';
import {
  apiBaseUrl,
  completionBody,
  parseCompletionEvent,
  parseSSE,
  trustedOrigins,
} from '../server/upstream';
import { DEFAULT_SETTINGS } from '../shared/catalog';

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
  const allowed = trustedOrigins('https://trusted.example');
  it.each([
    'https://api.siliconflow.com/v1',
    'https://api.siliconflow.cn/v1/',
    'https://api.openai.com',
    'https://trusted.example/',
  ])('allows the exact trusted provider %s', (url) => {
    expect(apiBaseUrl(url, allowed)).toMatch(/^https:\/\/.+\/v1$/u);
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
  ])('rejects untrusted or ambiguous URL %s', (url) => {
    expect(() => apiBaseUrl(url, allowed)).toThrow();
  });

  it('rejects unsafe administrator allowlist entries instead of quietly accepting them', () => {
    expect(() => trustedOrigins('http://internal.example')).toThrow('HTTPS');
    expect(() => trustedOrigins('https://key@trusted.example')).toThrow('凭据');
    expect(() => trustedOrigins('https://trusted.example/path')).toThrow('路径');
  });

  it('only disables thinking where documented, keeping the new default model compatible', () => {
    const body = completionBody(
      { ...DEFAULT_SETTINGS, model: 'Qwen/Qwen3.5-9B' },
      [{ role: 'user', content: '你好' }],
      true,
    );
    expect(body).toMatchObject({ stream: true, max_tokens: 384 });
    expect(body).not.toHaveProperty('enable_thinking');
    expect(
      completionBody({ ...DEFAULT_SETTINGS, model: 'Qwen/Qwen3-8B' }, [], true),
    ).toHaveProperty('enable_thinking', false);
    const openAI = completionBody({ ...DEFAULT_SETTINGS, model: 'gpt-5-mini' }, [], true);
    expect(openAI).toHaveProperty('max_completion_tokens', 384);
    expect(openAI).not.toHaveProperty('temperature');
    expect(openAI).not.toHaveProperty('max_tokens');
  });
});
