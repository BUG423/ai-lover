import { DEFAULT_DRAFT, DEFAULT_SETTINGS } from '../../shared/catalog';
import type { ApiSettings, AppData } from '../../shared/types';
import { dataSchema, settingsSchema } from './validation';

const DATA_KEY = 'zhixin.data.v1';
const SETTINGS_KEY = 'zhixin.settings.v1';
let keyPromise: Promise<CryptoKey> | undefined;

function initialData(): AppData {
  const now = Date.now();
  const companion = {
    ...DEFAULT_DRAFT,
    id: crypto.randomUUID(),
    name: '小满',
    personalityIds: ['warm', 'playful'],
    createdAt: now,
    updatedAt: now,
  };
  return {
    version: 1,
    companions: [companion],
    conversations: { [companion.id]: [] },
    activeId: companion.id,
  };
}
export function loadData(): { data: AppData; warning?: string } {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return { data: initialData() };
    const data = dataSchema.parse(JSON.parse(raw));
    for (const messages of Object.values(data.conversations)) {
      for (const message of messages)
        if (message.status === 'streaming') message.status = 'stopped';
    }
    return { data };
  } catch {
    // Preserve an unreadable payload until the user explicitly resets or imports data.
    return {
      data: { version: 1, companions: [], conversations: {}, activeId: null },
      warning: '本机资料暂时无法读取，原始数据已保留。请导入有效备份或在设置中清除数据。',
    };
  }
}
export function persistData(data: AppData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}
export function clearStoredData(): void {
  localStorage.removeItem(DATA_KEY);
  localStorage.removeItem(SETTINGS_KEY);
}

function deviceKey(): Promise<CryptoKey> {
  if (!keyPromise)
    keyPromise = (async () => {
      if (!crypto.subtle || !globalThis.indexedDB)
        throw new Error('当前环境不能持久加密 API Key，请使用 HTTPS 或 localhost');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zhixin-secrets', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('设备密钥不可用'));
        request.onblocked = () => reject(new Error('设备密钥被其他窗口占用，请关闭旧窗口后重试'));
      });
      try {
        const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        return await new Promise<CryptoKey>((resolve, reject) => {
          const transaction = db.transaction('keys', 'readwrite');
          const store = transaction.objectStore('keys');
          const request = store.get('api');
          let key: CryptoKey;
          request.onsuccess = () => {
            key = (request.result as CryptoKey) ?? candidate;
            if (!request.result) store.put(candidate, 'api');
          };
          transaction.oncomplete = () => resolve(key);
          transaction.onerror = () => reject(new Error('设备密钥保存失败'));
          transaction.onabort = () => reject(new Error('设备密钥保存中断'));
        });
      } finally {
        db.close();
      }
    })().catch((error) => {
      keyPromise = undefined;
      throw error;
    });
  return keyPromise;
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export async function persistSettings(
  settings: ApiSettings,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> {
  const { apiKey, ...config } = settings;
  if (!apiKey) {
    if (shouldCommit()) localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
    return true;
  }
  try {
    const key = await deviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(apiKey),
    );
    if (!shouldCommit()) return false;
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...config,
        secret: { iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) },
      }),
    );
    return true;
  } catch {
    if (!shouldCommit()) return false;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
    return false;
  }
}
export async function loadSettings(): Promise<{ settings: ApiSettings; warning?: string }> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(raw);
    const settings = settingsSchema.parse({ ...parsed, apiKey: '' });
    if (parsed.secret) {
      try {
        const key = await deviceKey();
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: decode(parsed.secret.iv) },
          key,
          decode(parsed.secret.ciphertext),
        );
        settings.apiKey = new TextDecoder().decode(decrypted);
      } catch {
        return { settings, warning: '无法解密本机 API Key，请在设置中重新填写。' };
      }
    }
    return { settings };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, warning: '模型设置读取失败，请重新保存设置。' };
  }
}
