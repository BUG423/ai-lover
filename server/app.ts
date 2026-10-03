import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildModelMessages } from './prompt';
import { chatRequestSchema, settingsRequestSchema, validationMessage } from './schemas';
import {
  ApiError,
  apiBaseUrl,
  completionBody,
  completionEndError,
  parseCompletionEvent,
  parseSSE,
  readBoundedText,
  requestDeadline,
  requireUpstreamSuccess,
  scrubError,
  trustedOrigins,
} from './upstream';
import type { StreamEvent } from '../shared/types';

export interface AppOptions {
  fetch?: typeof globalThis.fetch;
  allowedOrigins?: Set<string>;
  firstTokenTimeoutMs?: number;
  totalTimeoutMs?: number;
  rateLimit?: boolean;
  staticDir?: string | false;
}

function clientCancellation(req: Request, res: Response) {
  const controller = new AbortController();
  const cancel = () => {
    if (!res.writableFinished) controller.abort(new ApiError('请求已取消', 499));
  };
  req.once('aborted', cancel);
  res.once('close', cancel);
  return {
    signal: controller.signal,
    dispose: () => {
      req.removeListener('aborted', cancel);
      res.removeListener('close', cancel);
    },
  };
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const fetchUpstream = options.fetch ?? globalThis.fetch;
  const allowlist = options.allowedOrigins ?? trustedOrigins();
  const staticDir = options.staticDir === false ? false : (options.staticDir ?? resolve('dist'));
  app.disable('x-powered-by');
  app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (options.rateLimit !== false) {
    app.use(
      '/api',
      rateLimit({
        windowMs: 60_000,
        limit: 60,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: '请求过于频繁，请稍后再试' },
        skip: (req) => req.path === '/health',
      }),
    );
  }
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/models', async (req, res) => {
    const parsed = settingsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { settings } = parsed.data;
    const client = clientCancellation(req, res);
    const deadline = requestDeadline(
      client.signal,
      options.firstTokenTimeoutMs,
      options.totalTimeoutMs,
    );
    try {
      const base = apiBaseUrl(settings.baseUrl, allowlist);
      const response = await fetchUpstream(
        `${base}/models${settings.provider === 'custom' ? '' : '?sub_type=chat'}`,
        {
          headers: { Authorization: `Bearer ${settings.apiKey}`, Accept: 'application/json' },
          signal: deadline.signal,
          redirect: 'error',
        },
      );
      await requireUpstreamSuccess(response, settings.apiKey);
      const body: unknown = JSON.parse(await readBoundedText(response));
      deadline.firstToken();
      if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data))
        throw new ApiError('模型列表格式不正确');
      const models = [
        ...new Set(
          body.data
            .filter((item): item is { id: string } =>
              Boolean(
                item &&
                typeof item === 'object' &&
                typeof item.id === 'string' &&
                item.id.length <= 150,
              ),
            )
            .map((item) => item.id),
        ),
      ].sort();
      if (!models.length) throw new ApiError('该服务没有返回可用模型');
      res.json({ models });
    } catch (error) {
      if (!client.signal.aborted) sendJsonError(res, deadline.error() ?? error, settings.apiKey);
    } finally {
      deadline.close();
      client.dispose();
    }
  });

  app.post('/api/test', async (req, res) => {
    const parsed = settingsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { settings } = parsed.data;
    const client = clientCancellation(req, res);
    const deadline = requestDeadline(
      client.signal,
      options.firstTokenTimeoutMs,
      options.totalTimeoutMs,
    );
    const started = performance.now();
    try {
      const base = apiBaseUrl(settings.baseUrl, allowlist);
      const response = await fetchUpstream(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(
          completionBody(
            settings,
            [{ role: 'user', content: '仅回复“好”。不要解释。' }],
            false,
            16,
          ),
        ),
        signal: deadline.signal,
        redirect: 'error',
      });
      await requireUpstreamSuccess(response, settings.apiKey);
      const body: unknown = JSON.parse(await readBoundedText(response, 100_000));
      deadline.firstToken();
      const completion = body as {
        choices?: {
          message?: {
            content?: unknown;
            refusal?: unknown;
            tool_calls?: unknown;
            function_call?: unknown;
          };
          finish_reason?: string | null;
        }[];
      } | null;
      const choice = completion?.choices?.[0];
      const content = choice?.message?.content ?? choice?.message?.refusal;
      if (choice?.finish_reason === 'length')
        throw new ApiError(
          '连接测试的 16 token 输出预算已用尽，推理模型可能尚未生成可显示文本；请尝试快速模型',
        );
      const toolCalls = choice?.message?.tool_calls;
      const hasToolCalls = Array.isArray(toolCalls) ? toolCalls.length > 0 : Boolean(toolCalls);
      const endError = completionEndError(
        hasToolCalls || choice?.message?.function_call
          ? 'tool_calls'
          : (choice?.finish_reason ?? undefined),
      );
      if (endError) throw new ApiError(endError);
      if (typeof content !== 'string' || !content.trim())
        throw new ApiError('模型未返回可显示文本，连接验证未通过；请尝试其他模型');
      res.json({ ok: true, latencyMs: Math.round(performance.now() - started) });
    } catch (error) {
      if (!client.signal.aborted) sendJsonError(res, deadline.error() ?? error, settings.apiKey);
    } finally {
      deadline.close();
      client.dispose();
    }
  });

  app.post('/api/chat', async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { settings, companion, messages } = parsed.data;
    let base: string;
    try {
      base = apiBaseUrl(settings.baseUrl, allowlist);
    } catch (error) {
      sendJsonError(res, error, settings.apiKey);
      return;
    }
    const client = clientCancellation(req, res);
    const deadline = requestDeadline(
      client.signal,
      options.firstTokenTimeoutMs,
      options.totalTimeoutMs,
    );
    const started = performance.now();
    let firstTokenMs: number | undefined;
    let gotEndMarker = false;
    let outputCharacters = 0;
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(': keepalive\n\n');
    }, 12_000);
    const emit = async (event: StreamEvent) => {
      if (client.signal.aborted || res.destroyed || res.writableEnded) return;
      if (!res.write(`data: ${JSON.stringify(event)}\n\n`))
        await once(res, 'drain', { signal: deadline.signal });
    };
    try {
      const response = await fetchUpstream(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(
          completionBody(settings, buildModelMessages(companion, messages), true),
        ),
        signal: deadline.signal,
        redirect: 'error',
      });
      await requireUpstreamSuccess(response, settings.apiKey);
      if (
        !response.body ||
        !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')
      )
        throw new ApiError('模型服务未返回 SSE 流，请检查模型和 API 地址');
      for await (const event of parseSSE(response.body, deadline.signal)) {
        const delta = parseCompletionEvent(event, settings.apiKey);
        if (delta.text) {
          outputCharacters += delta.text.length;
          if (outputCharacters > 20_000) throw new ApiError('模型回复超过允许长度，已停止本次请求');
          if (firstTokenMs === undefined && delta.text.trim()) {
            firstTokenMs = Math.round(performance.now() - started);
            deadline.firstToken();
          }
          await emit({ type: 'delta', text: delta.text });
        }
        const endError = completionEndError(delta.finishReason);
        if (endError) throw new ApiError(endError);
        if (delta.finished) gotEndMarker = true;
        if (delta.done) {
          gotEndMarker = true;
          break;
        }
      }
      if (deadline.signal.aborted) throw deadline.error() || new ApiError('请求已取消');
      if (firstTokenMs === undefined) throw new ApiError('模型未返回可显示文本，请切换模型重试');
      if (!gotEndMarker) throw new ApiError('模型连接意外中断，回复可能不完整，请重试');
      await emit({ type: 'done', firstTokenMs, totalMs: Math.round(performance.now() - started) });
    } catch (error) {
      if (!client.signal.aborted) {
        const actual = deadline.error() ?? error;
        // A deadline also aborts upstream; the final error can still be written to the live client.
        if (!res.destroyed && !res.writableEnded)
          res.write(
            `data: ${JSON.stringify({ type: 'error', message: safeError(actual, settings.apiKey).message })}\n\n`,
          );
      }
    } finally {
      clearInterval(heartbeat);
      deadline.close();
      client.dispose();
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API 接口不存在' });
  });
  if (staticDir && existsSync(resolve(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/u, (_req, res) => {
      res.sendFile(resolve(staticDir, 'index.html'));
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500;
    if (status === 413) {
      res.status(413).json({ error: '请求内容过长，请缩短消息或补充资料' });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: '请求不是有效的 JSON' });
      return;
    }
    res.status(500).json({ error: '服务器暂时不可用' });
  });
  return app;
}

function safeError(error: unknown, apiKey: string): ApiError {
  if (error instanceof ApiError)
    return new ApiError(scrubError(error.message, apiKey), error.status);
  if (error instanceof SyntaxError) return new ApiError('模型服务返回了无法解析的响应');
  return new ApiError('无法连接模型服务，请检查网络、API 地址及账户状态后重试');
}
function sendJsonError(res: Response, error: unknown, apiKey: string) {
  const safe = safeError(error, apiKey);
  if (!res.destroyed && !res.headersSent) res.status(safe.status).json({ error: safe.message });
}
