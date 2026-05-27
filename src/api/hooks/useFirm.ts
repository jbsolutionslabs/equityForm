import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, setActiveFirm } from '../client'

export interface FirmRecord {
  id: string
  name: string
  createdAt: string
}

export function useMyFirm() {
  return useQuery<{ firm: FirmRecord; role: string }>({
    queryKey: ['firm', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/firms/me')
      // Auto-set firm header for subsequent requests
      setActiveFirm(data.firm.id)
      return data
    },
    retry: false,
  })
}

export function useCreateFirm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await apiClient.post('/firms', { name })
      setActiveFirm(data.id)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firm'] }),
  })
}
