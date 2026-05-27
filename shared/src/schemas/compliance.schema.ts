import { z } from 'zod'

export const CreateComplianceEntitySchema = z.object({
  payload: z.record(z.unknown()),
})

export const UpdateComplianceEntitySchema = CreateComplianceEntitySchema.partial()

export type CreateComplianceEntity = z.infer<typeof CreateComplianceEntitySchema>
export type UpdateComplianceEntity = z.infer<typeof UpdateComplianceEntitySchema>
