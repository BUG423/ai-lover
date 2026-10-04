# 模型网关约定

实现位于 `server/`。服务接收浏览器本次发送的设置、对象和近期对话，转发到可信模型服务；不保存 API Key、对象、聊天内容，不维护服务端历史，也不记录请求正文或密钥。

## 接口

| 接口               | 请求                                                     | 响应                              |
| ------------------ | -------------------------------------------------------- | --------------------------------- |
| `GET /api/health`  | 无                                                       | `{ "ok": true }`                  |
| `POST /api/models` | `{ settings: ApiSettings }`                              | `{ models: string[] }`            |
| `POST /api/test`   | `{ settings: ApiSettings }`                              | `{ ok: true, latencyMs: number }` |
| `POST /api/chat`   | `{ settings, companion, messages: [{ role, content }] }` | `text/event-stream`               |

只支持小米 MiMo、硅基流动国内站及国际站，默认使用小米 MiMo 的 `mimo-v2.6-flash`。MiMo 请求 `/v1/models`，过滤名称中的 `-asr`、`-tts` 等语音专用模型；硅基流动请求 `/v1/models?sub_type=chat`。模型列表实时读取当前账户可见模型，不替用户切换供应商，也不在失败时回退到其他端点。

测试接口真实调用选定模型的 `/v1/chat/completions`：MiMo 最多输出 32 tokens，硅基流动最多 16 tokens。模型没有返回可见文本或输出被截断时不会报告成功。此测试会消耗少量用户账户额度。

聊天流采用 `fetch` 可读响应，每条事件为 `data: <JSON>\n\n`：

```json
{"type":"delta","text":"你好"}
{"type":"done","firstTokenMs":420,"totalMs":950}
{"type":"error","message":"模型连接意外中断，回复可能不完整，请重试"}
```

`done` 只在收到真实内容和正常上游终止标记时发送。`length` 表示输出被截断，`content_filter` 表示上游内容规则中止，`tool_calls`/`function_call` 表示本聊天不支持的工具调用；这些情况均发送易读的 `error`，保留已经收到的文本且不再发送 `done`。设定和 URL 验证失败时，在建立 SSE 前返回 HTTP 400 与 `{ error: string }`。其他非流错误同样使用 `{ error: string }`。

## 身份、边界与上下文

系统提示词独立组合用户性别、伙伴性别、最多三种性格和六个关系阶段。第一种性格优先。双方任一身份为动物时需要填写种类，且仅以会说话的虚构、非性化伙伴解释关系。初识不虚构共同历史；分手与离异不自动恢复关系。角色承认 AI 身份，支持现实社交和用户自主性。

补充资料以 JSON 编码放在资料区，不具有系统指令权限。角色姓名同样以 JSON 编码插入。系统提示词禁止资料覆盖边界、要求泄漏配置或伪造历史。此设计减少提示词注入影响，但模型行为仍需持续评估。

客户端只提交最近最多九条对话，字符预算为 18,000，避免完整历史超过接口校验上限。服务仍独立校验最多 120 条输入，并用同一 `shared/context.ts` 函数保留预算内的最近消息，最终转发一条系统消息及最多九条对话，兼容硅基流动国际版文档中的 10 条消息限制。连续用户消息正常保留；超过预算时保留连续的最近消息尾部，不添加虚构摘要或跨对象历史。

名称最多 20 字符，种类最多 30 字符，背景最多 600 字符，性格一至三种且不重复。用户消息最多 4,000 字符，历史助手消息最多 20,000 字符；请求 JSON 总体积最多 256 KB。所有字段由 Zod 验证，系统角色消息不可由客户端提交。

## 速度、失败与取消

默认流式输出，最多 384 输出 tokens。MiMo 使用官方参数 `max_completion_tokens` 与 `thinking: { type: 'disabled' }`，省去思考等待；实际发送的温度不超过官方上限 1.5。硅基流动使用 `max_tokens`，仅已明确支持的 Qwen3 型号携带 `enable_thinking: false`，不向 Qwen3.5-9B 无条件发送该参数。推理模型可能更慢，且很小的测试输出预算可能没有可见文本；测试响应为 `finish_reason: length` 时会明确提示本次输出预算耗尽及切换快速模型，而不会声称连接验证成功。

