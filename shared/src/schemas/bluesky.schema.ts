import { z } from 'zod'

export const UpsertBlueSkyFilingSchema = z.object({
  payload: z.record(z.unknown()),
})

export type UpsertBlueSkyFiling = z.infer<typeof UpsertBlueSkyFilingSchema>
