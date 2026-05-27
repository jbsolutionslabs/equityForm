import React, { useEffect } from 'react'
import { useAuth, useClerk } from '@clerk/react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// Only called when ClerkProvider is mounted above
const ClerkGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth()
  const { redirectToSignIn } = useClerk()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Pass the app root as redirect_url so Clerk sends users back to / after
      // sign-in, not back to /#/sign-in which would cause an infinite loop.
      redirectToSignIn({ redirectUrl: window.location.origin + '/' })
    }
  }, [isLoaded, isSignedIn, redirectToSignIn])

  if (!isLoaded || !isSignedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  return <>{children}</>
}

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('[AuthGuard] PUBLISHABLE_KEY present:', !!PUBLISHABLE_KEY)
  // No Clerk key → passthrough (dev mode)
  if (!PUBLISHABLE_KEY) return <>{children}</>

  return <ClerkGuard>{children}</ClerkGuard>
}