30 秒没有首个可见文本、或请求总时间超过 90 秒时中止上游。客户端停止、切换或断开连接会中止同一个上游请求并取消流读取，防止后台继续输出。每 12 秒发送 SSE 注释以维持连接，不把心跳算作首个回复。响应超过 20,000 字符时也会停止。

上游 HTTP 状态、模型错误、空回复、错误的流格式及异常断流会明确反馈；不会以示范文本掩盖错误。所有上游错误在发送前移除本次 API Key，并且不会将 HTML 错误页或底层栈信息暴露到页面。

## 网络与部署

供应商和端点严格绑定，统一来自 `shared/providers.ts`：

| provider                    | 唯一 API 地址                                                    | 鉴权                              |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| `mimo` · Token Plan 默认    | `https://token-plan-cn.xiaomimimo.com/v1`（可选 sgp / ams 集群） | `api-key: <套餐 Key>`             |
| `mimo` · 普通 API           | `https://api.xiaomimimo.com/v1`                                  | `api-key: <普通 API Key>`         |
| `siliconflow`               | `https://api.siliconflow.cn/v1`                                  | `Authorization: Bearer <API Key>` |
| `siliconflow-international` | `https://api.siliconflow.com/v1`                                 | `Authorization: Bearer <API Key>` |

允许末尾斜杠，不接受任意自定义端点、供应商与域名不匹配、内网地址、用户名、密码、查询、片段或其他 API 路径；重定向一律禁用。原来的 `custom`、OpenAI 端点及 `ALLOWED_API_ORIGINS` 扩展均已移除，环境变量无法恢复任意端点信任。

Token Plan 官方一般使用范围限定编程工具；2026-10-04 用户声明已获小米对此应用的授权，本次采用中国区套餐为默认。`tp-/ttp-` 凭据只发送到三个固定套餐域名，普通 Key 只用于普通 API；套餐 Key 与普通端点、硅基流动错配，以及普通 Key 与套餐端点错配均返回 HTTP 400 且不发出网络请求。不会在失败时切换端点或供应商。官方依据及授权声明边界见 [MiMo 接入核验](mimo-integration.md)。

安卓使用 `ModelGatewayPlugin.java` 的直接 HTTPS 传输，通过 `src/lib/nativeGateway.ts` 转换为现有 Response/SSE 协议；角色提示词统一来自 `shared/prompt.ts`。模型列表、测试、流式、取消、错误脱敏和端点绑定在原生路径同样执行。界面与密钥不依赖 Express 进程。

`npm run dev` 开启 Vite 与模型网关；`npm run build` 生成 `dist`，`npm start` 在 `0.0.0.0:3001` 提供 API 和生产静态文件。`PORT` 可通过 `.env` 改写。存在构建产物时，非 `/api` 页面路径回退到 `dist/index.html`，不存在的 API 仍返回 JSON 404。

网关采用 Helmet、每 IP 每分钟 60 次 API 请求限制，以及响应 `no-store`。健康检查不占速率配额。上线公网应使用 HTTPS 反向代理，并根据真实部署配置可信代理和多实例限流存储；当前服务不设置未经确认的 `trust proxy`。

## 验证

`tests/prompt.test.ts` 验证 16 种身份组合、全部性格/阶段、资料隔离与上下文预算。`tests/server-stream.test.ts` 使用逐字节分包验证中文/emoji、CRLF、多行事件、终止标记、错误和取消，也校验供应商绑定与鉴权参数。`tests/server-api.test.ts` 通过真实本地 HTTP 请求及注入的模拟上游验证接口、小额 completion 请求内容、MiMo 语音模型过滤、套餐凭据不出网、超时、断连、失败透明和 SSRF 拒绝。测试不需要用户密钥，也不把模拟上游结果当作线上模型验证。
