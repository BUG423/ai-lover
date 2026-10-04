# 小米 MiMo 接入核验

核验日期：2026-10-04。本文首先核对小米官方文档，研究任务未读取用户密钥。用户随后说明已获得小米对此应用使用 Token Plan 的授权；主代理据此完成真实套餐模型列表、连接测试和聊天验证，实测记录见 [安卓交付记录](android.md)。少量样本不能代表持续可用性或角色质量评测。

## 对本项目的直接结论

AI Lover 将 **小米 MiMo 作为默认供应商**，并限定另外两个入口为硅基流动国内站、国际站。根据 2026-10-04 用户关于已获小米授权的声明，本轮实现以 Token Plan 中国集群为默认，另支持新加坡、阿姆斯特丹集群以及普通按量 API `https://api.xiaomimimo.com/v1`；候选默认模型为 `mimo-v2.6-flash`。Token Plan 与普通 API 的地址、凭据和费用说明分开配置，切换账户类型或区域不复用旧 Key。

**Token Plan Key 与普通 API Key 不可混用。**官方公开的一般套餐规则还限定 Token Plan 的使用场景。通过 Playwright 访问 [Token Plan 个人版中文页面](https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/subscription)，在“套餐使用”段核验到原文：

> Token Plan 套餐额度仅可在编程工具（如 OpenClaw、OpenCode 等）中使用，禁止以 API 调用的形式用于自动化脚本、自定义应用程序后端等明显非 Coding 场景的请求行为。

个人版和团队版的官方英文 Markdown 都有同样限制。[M1、M2] AI Lover 的聊天网关属于一般规则所列的自定义应用场景。**2026-10-04 用户明确声明已获得小米针对本项目使用的授权，主负责人据此授权本轮实现 Token Plan 接入。**本研究没有独立核验授权文件、期限、账户或其他条件，也不将该声明扩展为“任何用户都可把套餐用于自定义应用”。实现直接发送本项目真实聊天请求，不伪装编程工具。普通 API 保留为独立账户类型。

## 普通 API：已核验的实现契约

| 项目         | 官方确认值                                                                               | 来源   |
| ------------ | ---------------------------------------------------------------------------------------- | ------ |
| Base URL     | `https://api.xiaomimimo.com/v1`                                                          | M4、M5 |
| 文本生成     | `POST /chat/completions`                                                                 | M4     |
| 鉴权         | `api-key: <普通 API Key>`；官方也支持 `Authorization: Bearer <普通 API Key>`，选一种即可 | M4、M5 |
| 内容类型     | `Content-Type: application/json`                                                         | M4     |
| 普通 Key     | 官方示例为 `sk-…`，在 API Keys 页面创建，与套餐 `tp-…` / `ttp-…` 不通用                  | M3     |
| 默认候选     | `mimo-v2.6-flash`                                                                        | M4、M7 |
| 其他文本候选 | `mimo-v2.6-pro`；`mimo-v2.6-pro-ultraspeed` 为官方列出的特别服务，不假定任何账户都可用   | M4、M7 |
| 流式         | `stream: true`，SSE；读取 `choices[0].delta.content`                                     | M4、M6 |
| 关闭思考     | `thinking: { "type": "disabled" }`                                                       | M4、M6 |
| 输出长度     | `max_completion_tokens`，含可见输出和推理 token；官方范围 1–131072                       | M4     |
| 温度         | 0–1.5；思考开启时该系列会强制采用推荐默认值，不能保证界面温度在思考模式生效              | M4、M6 |
| 模型目录     | `GET https://api.xiaomimimo.com/v1/models`，同样支持 `api-key` 或 Bearer                 | M5     |
| 目录响应     | `{ "object": "list", "data": [{ "id": "…", "object": "model", "owned_by": "xiaomi" }] }` | M5     |

`mimo-v2.6-flash`、`mimo-v2.6-pro` 默认开启思考；日常陪伴对话应显式关闭，避免在短输出预算里先消耗大量推理 token。[M6] 使用 fetch 直接请求时 `thinking` 位于 JSON 顶层；只有使用 OpenAI Python SDK 时，官方示例才把非标准字段放进 `extra_body`。不要把硅基流动的 `enable_thinking`、`max_tokens` 自动套用到 MiMo。

