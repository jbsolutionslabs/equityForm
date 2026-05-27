import { z } from 'zod'

export const CreatePropertySchema = z.object({
  dealId: z.string(),
  name: z.string().min(1),
  assetClass: z.enum(['multifamily', 'hotel', 'office', 'retail', 'industrial', 'mixed_use', 'other']),
  payload: z.record(z.unknown()),
})

export const UpdatePropertySchema = CreatePropertySchema.partial().omit({ dealId: true })

export const UpsertMonthlyEntrySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  pnl: z.record(z.unknown()),
  belowLine: z.record(z.unknown()),
  workingCapital: z.record(z.unknown()),
  distributions: z.record(z.unknown()),
})

export type CreateProperty = z.infer<typeof CreatePropertySchema>
export type UpdateProperty = z.infer<typeof UpdatePropertySchema>
export type UpsertMonthlyEntry = z.infer<typeof UpsertMonthlyEntrySchema>
