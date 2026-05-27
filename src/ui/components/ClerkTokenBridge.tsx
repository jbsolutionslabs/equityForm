import React, { useEffect } from 'react'
import { useAuth } from '@clerk/react'
import { setTokenProvider } from '../../api/client'

/**
 * Wires Clerk's getToken into the Axios client.
 * Must be rendered inside ClerkProvider.
 */
export const ClerkTokenBridge: React.FC = () => {
  const { getToken } = useAuth()

  useEffect(() => {
    setTokenProvider(() => getToken())
  }, [getToken])

  return null
}
