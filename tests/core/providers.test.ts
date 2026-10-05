import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../packages/core/catalog';
import { PROVIDERS, validProviderBaseUrl } from '../../packages/core/providers';
import { settingsSchema } from '../../packages/ui/src/lib/validation';
import { loadSettings } from '../../packages/ui/src/lib/storage';

afterEach(() => vi.unstubAllGlobals());

describe('supported provider credentials', () => {
  it('offers MiMo and domestic SiliconFlow and rejects all international pairings', () => {
    expect(PROVIDERS.map((provider) => provider.id)).toEqual(['mimo', 'siliconflow']);
    for (const provider of ['mimo', 'siliconflow'] as const) {
      expect(validProviderBaseUrl(provider, 'https://api.siliconflow.com/v1')).toBe(false);
      expect(
        settingsSchema.safeParse({
          ...DEFAULT_SETTINGS,
          provider,
          baseUrl: 'https://api.siliconflow.com/v1',
          apiKey: 'sk-synthetic-unit-test',
        }).success,
      ).toBe(false);
    }
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, provider: 'siliconflow-international' })
        .success,
    ).toBe(false);
  });

  it.each([
    { provider: 'siliconflow-international', baseUrl: 'https://api.siliconflow.com/v1' },
    { provider: 'siliconflow', baseUrl: 'https://api.siliconflow.com/v1/' },
  ])(
    'drops the old regional key before migrating $provider to the domestic site',
    async (legacy) => {
      let stored = JSON.stringify({
        ...DEFAULT_SETTINGS,
        ...legacy,
        model: 'international-only-model',
        apiKey: 'sk-legacy-plaintext-test',
        temperature: 1.2,
        remember: false,
        secret: { iv: 'old-iv', ciphertext: 'old-ciphertext' },
      });
      const getItem = vi.fn(() => stored);
      const setItem = vi.fn((_key: string, value: string) => {
        stored = value;
      });
      vi.stubGlobal('localStorage', { getItem, setItem });
      const result = await loadSettings();
      expect(result.settings).toMatchObject({
        provider: 'siliconflow',
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: '',
        temperature: 1.2,
        remember: false,
      });
      expect(result.settings.model).toBe(PROVIDERS[1].defaultModel);
      expect(result.warning).toContain('国内站 API Key');
      expect(setItem).toHaveBeenCalledOnce();
      expect(stored).not.toContain('legacy-plaintext');
      expect(stored).not.toContain('ciphertext');
      expect(stored).not.toContain('old-iv');
      expect((await loadSettings()).settings).toEqual(result.settings);
    },
  );
});
