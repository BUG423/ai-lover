# AI Lover：竞品与模型调研

调研日期：2026-10-03。本文以公开的官方产品页、官方博客和 API 文档为依据；没有登录体验竞品付费版本，没有持有效 API Key 调用收费模型。官方宣称的记忆、情商与速度不能视为本项目已经验证的效果。

## 1. 产品判断

用户需要的是能区分身份、保持个性、记得当前关系边界、及时接住情绪的聊天对象。可扩展的实现方式是将对象设定编译为结构化提示词，并为每个对象维护独立会话。无需为 16 × N 种组合分别写一套逻辑，也无需先训练专用大模型。

竞品共同重视角色定制与记忆；本项目首版应优先解决“设定会生效、回复及时、对象间不串记忆、聊天不像客服”。语音、自拍、群聊和角色社区能增强沉浸感，但不能替代这四件事。

## 2. 竞品证据与取舍

| 产品 | 已核验的官方能力 | 本项目可采用的设计 | 首版取舍及证据限制 |
| --- | --- | --- | --- |
| Character.AI | 2026-05 官方发布 Story Memory、消息固定到记忆、Facts 自动捕捉及记忆占用显示；Facts 属于付费能力。2026-09 发布 ShortSqueak，强调简短回复和日常聊天。2026-07 Lorebook 以关键词触发世界设定条目，初期面向订阅用户。 | 固定设定与近期消息分层；关系背景保持可编辑；日常聊天默认短句。未来按需检索设定，而非每次塞入全部世界观。 | 首版采用有界历史和显式背景，不能称为自动长期记忆。主站本次返回 403，证据来自可访问的官方博客。[C1–C4] |
| Replika | 当前官网强调记住人物、习惯、计划和兴趣；提供外观定制、通话及自拍；以持续的一对一陪伴和现实生活支持为主要表达。 | 让关心落在用户说过的具体事情上；稳定的一对一会话；避免把所有情绪都转成泛化建议。 | “Always remembers what matters”“most emotionally intelligent”是官方营销表述，未独立测试。本次未核验多对象数量、套餐限制或记忆算法。[R1] |
| Nomi | 官网明确提供多个独立 Nomi、一对一和群聊、自定义背景、短中长期记忆、情绪化语音/通话、可选主动消息、链接/图片理解及自拍。 | 多对象分别具有身份和历史；背景补充与性格定制；主动消息作为未来可选功能，默认尊重用户节奏。 | “human-level memory”等表述属于供应商宣称。首版不承诺群聊、主动推送、互联网访问、语音或自拍。官网评价中的“10 个对象”等数字不能当作当前套餐规格。[N1] |
| Kindroid | 官方首页元描述明确支持自定义角色、文本聊天、自拍和拟人语音。开发者在 Google Play 的产品说明明确提到详细背景和关键记忆。官方入门博客建议先确定互动氛围，并用 tweak/regenerate 对跑偏的回应作修正。 | 角色设定应说明实际说话方式；允许用户纠正设定；后续考虑重试/重生成及显式记忆管理，减少错误滚雪球。 | 新版帮助中心可找到性格、记忆、群聊等官方路径，但本次获取正文仅得到应用加载占位，因此不据此断言这些文档中的细节、配额或套餐。Google Play 来源是开发者发布的说明，用户评价未作为事实依据。[K1–K3] |

### 首版吸收的共同优点

1. **角色一致性**：身份、性格、关系阶段和补充背景是不同字段；每轮按相同规则组织，避免随着消息增多丢失基础设定。
2. **记忆诚实**：本地保存历史不等于模型能看到全部历史。只把实际发送的上下文称为当前记忆；不能编造用户未说过的共同经历。
3. **即时回应**：使用真实 SSE 流式输出，先显示首个有效正文，再持续填充；日常回应默认简短，复杂需求再展开。
4. **可修正性**：用户能编辑对象设定并保留原会话；出错状态有明确原因和重试路径。
5. **熟悉的操作结构**：采用微信式会话列表、通讯录、聊天气泡、资料和设置路径，将学习成本降到最低。

## 3. 性格资料与可实现目录

