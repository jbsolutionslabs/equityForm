import { z } from 'zod'

export const CreateTemplateSchema = z.object({
  type: z.enum(['debt', 'pref', 'waterfall', 'fee']),
  name: z.string().min(1).max(200),
  payload: z.record(z.unknown()),
})

export const UpdateTemplateSchema = CreateTemplateSchema.partial()

export type CreateTemplate = z.infer<typeof CreateTemplateSchema>
export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>
