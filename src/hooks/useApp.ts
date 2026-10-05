import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from '../../shared/catalog';
import type { ApiSettings, AppData, CompanionDraft, Message } from '../../shared/types';
import {
  clearStoredData,
  loadData,
  loadSettings,
  persistData,
  persistSettings,
} from '../lib/storage';
import { draftSchema, settingsSchema, validationError } from '../lib/validation';
import { consumeEvents } from '../lib/sse';
import { recentMessages } from '../../shared/context';
import { mimoEndpoint } from '../../shared/providers';
import { Capacitor } from '@capacitor/core';
import { nativePost } from '../lib/nativeGateway';

type Notice = { kind: 'success' | 'error' | 'info'; message: string };
async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.error || body.message || `请求失败（${response.status}）`;
  } catch {
    return `服务暂时不可用（${response.status}）`;
  }
}
async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const response = Capacitor.isNativePlatform()
    ? await nativePost(path, body, signal)
    : await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

export default function useApp() {
  const [initial] = useState(loadData);
  const [data, setData] = useState<AppData>(initial.data);
  const dataRef = useRef(data);
  const [settings, setSettings] = useState<ApiSettings>({ ...DEFAULT_SETTINGS });
  const settingsRef = useRef(settings);
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState({ chat: false, test: false, models: false });
  const [notice, setNotice] = useState<Notice | null>(
    initial.warning ? { kind: 'error', message: initial.warning } : null,
  );
  const [lastMetrics, setLastMetrics] = useState<{ firstTokenMs: number; totalMs: number } | null>(
    null,
  );
  const generation = useRef<{
    controller: AbortController;
    companionId: string;
    messageId: string;
  } | null>(null);
  const canPersist = useRef(!initial.warning);
  const saving = useRef(false);
  const auxiliaryControllers = useRef(new Set<AbortController>());
  const operationEpoch = useRef(0);
  const serviceEpoch = useRef(0);
  const modelsLoading = useRef(false);
  const testing = useRef(false);

  const change = (update: (data: AppData) => AppData) => {
    const next = update(dataRef.current);
    dataRef.current = next;
    setData(next);
  };
  useEffect(() => {
    let alive = true;
    const epoch = operationEpoch.current;
    void loadSettings().then((result) => {
      if (!alive || epoch !== operationEpoch.current) return;
      settingsRef.current = result.settings;
      setSettings(result.settings);
      setReady(true);
      if (result.warning) setNotice({ kind: 'error', message: result.warning });
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!canPersist.current) return;
    const timer = window.setTimeout(() => {
      try {
        persistData(data);
      } catch {
        setNotice({
          kind: 'error',
          message: '本机存储空间不足，最新聊天尚未保存，请释放设备空间。',
        });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [data]);
  useEffect(() => {
    const save = () => {
      if (canPersist.current) {
        try {
          persistData(dataRef.current);
        } catch {
          /* UI already reports storage failures. */
        }
      }
    };
    window.addEventListener('pagehide', save);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
      generation.current?.controller.abort();
      for (const c of auxiliaryControllers.current) c.abort();
    };
  }, []);

  function requireWritable(): boolean {
    if (canPersist.current) return true;
    setNotice({
      kind: 'error',
      message: '原始资料读取失败，数据已保留，请先修复本机存储或在设置中清除数据。',
    });
    return false;
  }
  function updateMessage(
    companionId: string,
    messageId: string,
    update: (message: Message) => Message,
  ) {
    const existing = dataRef.current.conversations[companionId];
    if (
      !dataRef.current.companions.some((c) => c.id === companionId) ||
      !existing?.some((m) => m.id === messageId)
    )
      return;
    change((old) => ({
      ...old,
      conversations: {
        ...old.conversations,
        [companionId]: existing.map((m) => (m.id === messageId ? update(m) : m)),
      },
    }));
  }
  function stopGeneration() {
    generation.current?.controller.abort();
  }
  function setActiveId(id: string | null) {
    if (id && !dataRef.current.companions.some((c) => c.id === id)) return;
    if (!requireWritable()) return;
    if (id !== dataRef.current.activeId) stopGeneration();
    setLastMetrics(null);
    change((old) => ({ ...old, activeId: id }));
  }
  function createCompanion(input: CompanionDraft): string {
    if (!requireWritable()) return '';
    try {
      if (dataRef.current.companions.length >= 100) throw new Error('最多创建 100 位对象');
      const draft = draftSchema.parse(input);
      const id = crypto.randomUUID();
      const now = Date.now();
      stopGeneration();
      setLastMetrics(null);
      change((old) => ({
        ...old,
        companions: [...old.companions, { ...draft, id, createdAt: now, updatedAt: now }],
        conversations: { ...old.conversations, [id]: [] },
        activeId: id,
      }));
      setNotice({ kind: 'success', message: `${draft.name}已加入你的通讯录` });
      return id;
    } catch (error) {
      setNotice({ kind: 'error', message: validationError(error) });
      return '';
    }
  }
  function updateCompanion(id: string, input: CompanionDraft) {
    if (!requireWritable()) return;
    try {
      const draft = draftSchema.parse(input);
      if (generation.current?.companionId === id) stopGeneration();
      change((old) => ({
        ...old,
        companions: old.companions.map((c) =>
          c.id === id ? { ...c, ...draft, updatedAt: Date.now() } : c,
        ),
      }));
      setNotice({ kind: 'success', message: '对象设定已更新，下次回复会使用新设定' });
    } catch (error) {
      setNotice({ kind: 'error', message: validationError(error) });
    }
  }
  function deleteCompanion(id: string) {
    if (!requireWritable()) return;
    if (generation.current?.companionId === id) stopGeneration();
    change((old) => {
      const companions = old.companions.filter((c) => c.id !== id);
      const conversations = { ...old.conversations };
      delete conversations[id];
      return {
        ...old,
        companions,
        conversations,
        activeId: old.activeId === id ? (companions[0]?.id ?? null) : old.activeId,
      };
    });
    setNotice({ kind: 'success', message: '对象及聊天记录已删除' });
  }
  async function generate(content?: string, retry = false) {
    if (generation.current || !requireWritable()) return;
    const companionId = dataRef.current.activeId;
    const companion = dataRef.current.companions.find((c) => c.id === companionId);
    if (!companion || !companionId) {
      setNotice({ kind: 'info', message: '先创建或选择一位对象' });
      return;
    }
    if (!settingsRef.current.apiKey) {
      setNotice({ kind: 'info', message: '请先在设置中填写 API Key 并保存，再开始真实对话' });
      return;
    }
    const text = content?.trim();
    if (!retry && !text) return;
    if (text && text.length > 4000) {
      setNotice({ kind: 'error', message: '单条消息最多 4000 个字' });
      return;
    }
    let history = [...(dataRef.current.conversations[companionId] || [])];
    if (!retry && history.length > 4998) {
      setNotice({
        kind: 'info',
        message: '这段聊天已达到 5000 条记录上限，请创建新对象继续聊天。',
      });
      return;
    }
    if (retry) {
      if (history.at(-1)?.role === 'assistant' && history.at(-1)?.status !== 'complete')
        history.pop();
      if (history.at(-1)?.role !== 'user') {
        setNotice({ kind: 'info', message: '没有需要重试的消息' });
        return;
      }
    } else
      history.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: text!,
        createdAt: Date.now(),
        status: 'complete',
      });
    const context = recentMessages(
      (settingsRef.current.remember ? history : history.slice(-1))
        .filter((m) => m.status === 'complete' && m.content && !m.excludeFromContext)
        .map(({ role, content }) => ({ role, content })),
    );
    const messageId = crypto.randomUUID();
    history.push({
      id: messageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'streaming',
    });
    change((old) => ({ ...old, conversations: { ...old.conversations, [companionId]: history } }));
    const controller = new AbortController();
    let timeoutMessage: string | null = null;
    const expire = (message: string) => {
      timeoutMessage = message;
      controller.abort();
    };
    const firstTokenTimer = window.setTimeout(
      () => expire('连接长时间没有回复，请检查网络或切换模型后重试'),
      32000,
    );
    const totalTimer = window.setTimeout(() => expire('回复超时，已停止本次请求，请重试'), 95000);
    generation.current = { controller, companionId, messageId };
    setBusy((old) => ({ ...old, chat: true }));
    setNotice(null);
    setLastMetrics(null);
    let streamFailure: string | null = null;
    try {
      const response = await post(
        '/api/chat',
        { settings: settingsRef.current, companion, messages: context },
        controller.signal,
      );
      await consumeEvents(response, (event) => {
        if (controller.signal.aborted) return;
        if (event.type === 'delta') {
          if (event.text?.trim()) clearTimeout(firstTokenTimer);
          updateMessage(companionId, messageId, (m) => ({ ...m, content: m.content + event.text }));
        }
        if (event.type === 'error') streamFailure = event.message || '回复生成失败，请重试';
        if (event.type === 'done') {
          updateMessage(companionId, messageId, (m) => ({ ...m, status: 'complete' }));
          setLastMetrics({ firstTokenMs: event.firstTokenMs ?? 0, totalMs: event.totalMs ?? 0 });
        }
      });
      if (streamFailure) throw new Error(streamFailure);
    } catch (error) {
      const stopped = controller.signal.aborted && !timeoutMessage;
      const message = timeoutMessage || (stopped ? '已停止生成' : validationError(error));
      updateMessage(companionId, messageId, (m) => ({
        ...m,
        status: stopped ? 'stopped' : 'error',
        error: message,
      }));
      if (!stopped) setNotice({ kind: 'error', message });
    } finally {
      clearTimeout(firstTokenTimer);
      clearTimeout(totalTimer);
      if (generation.current?.messageId === messageId) generation.current = null;
      setBusy((old) => ({ ...old, chat: false }));
    }
  }
  async function saveSettings(input: ApiSettings) {
    if (saving.current) return;
    saving.current = true;
    const epoch = operationEpoch.current;
    try {
      const next = settingsSchema.parse(input);
      stopGeneration();
      clearModels();
      const encrypted = await persistSettings(next, () => epoch === operationEpoch.current);
      if (epoch !== operationEpoch.current) return;
      settingsRef.current = next;
      setSettings(next);
      setModels([]);
      setNotice({
        kind: encrypted ? 'success' : 'info',
        message: encrypted
          ? '设置已保存，API Key 已在本机加密存储'
          : '设置已保存。当前环境不支持加密，API Key 仅在本次会话有效，请使用 HTTPS 或 localhost。',
      });
    } catch (error) {
      setNotice({ kind: 'error', message: validationError(error) });
    } finally {
      saving.current = false;
    }
  }
  function clearModels() {
    serviceEpoch.current++;
    for (const controller of auxiliaryControllers.current) controller.abort();
    setModels([]);
  }
  async function serviceAction(kind: 'models' | 'test', input = settingsRef.current) {
    const flag = kind === 'models' ? modelsLoading : testing;
    if (flag.current) return;
    flag.current = true;
    const epoch = operationEpoch.current;
    const requestEpoch = serviceEpoch.current;
    const controller = new AbortController();
    auxiliaryControllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 35000);
    try {
      const next = settingsSchema.parse(input);
      if (!next.apiKey) throw new Error('请先填写 API Key');
      setBusy((old) => ({ ...old, [kind]: true }));
      const result = await (
        await post(`/api/${kind}`, { settings: next }, controller.signal)
      ).json();
      if (epoch !== operationEpoch.current || requestEpoch !== serviceEpoch.current) return;
      if (kind === 'models') {
        setModels(result.models);
        setNotice({ kind: 'success', message: `已读取 ${result.models.length} 个可用模型` });
      } else
        setNotice({
          kind: 'success',
          message: `连接成功，模型已实际响应（${(result.latencyMs / 1000).toFixed(1)} 秒）。${next.provider === 'mimo' && mimoEndpoint(next.baseUrl)?.mode === 'token-plan' ? '本次测试消耗少量 Token Plan 配额。' : '本次测试产生少量调用费用。'}`,
        });
    } catch (error) {
      if (epoch === operationEpoch.current && requestEpoch === serviceEpoch.current)
        setNotice({
          kind: 'error',
          message: controller.signal.aborted ? '请求已超时，请稍后重试' : validationError(error),
        });
    } finally {
      clearTimeout(timeout);
      auxiliaryControllers.current.delete(controller);
      flag.current = false;
      setBusy((old) => ({ ...old, [kind]: false }));
    }
  }
  function clearHistory(id: string) {
    if (!requireWritable()) return;
    if (generation.current?.companionId === id) stopGeneration();
    change((old) => ({ ...old, conversations: { ...old.conversations, [id]: [] } }));
    setLastMetrics(null);
    setNotice({ kind: 'success', message: '聊天记录已清空' });
  }
  async function resetData() {
    try {
      stopGeneration();
      operationEpoch.current++;
      for (const c of auxiliaryControllers.current) c.abort();
      clearStoredData();
      canPersist.current = true;
      const next = { ...DEFAULT_SETTINGS };
      settingsRef.current = next;
      setSettings(next);
      setModels([]);
      setLastMetrics(null);
      change(() => ({ version: 1, companions: [], conversations: {}, activeId: null }));
      setNotice({ kind: 'success', message: '本机对象、聊天记录和 API 设置已清除' });
    } catch (error) {
      setNotice({ kind: 'error', message: validationError(error) });
    }
  }
  return {
    companions: data.companions,
    conversations: data.conversations,
    activeId: data.activeId,
    activeCompanion: data.companions.find((c) => c.id === data.activeId),
    messages: data.activeId ? data.conversations[data.activeId] || [] : [],
    settings,
    models,
    busy,
    notice,
    lastMetrics,
    ready,
    createCompanion,
    updateCompanion,
    deleteCompanion,
    setActiveId,
    sendMessage: (content: string) => generate(content),
    retryMessage: () => generate(undefined, true),
    stopGeneration,
    saveSettings,
    testConnection: (input?: ApiSettings) => serviceAction('test', input),
    loadModels: (input?: ApiSettings) => serviceAction('models', input),
    clearModels,
    clearHistory,
    resetData,
    dismissNotice: () => setNotice(null),
  };
}
