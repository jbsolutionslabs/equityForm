import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'

export interface DealSummary {
  id: string
  name: string
  propertyAddress?: string
  propertyState?: string
  assetClass?: string
  stage: number
  capTableLockedAt?: string
  createdAt: string
  updatedAt: string
}

// List all deals
export function useDeals() {
  return useQuery<DealSummary[]>({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data } = await apiClient.get('/deals')
      return data
    },
  })
}

// Get single deal with all nested data
export function useDeal(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deals', dealId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/deals/${dealId}`)
      return data
    },
    enabled: !!dealId,
  })
}

// Create deal
export function useCreateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; propertyAddress?: string; propertyState?: string; assetClass?: string }) => {
      const { data } = await apiClient.post('/deals', body)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}

// Update deal
export function useUpdateDeal(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<DealSummary>) => {
      const { data } = await apiClient.patch(`/deals/${dealId}`, body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deals', dealId] })
    },
  })
}

// Delete deal
export function useDeleteDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dealId: string) => {
      await apiClient.delete(`/deals/${dealId}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
}
