import React, { useEffect } from 'react'
import { useMyFirm, useCreateFirm } from '../../api/hooks/useFirm'

/**
 * Runs once after sign-in. Fetches the user's firm or creates one if it
 * doesn't exist yet. Sets the X-Firm-Id header for all subsequent API calls.
 */
export const FirmBootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data, isError, isLoading } = useMyFirm()
  const { mutate: createFirm, isPending } = useCreateFirm()

  useEffect(() => {
    if (isError) {
      createFirm('My Firm')
    }
  }, [isError, createFirm])

  // Show nothing until firm is ready
  if (isLoading || isPending || (!data && !isError)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  return <>{children}</>
}
