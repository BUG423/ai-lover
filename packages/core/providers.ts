import type { ApiSettings } from './types';

export const MIMO_ENDPOINTS = [
  {
    label: 'Token Plan · 中国',
    url: 'https://token-plan-cn.xiaomimimo.com/v1',
    keyPlaceholder: 'tp-… / ttp-…',
    mode: 'token-plan',
  },
  {
    label: 'Token Plan · 新加坡',
    url: 'https://token-plan-sgp.xiaomimimo.com/v1',
    keyPlaceholder: 'tp-… / ttp-…',
    mode: 'token-plan',
  },
  {
    label: 'Token Plan · 阿姆斯特丹',
    url: 'https://token-plan-ams.xiaomimimo.com/v1',
    keyPlaceholder: 'tp-… / ttp-…',
    mode: 'token-plan',
  },
  {
    label: '普通 API · 按量计费',
    url: 'https://api.xiaomimimo.com/v1',
    keyPlaceholder: 'sk-…（普通 API Key）',
    mode: 'payg',
  },
] as const;

export const MIMO_BASE_URLS = MIMO_ENDPOINTS.map((endpoint) => endpoint.url);

export function mimoEndpoint(value: string) {
  const normalized = value.replace(/\/$/, '');
  return MIMO_ENDPOINTS.find((endpoint) => endpoint.url === normalized);
}

export const PROVIDERS: {
  id: ApiSettings['provider'];
  name: string;
  description: string;
  url: string;
  console: string;
  guide: string;
  defaultModel: string;
  keyPlaceholder: string;
}[] = [
  {
    id: 'mimo',
    name: '小米 MiMo',
    description: '默认使用 · Token Plan / 普通 API',
    url: 'https://token-plan-cn.xiaomimimo.com/v1',
    console: 'https://platform.xiaomimimo.com/console/plan-manage',
    guide: 'https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/quick-access',
    defaultModel: 'mimo-v2.6-flash',
    keyPlaceholder: 'tp-… / ttp-…',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 · 国内站',
    description: '自带 API Key · 选择对话模型',
    url: 'https://api.siliconflow.cn/v1',
    console: 'https://cloud.siliconflow.cn/account/ak',
    guide: 'https://docs.siliconflow.cn/docs/userguide/quickstart',
    defaultModel: 'Qwen/Qwen3.5-35B-A3B',
    keyPlaceholder: 'sk-…',
  },
];

export function validProviderBaseUrl(provider: ApiSettings['provider'], value: string): boolean {
  const normalized = value.replace(/\/$/, '');
  return provider === 'mimo'
    ? !!mimoEndpoint(normalized)
    : PROVIDERS.some((item) => item.id === provider && item.url === normalized);
}

export function providerKeyError(
  settings: Pick<ApiSettings, 'provider' | 'baseUrl' | 'apiKey'>,
): string | null {
  if (!settings.apiKey.trim()) return null;
  const tokenPlanKey = /^(?:tp|ttp)-/i.test(settings.apiKey.trim());
  if (settings.provider === 'mimo') {
    const endpoint = mimoEndpoint(settings.baseUrl);
    if (endpoint?.mode === 'token-plan' && !tokenPlanKey)
      return 'Token Plan 接口需要 tp-/ttp- 套餐 Key，请选择与密钥对应的账户类型';
    if (endpoint?.mode === 'payg' && tokenPlanKey)
      return '套餐 Key 只能用于套餐专用地址，请选择 Token Plan 对应的服务区域';
  } else if (tokenPlanKey) {
    return '小米 Token Plan Key 只能用于 MiMo 套餐专用地址，不能用于硅基流动';
  }
  return null;
}