不使用工具调用的普通聊天只携带 system/user/assistant 正文，不把 `reasoning_content` 展示或保存为对象消息。未来如启用“思考 + 工具调用”，必须重新设计历史回传；官方明确要求包含工具调用的历史 assistant 完整回传 `reasoning_content`，否则可能返回 400。[M6]

适用于本项目的请求体示意（不含凭证）：

```json
{
  "model": "mimo-v2.6-flash",
  "messages": [
    { "role": "system", "content": "经过应用校验的当前对象设定与聊天规则" },
    { "role": "user", "content": "今天有点累，想找你说说话。" }
  ],
  "stream": true,
  "thinking": { "type": "disabled" },
  "max_completion_tokens": 512,
  "temperature": 0.8
}
```

512 是本项目短聊天可采用的输出预算建议，不是官方固定值，也不保证所有场景够用。流式示例终止标记为 `data: [DONE]`。[M6] 应继续保留取消、首正文超时、总超时、上游错误和终止检查，不能把“支持流式”写成“已达到真实延迟指标”。

模型目录可能包含 ASR、TTS 等非聊天模型。首版模型下拉框应按文本生成能力筛选，不能让读取目录后把 `mimo-v2.5-asr` 或 `mimo-v2.5-tts` 当作普通聊天模型。官方示例列表不是对某个用户账户即时可调用权限的保证。

## Token Plan：端点事实与适用性区分

以下为官方端点事实。一般套餐使用规则与本项目用户声明的授权需分别理解；端点存在本身并不证明某个账户获准使用。官方 [快速接入](https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/quick-access)列出专用地址，并说明**实际 Base URL 以控制台 Token Plan 页展示为准**。[M3]

| Token Plan 集群 | OpenAI 兼容 Base URL                       | Anthropic 兼容 Base URL                           |
| --------------- | ------------------------------------------ | ------------------------------------------------- |
| 中国            | `https://token-plan-cn.xiaomimimo.com/v1`  | `https://token-plan-cn.xiaomimimo.com/anthropic`  |
| 新加坡          | `https://token-plan-sgp.xiaomimimo.com/v1` | `https://token-plan-sgp.xiaomimimo.com/anthropic` |
| 欧洲            | `https://token-plan-ams.xiaomimimo.com/v1` | `https://token-plan-ams.xiaomimimo.com/anthropic` |

快速接入的 OpenAI Chat Completions 示例为 `POST BASE_URL/chat/completions`、`api-key` 请求头、`max_completion_tokens` 参数，示例模型 `mimo-v2.6-pro`。个人 Key 格式 `tp-…`，团队 Key 格式 `ttp-…`。Token Plan 不与普通按量计费账户余额互通。

本次获取官方完整文档 `llms-full.txt`（约 113 万字符），未找到 `/v1/coding` 或套餐模型目录的文字声明，因此不使用猜测的 `/v1/coding`。后续主代理实际调用中国区套餐 `/v1/models` 返回 HTTP 200，过滤 ASR / TTS 后得到 4 个文字模型；这证明本次账户中国区目录可用，不证明所有地区持续可用。套餐 Key 不发送到通用端点探测。

官方 Token Plan 当前列出 `mimo-v2.6-pro`、`mimo-v2.6-flash`，还包含即将下线的 `mimo-v2.5-pro`、`mimo-v2.5` 以及语音模型。[M1] 旧的两个 V2.5 文本模型将于 **2026-10-21 北京时间 10:00**下线，不建议作为新应用默认选项。[M7]

## 普通 API 价格快照

官方 [按量计费价格页](https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go)和可读 Markdown 已核验。[M8] 下表为 **2026-10-04**实时 API 快照，每 100 万 token 计价；不套用 Token Plan Credits，不含活动赠金，不保证后续不会变价。

| 模型                       | 国内输入：缓存命中 / 未命中 | 国内输出 | 海外输入：缓存命中 / 未命中 | 海外输出 |
| -------------------------- | --------------------------- | -------- | --------------------------- | -------- |
| `mimo-v2.6-flash`          | ¥0.02 / ¥1.00               | ¥2.00    | $0.0028 / $0.14             | $0.28    |
| `mimo-v2.6-pro`            | ¥0.025 / ¥3.00              | ¥6.00    | $0.0036 / $0.435            | $0.87    |
| `mimo-v2.6-pro-ultraspeed` | ¥0.25 / ¥30.00              | ¥60.00   | $0.036 / $4.35              | $8.70    |

