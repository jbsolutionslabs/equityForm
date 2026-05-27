import { create } from 'zustand'

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface SaveIndicatorStore {
  state: SaveState
  lastSavedAt: string | null
  setPending: () => void
  setSaving:  () => void
  setSaved:   () => void
  setError:   () => void
  reset:      () => void
}

export const useSaveIndicator = create<SaveIndicatorStore>((set) => ({
  state:       'idle',
  lastSavedAt: null,

  setPending: () => set({ state: 'pending' }),
  setSaving:  () => set({ state: 'saving' }),
  setSaved:   () => set({ state: 'saved', lastSavedAt: new Date().toISOString() }),
  setError:   () => set({ state: 'error' }),
  reset:      () => set({ state: 'idle' }),
}))
