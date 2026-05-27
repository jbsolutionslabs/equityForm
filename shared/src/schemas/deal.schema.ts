import { z } from 'zod'

export const CreateDealSchema = z.object({
  name: z.string().min(1).max(200),
  propertyAddress: z.string().optional(),
  propertyState: z.string().length(2).optional(),
  assetClass: z.enum(['multifamily', 'hotel', 'office', 'retail', 'industrial', 'mixed_use', 'other']).optional(),
})

export const UpdateDealSchema = CreateDealSchema.partial()

export const DealOfferingSchema = z.object({
  payload: z.record(z.unknown()),
})

export const DealBankingSchema = z.object({
  payload: z.record(z.unknown()),
})

export type CreateDeal = z.infer<typeof CreateDealSchema>
export type UpdateDeal = z.infer<typeof UpdateDealSchema>
export type DealOffering = z.infer<typeof DealOfferingSchema>
export type DealBanking = z.infer<typeof DealBankingSchema>
