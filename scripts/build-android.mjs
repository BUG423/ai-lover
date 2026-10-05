import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = fileURLToPath(new URL('../android/', import.meta.url));
const command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const buildEnv = { ...process.env };
const cachedTools = join(homedir(), '.cache', 'ai-lover-tools');
const cachedJava = join(cachedTools, 'jdk21');
const cachedSdk = join(cachedTools, 'android-sdk');
if (!buildEnv.JAVA_HOME && existsSync(join(cachedJava, 'bin', 'java')))
  buildEnv.JAVA_HOME = cachedJava;
if (!buildEnv.ANDROID_HOME && !buildEnv.ANDROID_SDK_ROOT && existsSync(cachedSdk))
  buildEnv.ANDROID_HOME = cachedSdk;
const result = spawnSync(command, ['testDebugUnitTest', 'assembleDebug', '--console=plain'], {
  cwd: androidDir,
  env: buildEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.error) {
  console.error('无法运行 Gradle，请检查 JDK 21 和 Android SDK 环境。');
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
const apk = new URL('../artifacts/ai-lover-debug.apk', import.meta.url);
copyFileSync(new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url), apk);
console.log(`安卓测试包：${fileURLToPath(apk)}`);
