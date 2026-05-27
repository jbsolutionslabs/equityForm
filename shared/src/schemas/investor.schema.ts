import { z } from 'zod'

export const InvestorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  accreditation: z.string().optional(),
  payload: z.record(z.unknown()),
})

export const UpdateInvestorSchema = InvestorSchema.partial()

export type CreateInvestor = z.infer<typeof InvestorSchema>
export type UpdateInvestor = z.infer<typeof UpdateInvestorSchema>
