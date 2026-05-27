import { z } from 'zod'

const SpvItemSchema = z.object({
  complete: z.boolean(),
  completedAt: z.string().optional(),
  entityName: z.string().optional(),
  nameLocked: z.boolean().optional(),
  agentProvider: z.enum(['northwest', 'incorp', 'ctcorp']).optional(),
  agentName: z.string().optional(),
  agentAddress: z.string().optional(),
  agentConfirmationId: z.string().optional(),
  agentAnnualRenewalDate: z.string().optional(),
  certFilingType: z.enum(['standard', 'same_day']).optional(),
  certFilingFee: z.number().optional(),
  certificateNumber: z.string().optional(),
  dateFiled: z.string().optional(),
  certEstimatedCompletion: z.string().optional(),
  ein: z.string().optional(),
  foreignQualRequired: z.boolean().optional(),
  foreignQualState: z.string().optional(),
  foreignQualStateName: z.string().optional(),
  foreignQualFee: z.number().optional(),
  foreignQualTimeline: z.number().optional(),
  foreignQualConfirmationId: z.string().optional(),
  foreignQualFilingMethod: z.enum(['api', 'manual']).optional(),
  foreignQualEstimatedCompletion: z.string().optional(),
}).passthrough()

export const UpdateSpvSchema = z.object({
  entityName: SpvItemSchema.optional(),
  registeredAgent: SpvItemSchema.optional(),
  certOfFormation: SpvItemSchema.optional(),
  einObtained: SpvItemSchema.optional(),
  foreignQualification: SpvItemSchema.optional(),
})

export type UpdateSpv = z.infer<typeof UpdateSpvSchema>
