import { z } from 'zod'

export const SubscriptionStatusEnum = z.enum(['PENDING', 'GENERATED', 'SENT', 'SIGNED', 'PAID'])

export const CreateSubscriptionSchema = z.object({
  investorId: z.string(),
  amount: z.number().positive(),
  payload: z.record(z.unknown()).optional(),
})

export const UpdateSubscriptionSchema = z.object({
  amount: z.number().positive().optional(),
  status: SubscriptionStatusEnum.optional(),
  signedAt: z.string().datetime().optional(),
  paidAt: z.string().datetime().optional(),
  documentKey: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
})

export type CreateSubscription = z.infer<typeof CreateSubscriptionSchema>
export type UpdateSubscription = z.infer<typeof UpdateSubscriptionSchema>
