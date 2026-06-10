import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore, isSpvFormed, canSendSubAgreements, AppDealEntry, AppData, defaultData } from '../../state/store'
import { useEconomicsStore, isEconomicsLocked } from '../../state/economicsStore'
import { useCreateDeal, useDeleteDeal } from '../../api/hooks/useDeals'
import { useDealsSync } from '../../api/hooks/useDealSync'
import CompletionBadge from '../components/CompletionBadge'

/* ─── Stage definitions (mirrors Shell.tsx) ─────────────────────────────── */
type StageInfo = {
  key: string
  label: string
  path: string
  done: (data: AppData, econLocked: boolean) => boolean
}

const STAGES: StageInfo[] = [
  {
    key:  'questionnaire',
    label: 'Questionnaire',
    path: 'questionnaire',
    done: (d) => !!(d.deal.entityName && d.offering.offeringExemption),
  },
  {
    key:  'economics',
    label: 'Deal Economics',
    path: 'economics',
    done: (_d, econLocked) => econLocked,
  },
  {
    key:  'spv',
    label: 'SPV Formation',
    path: 'spv',
    done: (d) => isSpvFormed(d),
  },
  {
    key:  'oa',
    label: 'Operating Agreement',
    path: 'oa',
    done: (d) => d.operatingAgreement?.status === 'signed',
  },
  {
    key:  'investors',
    label: 'Investor Intake',
    path: 'investors',
    done: (d) => d.investors.length > 0 && d.subscriptions.some((s) => s.status !== 'pending'),
  },
  {
    key:  'signatures',
    label: 'E-Signatures',
    path: 'signatures',
    done: (d) =>
      d.subscriptions.length > 0 &&
      d.subscriptions.every((s) => s.status === 'signed' || s.status === 'paid'),
  },
  {
    key:  'wires',
    label: 'Wire Tracking',
    path: 'wires',
    done: (d) =>
      d.subscriptions.length > 0 &&
      d.subscriptions.every((s) => s.status === 'paid'),
  },
  {
    key:  'captable',
    label: 'Cap Table Lock',
    path: 'captable',
    done: (d) => !!d.deal.capTableLockedAt,
  },
]

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getCurrentStagePath(data: AppData, econLocked: boolean): string {
  for (const stage of STAGES) {
    if (!stage.done(data, econLocked)) return stage.path
  }
  return 'captable'
}

function getDoneCount(data: AppData, econLocked: boolean): number {
  return STAGES.filter((s) => s.done(data, econLocked)).length
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '' }
}

