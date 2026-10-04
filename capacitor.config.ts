import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zhixin.ailover',
  appName: '知心',
  webDir: 'dist',
  loggingBehavior: 'none',
  android: { allowMixedContent: false },
};

export default config;
