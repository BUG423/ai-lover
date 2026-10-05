# Windows

Windows 客户端使用 Electron，交付 Windows 10/11 x64 安装程序和便携 ZIP。安装后可独立运行，无需另装 Node.js。

## 构建

在 Windows 上准备 Node.js 24+：

```bash
npm ci
npm run windows:build
```

产物位于 `artifacts/windows`。实际打包应用验证：

```bash
npm run windows:smoke -- "artifacts/windows/win-unpacked/AI Lover.exe"
```

应用入口与打包配置在 `apps/windows`；共用界面从 `.build/ui` 复制到 `.build/windows/renderer`，中间目录不提交。

## 运行与密钥

Electron 启用沙箱、上下文隔离，渲染层不获得 Node 权限。稳定的 `ai-lover://app/` 协议和 `persist:ai-lover` 会话保存聊天及 IndexedDB 设备密钥；模型网关只监听本机随机端口，并校验随机认证令牌。

用户自行填写 MiMo 或硅基流动国内站密钥，加密保存在当前设备。应用不加载开发机 `.env`。打包使用文件允许名单，并对 staging 和实际 ASAR 检查密钥候选；不包含源码、聊天快照、设备信息或签名材料。

Windows 安装包暂未配置代码签名。版本标签在 Windows runner 原生构建并执行实际 EXE 的启动、网络隔离、存储和加密恢复验证；详见 [开发说明](development.md)。
