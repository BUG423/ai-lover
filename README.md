# 知心 · AI Lover

微信式聊天、通讯录和设置，配合苹果磨砂玻璃视觉。创建多位有独立设定的 AI 陪伴，用自己的模型 API Key 进行流式对话。

![桌面聊天界面](docs/screenshots/chat.png)

## 本机启动

需要 Node.js 24+。

```bash
npm ci
npm run dev
```

打开 http://localhost:5173 。进入“设置”，填写对应站点的 API Key，选择模型并保存。首次预置“小满”作为可编辑对象，没有预置模型回复。未填 Key 时可以创建对象，聊天会提示先配置。

默认按硅基流动国际站接入：`https://api.siliconflow.com/v1`，模型 `Qwen/Qwen3.5-9B`。也支持中国站及受信的 OpenAI 兼容服务。选择站点后使用界面中的官方 Key / 教程链接，点击“读取模型”和“测试连接”核验自己的账户；连接测试会产生少量生成费用。

## 已实现的范围

- 多对象创建、编辑、删除，独立聊天历史、搜索与通讯录。
- 双方各四种身份/形态，16 种组合；16 种性格，可选择 1–3 项；6 个关系阶段；600 字可选背景。
- 组合系统提示词、有限近期上下文、真实 SSE 增量显示、停止、错误与重试。
- API 区域、地址、密钥、模型、温度、上下文设置，实时模型目录和实际生成连接测试。
- 本机持久存储、备份导入导出；API Key 使用本机设备密钥加密，不进入导出文件。
- 响应式界面、PWA 安装信息和静态页面缓存、Node/Docker 部署与 CI。

首版数据属于当前浏览器。API 代理不保存聊天和密钥，模型生成会将当前设定和有限历史发给选择的供应商。跨设备账号同步、语音、群聊、主动推送和自动长期记忆尚未实现；PWA 离线时无法生成回复。

## 生产运行

```bash
npm run build
npm start
```

应用与 API 统一在 http://localhost:3001 提供。可用 Docker：

```bash
docker compose up --build -d
```

Docker 配置已提供；当前交付环境没有 Docker，容器构建未实测。Node 生产服务已实际启动验证。

对外部署时配置 HTTPS；反向代理关闭 SSE 缓冲，读取超时应大于 90 秒。API Key 经过自己的应用服务器转发给供应商，部署服务器必须可信。浏览器加密只能减少存储中的明文暴露，无法抵御已控制同源页面或设备的攻击。

默认允许硅基流动国际站、中国站和 `https://api.openai.com/v1`。添加其他兼容供应商时，部署者通过环境变量显式配置信任其 HTTPS origin，例如：

```bash
ALLOWED_API_ORIGINS=https://api.example.com npm start
```

设置中的地址仍需是该 origin 的 `/v1` 路径。不要将非可信地址加入名单。`PORT` 可覆盖默认的 3001。

## 检查

```bash
npm run typecheck
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

浏览器测试使用受控模拟模型响应，不消耗真实供应商余额。没有用户 API Key，因此默认模型的实际回复质量和网络延迟尚未测量；流式支持不等于真实首字时间已达标。

## 设计依据

- [竞品、模型与来源](docs/research.md)
- [产品需求与验收基线](docs/product-requirements.md)
- [架构、数据流与决策](docs/architecture.md)
- [模型网关接口](docs/backend.md)
- [进度与验证记录](docs/progress.md)

国际站价格研究快照（2026-10-03）：Qwen3.5-9B 输入 $0.10、输出 $0.15 / 百万 token；以[官网](https://www.siliconflow.com/pricing)和实际账户为准，应用并不代收模型费用。
