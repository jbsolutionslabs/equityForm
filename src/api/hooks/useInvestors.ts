import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'

export interface InvestorRecord {
  id: string
  dealId: string
  name: string
  email: string
  accreditation?: string
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export function useInvestors(dealId: string | undefined) {
  return useQuery<InvestorRecord[]>({
    queryKey: ['deals', dealId, 'investors'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/deals/${dealId}/investors`)
      return data
    },
    enabled: !!dealId,
  })
}

export function useCreateInvestor(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; email: string; accreditation?: string; payload: Record<string, unknown> }) => {
      const { data } = await apiClient.post(`/deals/${dealId}/investors`, body)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals', dealId, 'investors'] }),
  })
}

export function useUpdateInvestor(dealId: string, investorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<InvestorRecord>) => {
      const { data } = await apiClient.patch(`/deals/${dealId}/investors/${investorId}`, body)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals', dealId, 'investors'] }),
  })
}

export function useDeleteInvestor(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (investorId: string) => {
      await apiClient.delete(`/deals/${dealId}/investors/${investorId}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals', dealId, 'investors'] }),
  })
}
