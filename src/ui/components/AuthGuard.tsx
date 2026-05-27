import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// Only called when ClerkProvider is mounted above
const ClerkGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth()

  console.log('[AuthGuard] key:', PUBLISHABLE_KEY?.slice(0, 12), 'isLoaded:', isLoaded, 'isSignedIn:', isSignedIn)

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('[AuthGuard] PUBLISHABLE_KEY present:', !!PUBLISHABLE_KEY)
  // No Clerk key → passthrough (dev mode)
  if (!PUBLISHABLE_KEY) return <>{children}</>

  return <ClerkGuard>{children}</ClerkGuard>
}
