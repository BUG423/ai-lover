# Android

Android 客户端使用 Capacitor WebView 展示共用界面，Java 网关直接访问服务商 HTTPS 接口。最低 Android 7（API 24），目标 API 36；APK 可独立使用。

## 构建

需要 Node.js 24+、JDK 21、Android SDK Platform 36 与 Build Tools 35.0.0：

```bash
npm ci
npm run android:build
```

输出 `artifacts/ai-lover-debug.apk`。原生工程位于 `apps/android`，额外检查：

```bash
cd apps/android
./gradlew testDebugUnitTest lintDebug --console=plain
```

Windows 使用 `gradlew.bat`。SDK 路径可使用 `ANDROID_HOME` 或本机 `apps/android/local.properties`。

## 安装与数据

当前 APK 使用固定测试签名。升级应覆盖安装并保留数据；applicationId 固定为 `com.zhixin.ailover`。目录搬迁和角色修复保留对象、消息原文及本机加密密钥。升级后旧 AI 回复退出模型上下文，避免错误资料归属继续影响回复。

用户密钥自行填写并在本机加密保存。原生网关仅允许 MiMo 官方端点及硅基流动国内站，支持流式结果、取消、超时和错误脱敏。系统备份与设备迁移均已关闭。

设备读取、证书验证与发布操作见 [开发说明](development.md)。真机测试材料仅保存在本机忽略目录，发布资料不含私人聊天或用户密钥。
