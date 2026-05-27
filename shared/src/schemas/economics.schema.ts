import { z } from 'zod'

export const UpdateEconomicsSchema = z.object({
  capitalStack: z.record(z.unknown()).optional(),
  profitSplit: z.record(z.unknown()).optional(),
  fees: z.record(z.unknown()).optional(),
  sectionAComplete: z.boolean().optional(),
  sectionBComplete: z.boolean().optional(),
  sectionCComplete: z.boolean().optional(),
})

export type UpdateEconomics = z.infer<typeof UpdateEconomicsSchema>
