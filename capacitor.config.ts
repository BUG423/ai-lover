import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zhixin.ailover',
  appName: '知心',
  webDir: '.build/ui',
  loggingBehavior: 'none',
  android: { path: 'apps/android', allowMixedContent: false },
};

export default config;
