# 开发与验证

使用 Node.js 24+。仓库使用一个 npm 工程，平台入口位于 `apps`，共用代码位于 `packages`。

```bash
npm ci
npm run typecheck
npm run format:check
npm test
npm run test:ui
```

`test:ui` 使用 Playwright 和临时的本机渲染层测试环境，覆盖双方描述、加密保存、历史迁移、停止重试及手机键盘布局。首次运行先执行 `npx playwright install chromium`；它不启动模型服务，也不产生真实模型费用。

## Windows

```bash
npm run windows:start
npm run windows:build
npm run windows:smoke -- "artifacts/windows/win-unpacked/AI Lover.exe"
```

`npm run dev` 等同于 `windows:start`。`windows:prepare` 生成 `.build/windows`，`windows:build` 生成 x64 安装程序和便携 ZIP，并检查实际 ASAR。

## Android

准备 JDK 21、Android SDK Platform 36 与 Build Tools 35.0.0，设置 `JAVA_HOME`、`ANDROID_HOME`。

```bash
npm run android:build
cd apps/android
./gradlew lintDebug --console=plain
```

Windows 使用 `gradlew.bat`。`android:sync` 会从 `.build/ui` 更新原生资源及插件路径。不要手工修改生成的 `capacitor.settings.gradle` 和应用资源目录。

## 密钥与设备检查

```bash
python3 scripts/audit-secrets.py --history
node scripts/sign-android-test.mjs artifacts/ai-lover-debug.apk
```

安卓显式签名使用 `ANDROID_TEST_KEYSTORE_PATH`，默认本机调试证书；`ANDROID_TEST_CERTIFICATE_SHA256` 可固定公钥指纹。脚本验证签名以及签名前后应用内容一致，固定使用 Build Tools 35.0.0。构建与测试都不需要用户模型密钥。

在手机启用并授权 USB 调试后，可读取该应用的本机聊天：

```bash
node scripts/read-android-conversations.mjs
```

`ADB` 可指定 ADB 路径，`ADB_PORT` 可指定调试服务端口，`ANDROID_SERIAL` 可选择设备。WSL 使用 Windows ADB 时建议独立端口，避免连接到无物理 USB 的 Linux 调试服务。读取工具会打开知心，只保存聊天数据到忽略的 `artifacts/private`，不提取模型设置或密钥；快照不进入 Git 或安装包。

## 发布

同步 `package.json`、锁文件和 Android 的 versionName/versionCode，在 `docs/releases/<版本>.md` 写明验证结果。主分支 CI 通过后推送匹配版本的 `v<版本>` 标签，由 release workflow 构建并发布。

仓库 Secret `ANDROID_TEST_KEYSTORE` 保存固定测试签名材料，变量 `ANDROID_TEST_CERTIFICATE_SHA256` 固定证书指纹；发布缺少材料或证书不符会失败。上传 APK 前显式签名，不依赖 Gradle 默认签名文件位置。所有发布文件生成 `SHA256SUMS.txt`。
