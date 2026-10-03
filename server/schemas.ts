import { z } from 'zod';
import { PERSONALITIES } from '../shared/catalog';

const gender = z.enum(['male', 'female', 'undefined', 'animal']);
const stages = z.enum(['new', 'flirting', 'love', 'steady', 'separated', 'divorced']);
const knownPersonalities = new Set(PERSONALITIES.map((item) => item.id));

export const settingsSchema = z.object({
  provider: z.enum(['siliconflow', 'siliconflow-international', 'custom']),
  baseUrl: z.string().trim().min(1).max(300),
  apiKey: z
    .string()
    .trim()
    .min(1, '请先填写 API Key')
    .max(512)
    .refine((key) => !/[\r\n\u0000]/u.test(key), 'API Key 格式不正确'),
  model: z
    .string()
    .trim()
    .min(1, '请选择模型')
    .max(150)
    .refine((model) => !/[\r\n\u0000]/u.test(model), '模型名称格式不正确'),
  temperature: z.number().min(0).max(2),
  remember: z.boolean(),
});

export const companionSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(20),
    userGender: gender,
    gender,
    animalType: z.string().trim().max(30),
    personalityIds: z
      .array(z.string().refine((id) => knownPersonalities.has(id), '存在未知性格'))
      .min(1)
      .max(3)
      .refine((ids) => new Set(ids).size === ids.length, '不能重复选择性格'),
    stage: stages,
    background: z.string().trim().max(600),
    avatar: z.string().max(50),
    color: z.string().max(30),
    createdAt: z.number().finite().nonnegative(),
    updatedAt: z.number().finite().nonnegative(),
  })
  .refine(
    (companion) =>
      (companion.gender !== 'animal' && companion.userGender !== 'animal') ||
      Boolean(companion.animalType),
    {
      message: '动物身份需要填写动物种类',
      path: ['animalType'],
    },
  );

export const settingsRequestSchema = z.object({ settings: settingsSchema });
export const chatRequestSchema = settingsRequestSchema.extend({
  companion: companionSchema,
  messages: z
    .array(
      z.discriminatedUnion('role', [
        z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(4000) }),
        z.object({ role: z.literal('assistant'), content: z.string().min(1).max(20_000) }),
      ]),
    )
    .min(1)
    .max(120)
    .refine((messages) => messages.at(-1)?.role === 'user', '最后一条消息必须来自用户'),
});

export function validationMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return '请求格式不正确';
  const field = first.path.join('.');
  if (first.code === 'too_big') return `${field || '请求'} 超过允许的长度或数量`;
  if (first.code === 'too_small')
    return first.message.startsWith('请') ? first.message : `${field || '请求'} 不能为空`;
  if (first.code === 'custom') return first.message;
  return `${field || '请求'} 格式不正确`;
}
