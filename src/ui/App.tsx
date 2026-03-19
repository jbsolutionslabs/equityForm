import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './components/Shell'
import { DealSetup } from './views/DealSetup'
import { Offering } from './views/Offering'
import { Investors } from './views/Investors'
import { Review } from './views/Review'
import { useAppStore } from '../state/store'

export const App: React.FC = () => {
  const reset = useAppStore((s: any) => s.reset)
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/deal" replace />} />
        <Route path="/deal" element={<DealSetup />} />
        <Route path="/offering" element={<Offering />} />
        <Route path="/investors" element={<Investors />} />
        <Route path="/review" element={<Review />} />
      </Routes>
    </Shell>
  )
}
