# 安卓交付与 OPPO 安装测试

记录日期：2026-10-04。

## 交付形式

安卓客户端为 `com.zhixin.ailover`，桌面名称「知心」，最低 Android 7（API 24），编译与目标 SDK 36。APK 内置 React 界面，使用 Capacitor 的原生 HTTPS 网关直接连接小米 MiMo / 硅基流动，不需要浏览器打开网址，也不依赖电脑 Node 服务。

默认中国区 MiMo Token Plan 与 `mimo-v2.6-flash`；用户已声明获得小米对此应用的授权。安装包不内置用户 Key，在设置中填写后本机加密保存。切换供应商或账户时清空旧 Key / 模型；套餐 Key 不会发送到普通 API 或硅基流动。

安卓系统返回键关闭弹窗、返回聊天列表或返回首页；首页返回将应用置于后台。备份使用系统分享菜单保存 JSON，导入使用文件选择器，均不包含 API Key。Android 云备份关闭，迁移请使用应用内备份。

## 构建

环境：Node.js 24+、JDK 21、Android SDK Platform 36 / Build Tools 35；设置 `JAVA_HOME`、`ANDROID_HOME`（或 `android/local.properties` 的 `sdk.dir`）。本轮已使用 Windows 主机接受的 SDK licenses，在 WSL 准备 Linux 构建工具。

```bash
npm ci
npm run android:build
```

此命令构建页面、同步原生工程、运行安卓单元测试并生成调试签名 APK：

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `artifacts/ai-lover-debug.apk`

GitHub Actions 的 `ai-lover-android-debug` 产物提供 APK 下载。调试包用于测试；正式分发需发布签名、版本管理和发布验证。密钥、SDK 本机路径、构建缓存和 APK 不提交到源码历史。

## 已完成验证

| 检查                | 结果                                                          |
| ------------------- | ------------------------------------------------------------- |
| APK 构建            | `assembleDebug` 成功                                          |
| 原生单元测试        | 8 项 JVM 回归通过，覆盖端点/密钥绑定、正文流、异常终止及脱敏  |
| JS 原生桥接         | 8 项回归通过，覆盖 HTTP / SSE、取消、迟到 listener 和请求隔离 |
| APK 签名            | Android `apksigner verify` 通过，v2 签名有效                  |
| 手机传输            | Windows 副本与 OPPO 下载目录副本 SHA-256 一致                 |
| 原生真机启动 / 聊天 | 待手机完成安装，尚未验证                                      |

## OPPO A32：真实设备安装状态

设备由 Windows ADB 授权连接，WSL 通过宿主机 `adb.exe` 操作。硬件识别为 OPPO PDVM00，Android 11 / ColorOS 11.1，720×1600；Android WebView 为 97.0.4692.98。

ADB 流式与非流式安装均被 ColorOS 安装流程拦截；系统界面提示「安装包已损坏」，日志出现 `ColorPackageInstallInterceptManager` 对本应用的安装拦截。APK 本机签名检查通过，且传输哈希完全一致；尚不能确认厂商安装流程的具体失败原因。

测试包已传到手机 **文件管理 → 下载 → `ai-lover-debug.apk`**。已请求设备用户完成手动安装，再继续启动、Key 配置、模型读取、真实聊天、键盘、返回、对象隔离和重启恢复测试。未绕过系统保护，原生真机测试尚未完成。

后续从系统文件管理尝试安装时，遇到首次使用页面：要求访问存储空间（照片、媒体和文件）及网络，并提供隐私政策，按钮为「同意并使用」。停在此页，等待设备用户本人确认后再打开安装包。

调试安装示例（使用自己的设备编号和 APK 路径）：

```bash
adb -s DEVICE_SERIAL install --no-streaming -r -t app-debug.apk
adb -s DEVICE_SERIAL shell am start -n com.zhixin.ailover/.MainActivity
```

## 真实 MiMo 调用记录

独立于原生真机测试，本轮已用用户本机 Key 通过实际 Node 网关验证：

| 请求         | 实测样本                                     |
| ------------ | -------------------------------------------- |
| 模型列表     | 4 个文字模型，已过滤 ASR / TTS               |
| 连接测试     | 1,555 ms，真实生成简短文字成功               |
| 完整角色聊天 | 首正文 1,781 ms；总耗时 7,226 ms；正常结束   |
| 另一轮聊天   | 触发 30 秒首正文超时，透明报错；后续重试成功 |

成功回复示例：「辛苦了，今天想从哪件事开始说？我在这儿慢慢听。」这些是本次网络与账户条件下的少量样本，不代表平均性能、持续可用性或原生手机速度。Key 只在忽略的本机环境文件中，不记录到文档、截图、日志、源码或 APK。

另一次真实网页操作完成了模型读取、连接测试、保存与刷新后的加密 Key 恢复；该次界面显示首字约 6.5 秒，进一步说明实际延迟存在波动。

GitHub 云端网页检查、安卓单元测试、Lint、APK 构建与上传均已通过：[构建记录及下载](https://github.com/BUG423/ai-lover/actions/runs/37171178997)。
