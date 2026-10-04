import { z } from 'zod';
import { AVATARS, COLORS, PERSONALITIES } from '../../shared/catalog';
import { providerKeyError, validProviderBaseUrl } from '../../shared/providers';

const gender = z.enum(['male', 'female', 'undefined', 'animal']);
export const draftSchema = z
  .object({
    name: z.string().trim().min(1, '请为对象起一个名字').max(20, '名字最多 20 个字'),
    userGender: gender,
    gender,
    animalType: z.string().trim().max(30, '动物种类最多 30 个字'),
    personalityIds: z
      .array(z.string().refine((id) => PERSONALITIES.some((p) => p.id === id), '请选择已有性格'))
      .min(1, '至少选择一种性格')
      .max(3, '最多选择三种性格')
      .refine((ids) => new Set(ids).size === ids.length, '性格不可重复'),
    stage: z.enum(['new', 'flirting', 'love', 'steady', 'separated', 'divorced']),
    background: z.string().trim().max(600, '补充说明最多 600 个字'),
    avatar: z.string().refine((s) => AVATARS.includes(s), '请选择已有头像'),
    color: z.string().refine((s) => COLORS.includes(s), '请选择已有颜色'),
  })
  .refine((d) => (d.gender !== 'animal' && d.userGender !== 'animal') || d.animalType.length > 0, {
    message: '请填写动物伙伴的种类',
    path: ['animalType'],
  });

export const companionSchema = draftSchema.safeExtend({
  id: z.uuid('对象编号格式不正确'),
  createdAt: z.number().nonnegative().finite(),
  updatedAt: z.number().nonnegative().finite(),
});
const messageSchema = z
  .object({
    id: z.uuid('消息编号格式不正确'),
    role: z.enum(['user', 'assistant']),
    content: z.string().max(20000),
    createdAt: z.number().nonnegative().finite(),
    status: z.enum(['complete', 'streaming', 'error', 'stopped']),
    error: z.string().max(2000).optional(),
  })
  .refine((m) => m.role !== 'user' || m.content.length <= 4000, '用户消息最多 4000 个字')
  .refine((m) => m.role !== 'user' || m.status === 'complete', '用户消息状态不正确')
  .refine((m) => m.status !== 'complete' || m.content.trim().length > 0, '已完成消息内容不能为空');
export const dataSchema = z
  .object({
    version: z.literal(1),
    companions: z.array(companionSchema).max(100),
    conversations: z.record(z.string(), z.array(messageSchema).max(5000)),
    activeId: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.companions.map((c) => c.id));
    if (ids.size !== data.companions.length)
      ctx.addIssue({ code: 'custom', message: '对象编号不可重复' });
    if (data.activeId && !ids.has(data.activeId))
      ctx.addIssue({ code: 'custom', message: '当前对象不存在' });
    for (const [id, messages] of Object.entries(data.conversations)) {
      if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: '聊天记录引用了不存在的对象' });
      if (new Set(messages.map((m) => m.id)).size !== messages.length)
        ctx.addIssue({ code: 'custom', message: '消息编号不可重复' });
    }
  });
export const settingsSchema = z
  .object({
    provider: z.enum(['mimo', 'siliconflow', 'siliconflow-international']),
    baseUrl: z
      .string()
      .trim()
      .url('请输入完整的 API 地址')
      .max(300)
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
        );
      }, 'API 地址必须使用 HTTPS，且不能包含账号、查询参数或片段'),
    apiKey: z.string().trim().max(500, 'API Key 过长'),
    model: z.string().trim().min(1, '请输入模型名称').max(150),
    temperature: z.number().min(0).max(2),
    remember: z.boolean(),
  })
  .refine((settings) => validProviderBaseUrl(settings.provider, settings.baseUrl), {
    message: '只支持小米 MiMo 和硅基流动的官方接口',
    path: ['baseUrl'],
  })
  .superRefine((settings, ctx) => {
    const message = providerKeyError(settings);
    if (message) ctx.addIssue({ code: 'custom', message, path: ['apiKey'] });
  });
export function validationError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? '资料格式不正确';
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}
