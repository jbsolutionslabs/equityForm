import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './components/Shell'
import { AuthGuard }               from './components/AuthGuard'
import { ClerkTokenBridge }        from './components/ClerkTokenBridge'
import { FirmBootstrap }           from './components/FirmBootstrap'
import { SignIn }                  from './views/SignIn'
import { GpDashboard }             from './views/GpDashboard'
import { DealsList }               from './views/DealsList'
import { DealSetup }               from './views/DealSetup'
import { SpvFormation }            from './views/SpvFormation'
import { OperatingAgreement }      from './views/OperatingAgreement'
import { Investors }               from './views/Investors'
import { ESignature }              from './views/ESignature'
import { WireTracking }            from './views/WireTracking'
import { CapTable }                from './views/CapTable'
import { AccountingDashboard }     from './views/accounting/AccountingDashboard'
import { Economics }               from './views/economics/Economics'
import { Compliance }              from './views/Compliance'
import { Terms }                   from './views/Terms'
import { Privacy }                 from './views/Privacy'

export const App: React.FC = () => (
  <Routes>
    {/* Public routes */}
    <Route path="/sign-in" element={<SignIn />} />
    <Route path="/sign-up" element={<SignIn />} />
    <Route path="/terms"   element={<Terms />} />
    <Route path="/privacy" element={<Privacy />} />

    {/* Protected routes */}
    <Route
      path="*"
      element={
        <AuthGuard>
          <ClerkTokenBridge />
          <FirmBootstrap>
          <Shell>
            <Routes>
              {/* Top-level */}
              <Route path="/"           element={<Navigate to="/deals" replace />} />
              <Route path="/dashboard"  element={<GpDashboard />} />
              <Route path="/accounting" element={<AccountingDashboard />} />
              <Route path="/compliance" element={<Compliance />} />
              <Route path="/deals"      element={<DealsList />} />

              {/* Per-deal routes */}
              <Route path="/deals/:dealId/questionnaire" element={<DealSetup />} />
              <Route path="/deals/:dealId/economics"     element={<Economics />} />
              <Route path="/deals/:dealId/spv"           element={<SpvFormation />} />
              <Route path="/deals/:dealId/oa"            element={<OperatingAgreement />} />
              <Route path="/deals/:dealId/investors"     element={<Investors />} />
              <Route path="/deals/:dealId/signatures"    element={<ESignature />} />
              <Route path="/deals/:dealId/wires"         element={<WireTracking />} />
              <Route path="/deals/:dealId/captable"      element={<CapTable />} />

              {/* Legacy flat routes — redirect to /deals */}
              <Route path="/deal"       element={<Navigate to="/deals" replace />} />
              <Route path="/offering"   element={<Navigate to="/deals" replace />} />
              <Route path="/economics"  element={<Navigate to="/deals" replace />} />
              <Route path="/spv"        element={<Navigate to="/deals" replace />} />
              <Route path="/oa"         element={<Navigate to="/deals" replace />} />
              <Route path="/review"     element={<Navigate to="/deals" replace />} />
              <Route path="/investors"  element={<Navigate to="/deals" replace />} />
              <Route path="/signatures" element={<Navigate to="/deals" replace />} />
              <Route path="/wires"      element={<Navigate to="/deals" replace />} />
              <Route path="/captable"   element={<Navigate to="/deals" replace />} />
            </Routes>
          </Shell>
          </FirmBootstrap>
        </AuthGuard>
      }
    />
  </Routes>
)