/* ─── Deal card ─────────────────────────────────────────────────────────── */
function DealCard({ entry, econLocked }: { entry: AppDealEntry; econLocked: boolean }) {
  const navigate   = useNavigate()
  const removeDeal = useAppStore((s) => s.removeDeal)
  const { mutateAsync: deleteDealApi, isPending: deleting } = useDeleteDeal()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, id } = entry
  const doneCount = getDoneCount(data, econLocked)
  const isComplete = !!data.deal.capTableLockedAt
  const currentPath = getCurrentStagePath(data, econLocked)
  const entityName = data.deal.entityName || 'Untitled Deal'

  const currentStage    = STAGES.find((s) => s.path === currentPath)
  const currentStageIdx = STAGES.findIndex((s) => s.path === currentPath)

  const handleDelete = async () => {
    await deleteDealApi(id)
    removeDeal(id) // remove from store immediately without waiting for re-fetch
  }

  return (
    <div className="deal-card">
      <div className="deal-card-main">
        <div className="deal-card-header">
          <div>
            <h3 className="deal-card-name">{entityName}</h3>
            {data.deal.propertyAddress && (
              <p className="deal-card-address">{data.deal.propertyAddress}</p>
            )}
          </div>
          <span className={`deal-card-badge ${isComplete ? 'deal-card-badge--complete' : 'deal-card-badge--active'}`}>
            {isComplete ? 'Cap Table Locked' : 'In Progress'}
          </span>
        </div>

        <div className="deal-card-progress">
          <div className="deal-card-progress-dots">
            {STAGES.map((s, i) => {
              const done = s.done(data, econLocked)
              const active = i === currentStageIdx && !isComplete
              return (
                <span
                  key={s.key}
                  className={[
                    'deal-progress-dot',
                    done ? 'deal-progress-dot--done' : '',
                    active ? 'deal-progress-dot--active' : '',
                  ].filter(Boolean).join(' ')}
                  title={s.label}
                />
              )
            })}
          </div>
          <span className="deal-card-progress-label">
            {isComplete
              ? 'All 8 stages complete'
              : `Stage ${currentStageIdx + 1} of 8 — ${currentStage?.label}`}
          </span>
        </div>

        <div className="deal-card-meta">
          <span>Created {fmtDate(entry.createdAt)}</span>
          <CompletionBadge dealId={id} />
        </div>
      </div>

      <div className="deal-card-actions">
        {confirmDelete ? (
          <div className="deal-card-confirm-delete">
            <span className="deal-card-confirm-label">Delete this deal?</span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/deals/${id}/${currentPath}`)}
            >
              {isComplete ? 'View Deal →' : 'Continue →'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${entityName}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Main view ─────────────────────────────────────────────────────────── */
export const DealsList: React.FC = () => {
  const navigate  = useNavigate()
  const createDeal        = useAppStore((s) => s.createDeal)
  const hydrateDeal       = useAppStore((s) => s.hydrateDeal)
  const deals             = useAppStore((s) => s.deals)
  const econDeals         = useEconomicsStore((s) => s.deals)
  const { mutateAsync: createDealApi } = useCreateDeal()
  const { isLoading: syncing } = useDealsSync()

  const dealEntries = Object.values(deals).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const handleCreate = async () => {
    try {
      // Create in DB first — get the real ID back
      const newDeal = await createDealApi({ name: 'New Deal' })
      // Hydrate Zustand with the new DB entry
      hydrateDeal(newDeal.id, {
        id: newDeal.id,
        createdAt: newDeal.createdAt,
        data: { ...defaultData },
      })
      navigate(`/deals/${newDeal.id}/questionnaire`)
    } catch {
      // Fallback: create locally if API is unreachable
      const id = createDeal()
      navigate(`/deals/${id}/questionnaire`)
    }
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1>Deals</h1>
          <p className="page-header-subtitle">Manage all your deal formations in one place.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleCreate}>
          + Create New Deal
        </button>
      </div>

      {/* Subtle top bar while re-fetching over existing data */}
      {syncing && dealEntries.length > 0 && (
        <div className="deals-refresh-bar" aria-label="Refreshing deals…" />
      )}

      {syncing && dealEntries.length === 0 ? (
        /* Initial load — show skeletons so the page doesn't flash "No deals yet" */
        <div className="deals-list" aria-busy="true" aria-label="Loading deals">
          {[1, 2, 3].map((n) => (
            <div key={n} className="deal-card deal-card--skeleton">
              <div className="deal-card-main">
                <div className="skel skel--name" />
                <div className="skel skel--address" />
                <div className="skel skel--progress" />
                <div className="skel skel--meta" />
              </div>
              <div className="deal-card-actions">
                <div className="skel skel--btn" />
              </div>
            </div>
          ))}
        </div>
      ) : dealEntries.length === 0 ? (
        <div className="deals-empty">
          <div className="deals-empty-icon" aria-hidden="true">📋</div>
          <h2 className="deals-empty-title">No deals yet</h2>
          <p className="deals-empty-desc">
            Create your first deal to get started with the guided SPV formation workflow.
          </p>
        </div>
      ) : (
        <div className="deals-list">
          {dealEntries.map((entry) => {
            const econDeal = econDeals.find((d) => d.dealId === entry.id)
            const econLocked = isEconomicsLocked(econDeal)
            return <DealCard key={entry.id} entry={entry} econLocked={econLocked} />
          })}
        </div>
      )}
    </div>
  )
}
