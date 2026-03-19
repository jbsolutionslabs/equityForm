import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './components/Shell'
import { DealSetup }         from './views/DealSetup'
import { Offering }          from './views/Offering'
import { SpvFormation }      from './views/SpvFormation'
import { OperatingAgreement } from './views/OperatingAgreement'
import { Investors }         from './views/Investors'
import { ESignature }        from './views/ESignature'
import { WireTracking }      from './views/WireTracking'
import { CapTable }          from './views/CapTable'

export const App: React.FC = () => (
  <Shell>
    <Routes>
      <Route path="/"          element={<Navigate to="/deal" replace />} />
      <Route path="/deal"      element={<DealSetup />} />
      <Route path="/offering"  element={<Offering />} />
      <Route path="/spv"       element={<SpvFormation />} />
      <Route path="/oa"        element={<OperatingAgreement />} />
      <Route path="/investors" element={<Investors />} />
      <Route path="/signatures" element={<ESignature />} />
      <Route path="/wires"     element={<WireTracking />} />
      <Route path="/captable"  element={<CapTable />} />
      {/* Backward compat */}
      <Route path="/review"    element={<Navigate to="/oa" replace />} />
    </Routes>
  </Shell>
)
