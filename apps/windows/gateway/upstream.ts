import type { ApiSettings } from '../../../packages/core/types';
import { validProviderBaseUrl } from '../../../packages/core/providers';
import type { ModelMessage } from '../../../packages/core/prompt';

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiBaseUrl(raw: string, provider: ApiSettings['provider']): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError('API 地址格式不正确', 400);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[?#\\\r\n\u0000]/u.test(raw)
  ) {
    throw new ApiError('API 地址必须为 HTTPS，且不能包含用户名、密码、查询或片段', 400);
  }
  const rawPath = raw.match(/^https:\/\/[^/?#]+([^?#]*)/iu)?.[1];
  if (!['/v1', '/v1/'].includes(rawPath ?? 'invalid') || !['/v1', '/v1/'].includes(url.pathname))
    throw new ApiError('API 地址路径仅支持 /v1', 400);
  const base = `${url.origin}/v1`;
  if (!validProviderBaseUrl(provider, raw)) {
    throw new ApiError('API 地址与所选服务不匹配；仅支持小米 MiMo 和硅基流动官方端点', 400);
  }
  return base;
}

export function providerHeaders(settings: ApiSettings): Record<string, string> {
  return settings.provider === 'mimo'
    ? { 'api-key': settings.apiKey }
    : { Authorization: `Bearer ${settings.apiKey}` };
}

export function connectionTestTokens(settings: ApiSettings): number {
  return settings.provider === 'mimo' ? 32 : 16;
}

export function scrubError(message: string, apiKey: string): string {
  let result = message;
  if (apiKey) result = result.split(apiKey).join('[已隐藏密钥]');
  return result.replace(/Bearer\s+[^\s"',;]+/giu, 'Bearer [已隐藏密钥]').slice(0, 280);
}

export async function readBoundedText(response: Response, limit = 2_000_000): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new ApiError('上游响应超过允许大小');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function requireUpstreamSuccess(response: Response, apiKey: string): Promise<void> {
  if (response.ok) return;
  let detail = '';
  try {
    const body: unknown = JSON.parse(await readBoundedText(response, 16_000));
    if (body && typeof body === 'object' && 'error' in body) {
      const error = (body as { error: unknown }).error;
      if (typeof error === 'string') detail = error;
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      )
        detail = error.message;
    } else if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
    )
      detail = body.message;
  } catch {
    /* HTML error pages and invalid JSON are never exposed to the client. */
  }
  const hints: Record<number, string> = {
    401: 'API Key 无效或已过期',
    403: '没有权限访问该服务或模型',
    404: '模型或接口不存在',
    429: '上游限流或余额不足，请检查账户后重试',
  };
  throw new ApiError(
    scrubError(
      `模型服务返回 ${response.status}：${detail || hints[response.status] || '服务暂时不可用'}`,
      apiKey,
    ),
    response.status === 429 ? 429 : 502,
  );
}

export interface RequestDeadline {
  signal: AbortSignal;
  firstToken(): void;
  close(): void;
  error(): ApiError | undefined;
}
export function requestDeadline(
  clientSignal: AbortSignal,
  firstTokenMs = 30_000,
  totalMs = 90_000,
): RequestDeadline {
  const controller = new AbortController();
  let error: ApiError | undefined;
  const fail = (message: string) => {
    error = new ApiError(message, 504);
    controller.abort(error);
  };
  const firstTimer = setTimeout(
    () => fail('模型 30 秒内未开始回复，请重试或切换更快的模型'),
    firstTokenMs,
  );
  const totalTimer = setTimeout(() => fail('回复超过时间限制，已停止本次请求'), totalMs);
  const onClientAbort = () => controller.abort(clientSignal.reason);
  clientSignal.addEventListener('abort', onClientAbort, { once: true });
  if (clientSignal.aborted) onClientAbort();
  return {
    signal: controller.signal,
    firstToken: () => clearTimeout(firstTimer),
    error: () => error,
    close: () => {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      clientSignal.removeEventListener('abort', onClientAbort);
    },
  };
}

const NON_THINKING_MODELS = new Set([
  'Qwen/Qwen3-8B',
  'Qwen/Qwen3-14B',
  'Qwen/Qwen3-32B',
  'Qwen/Qwen3-30B-A3B',
  'Qwen/Qwen3-235B-A22B',
]);
export function completionBody(
  settings: ApiSettings,
  messages: ModelMessage[],
  stream: boolean,
  tokenLimit = 384,
): Record<string, unknown> {
  return {
    model: settings.model,
    messages,
    stream,
    ...(settings.provider === 'mimo'
      ? {
          max_completion_tokens: tokenLimit,
          temperature: Math.min(settings.temperature, 1.5),
          thinking: { type: 'disabled' },
        }
      : { max_tokens: tokenLimit, temperature: settings.temperature }),
    ...(settings.provider !== 'mimo' && NON_THINKING_MODELS.has(settings.model)
      ? { enable_thinking: false }
      : {}),
  };
}

/** Parses actual SSE frames across arbitrary byte boundaries, including CRLF and UTF-8 splits. */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let eventCharacters = 0;
  let aborted = false;
  const cancel = () => {
    aborted = true;
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const consumeLine = (line: string): string | undefined => {
    if (line === '') {
      const event = data.length ? data.join('\n') : undefined;
      data = [];
      eventCharacters = 0;
      return event;
    }
    if (line.startsWith('data:')) {
      eventCharacters += line.length;
      if (eventCharacters > 1_000_000) throw new ApiError('模型流数据异常：单个事件过长');
      data.push(line.slice(5).replace(/^ /u, ''));
    }
    return undefined;
  };
  try {
    while (true) {
      if (aborted) throw signal?.reason || new ApiError('请求已取消');
      const chunk = await reader.read();
      if (aborted) throw signal?.reason || new ApiError('请求已取消');
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 1_000_000) throw new ApiError('模型流数据异常：单个事件过长');
      let match: RegExpExecArray | null;
      // Leave a final CR until the next byte is available, so a split CRLF stays one newline.
      while ((match = /\r\n|\n|\r(?!$)/u.exec(buffer))) {
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const event = consumeLine(line);
        if (event !== undefined) yield event;
      }
      if (chunk.done) break;
    }
    if (buffer.endsWith('\r')) buffer = buffer.slice(0, -1);
    if (buffer) {
      const event = consumeLine(buffer);
      if (event !== undefined) yield event;
    }
    if (data.length) yield data.join('\n');
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export interface CompletionDelta {
  text?: string;
  finished?: boolean;
  finishReason?: string;
  done?: boolean;
}

export function completionEndError(finishReason?: string): string | undefined {
  if (!finishReason || finishReason === 'stop') return;
  if (finishReason === 'length')
    return '模型达到输出长度限制，回复可能不完整；请重试或要求简短回复';
  if (finishReason === 'content_filter') return '模型服务因内容规则停止了回复，请调整消息后重试';
  if (finishReason === 'tool_calls' || finishReason === 'function_call')
    return '模型尝试调用当前聊天不支持的工具，请切换模型后重试';
  return '模型未正常完成回复，请切换模型或稍后重试';
}

export function parseCompletionEvent(data: string, apiKey: string): CompletionDelta {
  if (data.trim() === '[DONE]') return { done: true };
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new ApiError('模型返回了无法解析的流数据');
  }
  if (!value || typeof value !== 'object') throw new ApiError('模型返回了无效的流数据');
  if ('error' in value) {
    const error = value.error;
    const message =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : '模型流中断';
    throw new ApiError(scrubError(message, apiKey));
  }
  if (!('choices' in value) || !Array.isArray(value.choices))
    throw new ApiError('模型返回了无效的流数据');
  const choice = value.choices[0] as
    | {
        delta?: {
          content?: unknown;
          refusal?: unknown;
          tool_calls?: unknown;
          function_call?: unknown;
        };
        finish_reason?: string | null;
      }
    | undefined;
  const content = choice?.delta?.content ?? choice?.delta?.refusal;
  if (content !== undefined && content !== null && typeof content !== 'string')
    throw new ApiError('模型返回了不支持的文本格式');
  const toolCalls = choice?.delta?.tool_calls;
  const hasToolCalls = Array.isArray(toolCalls) ? toolCalls.length > 0 : Boolean(toolCalls);
  const finishReason =
    hasToolCalls || choice?.delta?.function_call ? 'tool_calls' : choice?.finish_reason;
  if (finishReason !== undefined && finishReason !== null && typeof finishReason !== 'string')
    throw new ApiError('模型返回了无效的终止标记');
  return {
    text: typeof content === 'string' ? content : undefined,
    finished: Boolean(finishReason),
    ...(finishReason ? { finishReason } : {}),
  };
}