IPIP 的 Big-Five Factor Markers 提供外向性、宜人性、尽责性、情绪稳定性、智性/想象力等维度与行为描述。[P1] 可以借用“维度对应可观察行为”的思路，但 AI Lover 不是心理测量工具，以下标签是产品创作的聊天风格，并非心理诊断、人格测评结果或经过验证的科学分类。

| 首版风格 | 应体现的行为 | 避免的走偏 |
| --- | --- | --- |
| 温柔治愈 | 耐心、先共情、允许沉默 | 机械重复“我理解你” |
| 热烈直球 | 热情、主动、坦率 | 强迫亲近或要求秒回 |
| 清冷慢热 | 简洁、克制、细节关心 | 贬低、冷暴力 |
| 俏皮活泼 | 接梗、轻松、有回应感 | 用户痛苦时继续抖机灵 |
| 沉稳可靠 | 稳定、具体、可依靠 | 居高临下的教训 |
| 浪漫细腻 | 少量生活细节、自然表达 | 大段油腻情话 |
| 幽默风趣 | 机智、善意玩笑 | 嘲笑身份或困境 |
| 理性知性 | 好奇、深入分析、认可情绪 | 把倾诉变成答题 |
| 腼腆内敛 | 含蓄、慢慢靠近 | 每句结巴和省略号 |
| 自由探索 | 独立、开放、尝试新体验 | 危险怂恿 |
| 文艺感性 | 想象力、审美、灵感 | 每句话堆砌比喻 |
| 阳光元气 | 具体鼓励、充满活力 | 强行正能量 |
| 独立坦诚 | 有观点、尊重空间 | 无条件讨好 |
| 细心体贴 | 记住上下文中的具体小事 | 编造记忆 |
| 傲娇可爱 | 少量逞强和可爱调侃 | 羞辱、控制、情绪惩罚 |
| 安静倾听 | 少量贴切问题、给表达空间 | 审讯式连续追问 |

16 个首版风格覆盖热情/克制、理性/感性、表达/倾听等不同维度，后续可通过反馈添加组合和强度调节。性别不决定性格；男性、女性、无法被定义和动物形态均可使用这些风格。动物应理解为会说话的虚构陪伴形态，不必假定它拥有某个人类性别。

## 4. SiliconFlow 名称与区域

用户说的“国际流动版”“国际流动”暂按 **硅基流动 SiliconFlow 国际站**处理。它不是已经核验的独立供应商品牌名称。首版应同时提供国际站、中国站和 OpenAI 兼容自定义地址，避免把可能的口误固定成接入限制。

