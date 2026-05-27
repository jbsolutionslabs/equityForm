import React from 'react'
import { SignIn as ClerkSignIn } from '@clerk/react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

export const SignIn: React.FC = () => {
  if (!PUBLISHABLE_KEY) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--color-slate-500)' }}>
          Auth not configured. Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>.env</code>.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--color-navy-900)',
    }}>
      <ClerkSignIn fallbackRedirectUrl="/" />
    </div>
  )
}
