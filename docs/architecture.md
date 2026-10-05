# 架构

项目交付 Android 和 Windows 两个独立客户端，模型推理由小米 MiMo 或硅基流动国内站完成。两端共用 React 界面与角色逻辑，不提供独立网站、公网服务或 PWA。

## 模块

| 目录            | 职责                                                   |
| --------------- | ------------------------------------------------------ |
| `apps/android`  | Capacitor WebView、Java HTTPS 网关、取消请求及原生测试 |
| `apps/windows`  | Electron 窗口、隔离协议、本机网关与 Windows 打包       |
| `packages/ui`   | 对象表单、聊天、模型设置、流式显示及本机存储           |
| `packages/core` | 双方资料归属、第一人称提示词、上下文截断与服务商规则   |
| `scripts`       | 构建、签名、安装包审计和设备读取                       |
| `tests`         | 共用逻辑、平台通信与界面回归                           |

Vite 生成 `.build/ui`，由两个客户端打包。界面自动测试在 `127.0.0.1` 临时加载共用渲染层，模型请求使用模拟响应；该测试环境不作为产品交付。

## 通信与资料

Android 的原生网关直接通过 HTTPS 调用服务商。Windows 的私有网关只监听随机 loopback 端口，并要求随机认证令牌；渲染层通过 `ai-lover://app/` 访问，启用进程隔离和沙箱，不暴露 Node 能力。

对象资料与用户资料分开传给模型；回复中的“我”属于当前对象，“你”属于用户。旧版聊天升级时保留原文，将旧 AI 回复排除出后续上下文，避免错误身份继续影响回复。新回复正常参与上下文。

聊天使用原有 `zhixin.data.v1` 存储键，模型设置使用 `zhixin.settings.v1`；用户密钥通过 AES-GCM 加密，设备密钥保存在 IndexedDB。目录重整保持 Android applicationId、Windows 应用协议和持久会话名称不变，以保留升级资料。

只允许已支持的 MiMo 官方端点和硅基流动国内站端点；切换服务商清空旧密钥，旧硅基流动国际配置升级时不继承国际密钥。网关不持久保存聊天或密钥，不打印请求体。Android 禁用系统云备份和设备数据迁移。

## 构建与发布

`.build` 保存中间产物，`artifacts` 保存安装包及本机验收资料，两者均忽略。Windows 打包只允许运行必需文件；Android 和 Windows 产物均接受密钥检查。签名私钥通过 Actions Secret 提供，模型 API Key 不参与构建。

GitHub Actions 验证共用逻辑、界面流程、Android 原生测试与 Lint，并在 Windows runner 启动实际打包 EXE。版本标签触发两端构建、安卓固定证书核对、产物扫描及 SHA-256 校验文件发布。
