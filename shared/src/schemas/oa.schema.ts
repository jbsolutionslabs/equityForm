import { z } from 'zod'

export const OaStatusEnum = z.enum(['NOT_GENERATED', 'GENERATED', 'SENT_FOR_SIGNATURE', 'SIGNED'])

export const UpdateOaSchema = z.object({
  status: OaStatusEnum.optional(),
  documentKey: z.string().optional(),
  generatedAt: z.string().datetime().optional(),
  sentAt: z.string().datetime().optional(),
  signedAt: z.string().datetime().optional(),
})

export type UpdateOa = z.infer<typeof UpdateOaSchema>