默认候选 flash 的选择依据是官方提供的文本 API、非思考开关和较低单位价格。中文陪伴质量、角色一致性、可用性和首正文速度尚未在本研究中实际测量。官方关于 UltraSpeed 的倍数速度宣传不等于本应用的性能保证，也不能用其价格/权限作为普通默认候选。

## 设置入口与实现建议

- MiMo 供应商只接受上表三个 Token Plan 地址和普通 API 地址；不提供任意外部服务地址。硅基流动两站继续分别绑定其官方地址。
- 获取普通 Key 的跳转为 [MiMo API Keys](https://platform.xiaomimimo.com/console/api-keys)，使用指南为 [首次调用 API](https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call)。
- Token Plan 管理页为 [套餐管理](https://platform.xiaomimimo.com/console/plan-manage)，用于本轮获用户授权的套餐账户配置；普通 API 配置则跳转普通 Key 创建入口，不混淆两类凭据。
- 套餐端点要求 `tp-` / `ttp-` 凭据，普通端点拒绝套餐 Key；识别不匹配时在发出网络请求前给出提示。不向其他域名尝试兜底，不静默切换供应商。
- 文档、连接测试和聊天均使用相同供应商适配；模型 ID 按实时目录与文本能力确认。套餐账户测试说明消耗少量套餐额度，普通 API 测试说明产生少量调用费用；实际账户可用性与扣费仍待实测。
- Token Plan 的 `/models` 没有找到明确官方契约；应用尝试目录读取失败时保留手动输入模型的路径，不伪造可用模型。真实连通性、质量、首字速度和账户授权条件都不能用模拟测试或单纯端点存在替代。

## 官方证据登记

以下来源均访问于 **2026-10-04**。中文 SPA 关键段落使用 Playwright 的新建匿名浏览器上下文读取；Markdown 来自官方首页 `llms.txt` 列出的静态资源，不来自第三方转载。

| 编号 | 官方来源                                                                                                                                                                                                    | 核验项                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| M1   | [个人版中文页面](https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/subscription)；[官方 Markdown](https://mimo.mi.com/static/docs/tokenplan/Token%20Plan/subscription.md)                               | 非 Coding 使用范围限制、套餐 Key、当前模型                |
| M2   | [团队版官方 Markdown](https://mimo.mi.com/static/docs/tokenplan/Token%20Plan/team.md)                                                                                                                       | 团队版也有同一使用范围限制                                |
| M3   | [快速接入中文页面](https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/quick-access)；[官方 Markdown](https://mimo.mi.com/static/docs/tokenplan/Token%20Plan/quick-access.md)                             | 专用集群域名、`api-key`、Key 不混用、示例请求             |
| M4   | [OpenAI Chat Completion API](https://mimo.mi.com/docs/zh-CN/api/chat/openai-api)；[官方 Markdown](https://mimo.mi.com/static/docs/api/chat/openai-api.md)                                                   | 普通端点、两种鉴权、流式、参数及文本模型 ID               |
| M5   | [列出模型](https://mimo.mi.com/docs/zh-CN/api/model/list-models)；[官方 Markdown](https://mimo.mi.com/static/docs/api/model/list-models.md)                                                                 | `GET /v1/models`、鉴权及响应字段                          |
| M6   | [深度思考](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/text-generation/deep-thinking)；[官方 Markdown](https://mimo.mi.com/static/docs/quick-start/usage-guide/text-generation/deep-thinking.md) | 默认开启、显式关闭、SSE 示例、工具历史回传限制            |
| M7   | [模型列表](https://mimo.mi.com/docs/zh-CN/quick-start/summary/model)；[官方 Markdown](https://mimo.mi.com/static/docs/quick-start/summary/model.md)                                                         | 模型能力、V2.5 文本模型下线日期                           |
| M8   | [按量计费 API](https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go)；[官方 Markdown](https://mimo.mi.com/static/docs/price/pay-as-you-go.md)                                                                 | 国内/海外价格、普通余额与套餐额度独立                     |
| M9   | [官方文档索引](https://mimo.mi.com/llms.txt)；[完整文档](https://mimo.mi.com/llms-full.txt)                                                                                                                 | 来源发现及 `/v1/coding`、Token Plan models 声明的缺失核验 |

“文档中未找到”不等于从网络层证明某个地址不存在；这里据此限制的是本项目不能把未经官方证实的端点作为既定契约。上述研究不包含任何真实密钥或有 Key 的调用结果。
