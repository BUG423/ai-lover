# 知心 · AI Lover

![知心 AI Lover：Android 与 Windows 客户端界面展示](docs/media/hero.png)

一款用于情绪陪伴的 AI 聊天应用，提供 **Android** 和 **Windows x64** 客户端。创建有独立身份、性格和关系设定的对象，用自己的模型密钥开始对话。

[下载安装包](https://github.com/BUG423/ai-lover/releases/latest) · [构建检查](https://github.com/BUG423/ai-lover/actions) · [版本记录](docs/releases/0.2.1.md)

## 和 TA 慢慢聊

- **按自己的想法认识 TA**：16 种个性，每位对象选择 1–3 项；6 个关系阶段，由你手动选择。
- **两个人，两份故事**：「对 TA 的描述」和「对我的描述」分别填写，让模型更清楚地理解双方身份。
- **把空间留给对话**：简洁的文字聊天，Android 与 Windows 均可独立使用。OPPO A32 已实机测试可用。

![聊天、性格与关系、双方资料的界面展示](docs/media/interface-gallery.png)

以上为当前版本界面，人物资料与对话均为虚构示例。[查看 Windows 界面](docs/media/screenshots/windows-chat.png) · [小红书六图与配文](docs/marketing/xiaohongshu/README.md)

## 使用

1. Android 安装 APK；Windows 安装 `Setup.exe`，或解压便携版 ZIP 后运行应用。
2. 在「设置」中选择服务商，填写密钥，读取模型、测试连接并保存。
3. 创建对象，分别填写「对 TA 的描述」和「对我的描述」，开始聊天。

两个客户端均可独立运行。对象资料和聊天保存在当前设备，密钥在本机加密保存；应用不提供备份导入导出或自动同步。

| 服务商         | 密钥入口                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 小米 MiMo      | [套餐控制台](https://platform.xiaomimimo.com/console/plan-manage) / [普通 API](https://platform.xiaomimimo.com/console/api-keys) |
| 硅基流动国内站 | [国内站控制台](https://cloud.siliconflow.cn/account/ak)                                                                          |

MiMo 密钥需匹配所选账户类型与区域。硅基流动只支持国内站。源码和安装包不内置用户 API Key；模型调用由用户自己的服务商账户计费。

## 目录

```text
apps/
  android/       Android 原生工程与 HTTPS 模型网关
  windows/       Electron 主进程、私有模型网关与打包配置
packages/
  ui/            两端共用的界面、样式与应用图标
  core/          角色设定、提示词、上下文和服务商规则
tests/           核心、客户端、平台网关与界面回归
scripts/         构建、签名、产物审计和设备检查
docs/            使用与开发说明、版本记录、界面图片和介绍素材
```

共用界面随 APK 和 EXE 打包。中间文件写入 `.build/`，安装包写入 `artifacts/`，均不提交到仓库。

## 构建

安装 Node.js 24+ 并运行：

```bash
npm ci
```

Android 另需 JDK 21、Android SDK Platform 36 和 Build Tools 35.0.0：

```bash
npm run android:build
```

在 Windows 上生成安装版和便携版：

```bash
npm run windows:build
```

开发、测试、签名与发布流程见 [开发说明](docs/development.md)、[Android](docs/android.md)、[Windows](docs/windows.md) 和 [架构](docs/architecture.md)。
