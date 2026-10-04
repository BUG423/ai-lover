import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { z } from 'zod';
import { buildModelMessages, type ModelMessage } from '../../shared/prompt';
import type { ApiSettings, StreamEvent } from '../../shared/types';
import { companionSchema, settingsSchema } from './validation';

interface GatewayBody {
  settings: ApiSettings;
  messages?: ModelMessage[];
}

interface NativeEvent extends StreamEvent {
  id: string;
}

interface NativeResult {
  status: number;
  body: unknown;
}

interface ModelGatewayPlugin {
  request(options: {
    id: string;
    path: '/api/models' | '/api/test';
    body: GatewayBody;
  }): Promise<NativeResult>;
  stream(options: { id: string; body: GatewayBody }): Promise<unknown>;
  cancel(options: { id: string }): Promise<unknown>;
  addListener(
    eventName: 'event',
    callback: (event: NativeEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const ModelGateway = registerPlugin<ModelGatewayPlugin>('ModelGateway');
const messagesSchema = z
  .array(
    z.discriminatedUnion('role', [
      z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(4000) }),
      z.object({ role: z.literal('assistant'), content: z.string().min(1).max(20_000) }),
    ]),
  )
  .min(1)
  .max(120)
  .refine((messages) => messages.at(-1)?.role === 'user', '最后一条消息必须来自用户');

function prepareBody(path: string, input: unknown): GatewayBody {
  const raw = z
    .object({
      settings: z.unknown(),
      companion: z.unknown().optional(),
      messages: z.unknown().optional(),
    })
    .parse(input);
  const settings = settingsSchema.parse(raw.settings);
  if (!settings.apiKey) throw new Error('请先填写 API Key');
  if (/[\r\n\u0000]/u.test(settings.apiKey)) throw new Error('API Key 格式不正确');
  if (/[\r\n\u0000]/u.test(settings.model)) throw new Error('模型名称格式不正确');
  if (path !== '/api/chat') return { settings };
  const companion = companionSchema.parse(raw.companion);
  const messages = messagesSchema.parse(raw.messages);
  return { settings, messages: buildModelMessages(companion, messages) };
}

function abortError(): DOMException {
  return new DOMException('请求已取消', 'AbortError');
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '原生模型连接失败，请重试';
}
function cancel(id: string): void {
  void ModelGateway.cancel({ id }).catch(() => undefined);
}

/** A slow native bridge must not keep the UI busy after the user cancels. */
function waitForNative<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
  onLateResult?: (value: T) => void,
): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    void operation.then(
      (value) => {
        if (settled) {
          onLateResult?.(value);
          return;
        }
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** Keep the native transport compatible with the web Response/SSE reader. */
export async function nativePost(
  path: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  if (!Capacitor.isNativePlatform()) throw new Error('原生模型网关仅在安装的应用中可用');
  if (!['/api/chat', '/api/models', '/api/test'].includes(path))
    throw new Error('不支持的原生接口');
  if (signal?.aborted) throw abortError();
  const body = prepareBody(path, input);
  const id = crypto.randomUUID();
  if (path === '/api/chat') return streamResponse(id, body, signal);
  const result = await requestResult(id, path as '/api/models' | '/api/test', body, signal);
  if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599)
    throw new Error('原生服务返回了无效状态');
  const empty = [204, 205, 304].includes(result.status);
  return new Response(empty ? null : JSON.stringify(result.body ?? null), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function requestResult(
  id: string,
  path: '/api/models' | '/api/test',
  body: GatewayBody,
  signal?: AbortSignal,
): Promise<NativeResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const clean = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clean();
      cancel(id);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    void ModelGateway.request({ id, path, body }).then(
      (result) => {
        if (settled) return;
        settled = true;
        clean();
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clean();
        reject(error);
      },
    );
  });
}

async function streamResponse(
  id: string,
  body: GatewayBody,
  signal?: AbortSignal,
): Promise<Response> {
  const encoder = new TextEncoder();
  let listener: PluginListenerHandle | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  const clean = () => {
    signal?.removeEventListener('abort', onAbort);
    if (listener) {
      const handle = listener;
      listener = undefined;
      void handle.remove().catch(() => undefined);
    }
  };
  const onAbort = () => {
    if (closed) return;
    closed = true;
    cancel(id);
    controller?.error(abortError());
    clean();
  };
  const emit = (event: StreamEvent) => {
    if (closed) return;
    controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    if (event.type === 'done' || event.type === 'error') {
      closed = true;
      controller?.close();
      clean();
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel() {
      if (!closed) {
        closed = true;
        cancel(id);
      }
      clean();
    },
  });
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) {
    onAbort();
    throw abortError();
  }
  try {
    listener = await waitForNative(
      ModelGateway.addListener('event', (event) => {
        if (event.id !== id || closed) return;
        if (event.type === 'delta') {
          if (typeof event.text !== 'string') {
            emit({ type: 'error', message: '原生服务返回了无效的回复' });
            cancel(id);
          } else emit({ type: 'delta', text: event.text });
        } else if (event.type === 'done') {
          emit({ type: 'done', firstTokenMs: event.firstTokenMs, totalMs: event.totalMs });
        } else if (event.type === 'error') {
          emit({ type: 'error', message: event.message || '回复生成失败，请重试' });
        } else {
          emit({ type: 'error', message: '原生服务返回了未知消息类型' });
          cancel(id);
        }
      }),
      signal,
      (handle) => {
        void handle.remove().catch(() => undefined);
      },
    );
    // Aborting while the native listener was being registered must not start a request.
    if (signal?.aborted || closed) {
      clean();
      throw abortError();
    }
    await waitForNative(ModelGateway.stream({ id, body }), signal);
    if (signal?.aborted) throw abortError();
  } catch (error) {
    if (signal?.aborted) {
      onAbort();
      clean();
      throw abortError();
    }
    emit({ type: 'error', message: errorMessage(error) });
  }
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
