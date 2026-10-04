import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const androidDir = fileURLToPath(new URL('../android/', import.meta.url));
const command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(command, ['testDebugUnitTest', 'assembleDebug', '--console=plain'], {
  cwd: androidDir,
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