| 项目 | 国际站 | 中国站 |
| --- | --- | --- |
| Base URL | `https://api.siliconflow.com/v1` | `https://api.siliconflow.cn/v1` |
| 获取密钥 | [国际站 API Keys](https://cloud.siliconflow.com/account/ak) | [中国站 API Keys](https://cloud.siliconflow.cn/account/ak) |
| 模型/价格查看 | [国际控制台](https://cloud.siliconflow.com/)、[官方价格](https://www.siliconflow.com/pricing) | [中国控制台](https://cloud.siliconflow.cn/)、[官方价格](https://www.siliconflow.cn/pricing) |
| 文档 | [Quick Start](https://docs.siliconflow.com/en/userguide/quickstart) | [快速上手](https://api-docs.siliconflow.cn/docs/userguide/quickstart) |

密钥、模型供应和计价以用户所选站点为准，不能把中国站的免费名额或人民币价格套用到国际站。

## 5. 官方价格快照与模型建议

以下为 2026-10-03 获取的官方网页价格，不是永久报价，不包含汇率换算、活动赠金或缓存优惠。输入和输出价格均按 **100 万 token**计；网页存在折叠条目，本表只列本次能直接核验的候选。未实际调用收费 API，因此“快”“效果好”仍是需要实测的选型目标。

### 国际站：默认区域

| 官网展示模型 | API ID 核验情况 | 输入 USD | 输出 USD | 官网展示上下文 | 建议 |
| --- | --- | ---: | ---: | --- | --- |
| Qwen3.5-9B | 官方 Chat completions 文档明确列出 `Qwen/Qwen3.5-9B` | 0.10 | 0.15 | 262K | 首版低成本默认候选；中文角色一致性与首字延迟待带 Key 测试 |
| gpt-oss-20b | 官方接口文档列出 `openai/gpt-oss-20b` | 0.04 | 0.18 | 131K | 低价对照组；未核验中文陪伴适配与思考开销 |
| DeepSeek-V4.1-Flash | 价格页有展示名，本次接口文档枚举未见该版本的精确 ID | 0.15 | 0.60 | 1049K | 从用户模型列表获得精确 ID 后再评测，不猜测 ID |
| GLM-5.3-Flash | 价格页有展示名，本次接口文档枚举未见该版本的精确 ID | 0.15 | 0.50 | 1049K | 备选评测，先核验实际账户可调用 ID |

证据：[S1–S4]。官网“上下文长度”是模型能力展示，不代表本项目应每轮发送如此长的历史。

**推荐默认 `Qwen/Qwen3.5-9B`，并让用户通过设置中的实时模型列表确认可用性。**选择依据是国际站明确报价和接口文档已有精确 ID，非未经测试的质量排名。若它的实际服务不能关闭较长思考或角色表现不足，应在真实对话样本评测后更换，而非先许诺低延迟。

成本示例：假设每轮实际发送 2,000 输入 token、生成 200 输出 token，忽略缓存，Qwen3.5-9B 单轮为 `2000/1e6 × $0.10 + 200/1e6 × $0.15 = $0.00023`，1,000 轮约 **$0.23**。这是给定 token 用量的算例；中文字符不等于 token，不能把它当作任何用户的实际账单。

### 中国站：可选区域

| 官方 API ID | 输入 CNY | 输出 CNY | 计价条件及建议 |
| --- | ---: | ---: | --- |
| `Qwen/Qwen3.5-35B-A3B` | 0.40 | 3.20 | 输入 `<128k`；更长输入为 1.60 / 12.80。作为中国站低成本角色聊天候选。 |
| `inclusionAI/Ling-mini-2.0` | 0.50 | 2.00 | 低价对照组；需实测角色表达。 |
| `stepfun-ai/Step-3.5-Flash` | 0.70 | 2.10 | 低价候选；思考模式和延迟待验证。 |
| `deepseek-ai/DeepSeek-V3.2` | 4.00 | 6.00 | 中国官网显示缓存命中 0.40；作为质量对照组，不作为最便宜选项。 |

证据：[S5]。未因为官网某些模型标“免费”就推荐通用聊天默认使用：翻译、OCR、嵌入和重排序模型不能替代恋人对话模型。账户可用性、限流和变价需在设置页面中再次核验。

## 6. 接口与速度的已核验事实

- 国际及中国站均提供 `POST /chat/completions`，使用 `Authorization: Bearer …`；`stream: true` 以 SSE 返回，终止标记为 `data: [DONE]`。[S3、S6]
- 国际站 `GET /models` 使用 Bearer 鉴权，可按 `sub_type=chat` 筛选。实时列表证明该 Key 能访问的模型目录，不能证明余额足够或某次生成一定成功。[S4]
- 流式输出应显示 `delta.content`；不能把 `reasoning_content` 当恋人的正文。官网流式示例包含旧模型名称，不能直接据此断言旧模型当前可用。[S7]
- 国际站接口文档的 `messages` schema 当前声明 1–10 个元素。首版可保守采用 1 条系统设定 + 最多 8 条历史 + 本轮消息；如需扩大，应先凭有效 Key 核验当前真实限制。
- `enable_thinking` 属于模型能力相关字段。国际文档支持表尚未明确列入 Qwen3.5-9B，因此不能把所有模型一律套用同一思考开关。速度优化以实际兼容行为为准。
- 应先做一次对话调用，再异步处理未来的摘要/记忆提取，避免在回复前串行调用多个模型。首版不需要向量数据库或多代理推理链。
- 没有 API Key，不能报告真实模型的首 token 时间、吞吐量、平均响应时间或情绪价值评分。模拟 SSE 测试只能验证应用接收与显示能力。

## 7. 后续真实评测方案

固定评测输入而不是只看一个“你好”：工作受挫、表达边界、用户生气、记忆回指、初识/热恋/离异的同一句话、动物形态、性格冲突和背景提示词注入。记录模型/区域/参数/上下文长度，以及首正文延迟、完成时间、输出 token、错误率。人工按情绪承接、自然感、设定一致性、关系边界和记忆准确性评分。

先对默认模型和两个备选各运行相同样本，至少对 16 种用户/对象组合跑一轮基本身份验证，再做长对话观察。性能目标应作为验收目标单独列出，不能将官方宣传或单次快响应写成 SLA。

## 8. 来源登记

所有链接访问日期均为 **2026-10-03**。

| 编号 | 官方来源 | 本次核验范围 |
| --- | --- | --- |
| C1 | [Character.AI：Smarter Memory for Smarter Chats](https://blog.character.ai/memory/)（2026-05-21） | Story Memory、Facts、Memory Usage、固定消息与套餐说明 |
| C2 | [Character.AI：PipSqueak 3 / ShortSqueak](https://blog.character.ai/new-styles-new-plan/)（2026-09-28） | 简短日常聊天风格及发布状态 |
| C3 | [Character.AI：Lorebook](https://blog.character.ai/lorebook/)（2026-07-24） | 关键词触发的世界设定、共享设定及 beta 状态 |
| C4 | [Character.AI：Prompt Design](https://blog.character.ai/prompt-design-at-character-ai/)（正文日期 2024-08-01） | 提示词由状态组合、模板分段、上下文裁剪与复用 |
| R1 | [Replika 官网](https://replika.com/) | 记忆、角色定制、通话、自拍的官方声明 |
| N1 | [Nomi 官网](https://nomi.ai/) | 多对象、群聊、自定义背景、语音、主动消息、记忆的官方声明 |
| K1 | [Kindroid 官网](https://kindroid.ai/) | HTML 元描述的自定义角色、文本、自拍、语音 |
| K2 | [Kindroid 官方入门博客](https://kindroid.ai/v2/blog/the-ai-companion-starter-guide-how-to-make-one-actually-fit-you/)（2026-05-04） | 氛围定制、tweak/regenerate、角色一致性建议 |
| K3 | [Kindroid 的 Google Play 产品页](https://play.google.com/store/apps/details?id=com.kindroid.app&hl=en) | 开发者发布的背景、关键记忆和多模态说明 |
| P1 | [IPIP：Big-Five Factor Markers](https://ipip.ori.org/newBigFive5broadKey.htm) | 性格维度与行为项；不作为本项目风格标签有效性的证明 |
| D1 | [Apple Human Interface Guidelines：Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | 页面元描述强调深度、分层和层级；本次正文需 JavaScript，因此未引用更细规则 |
| S1 | [SiliconFlow 国际站价格页](https://www.siliconflow.com/pricing) | 美元价格、展示名与上下文快照 |
| S2 | [SiliconFlow 国际站 Quick Start](https://docs.siliconflow.com/en/userguide/quickstart) | 创建 Key、国际 Base URL、Playground |
| S3 | [SiliconFlow 国际站 Chat completions](https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions) | 精确模型 ID 枚举、SSE、参数与 messages schema |
| S4 | [SiliconFlow 国际站 List models](https://docs.siliconflow.com/en/api-reference/models/get-model-list) | Bearer 鉴权及类型筛选；可读 Markdown 版本本次访问成功 |
| S5 | [SiliconFlow 中国站价格页](https://www.siliconflow.cn/pricing) | 人民币价格、精确模型 ID、分档计价 |
| S6 | [SiliconFlow 中国站创建对话请求](https://api-docs.siliconflow.cn/docs/api/chat-completions-post) | 中国 Base URL、SSE、参数 |
| S7 | [SiliconFlow 国际站 Stream Mode](https://docs.siliconflow.com/en/faqs/stream-mode) | 增量输出、`delta.content`、curl 无缓冲示例 |

未核验的事项包括竞品内部提示词、实际长期记忆正确率、付费转换、用户留存、情绪改善、供应商每个模型的瞬时延迟与实际账户权限。本文不以营销文案、用户评价或价格页存在一个条目代替这些证据。
