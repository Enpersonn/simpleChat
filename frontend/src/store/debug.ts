import { create } from 'zustand'
import type { PipelineEvent, ContextSnapshot } from '../lib/debug-types.js'

interface DebugState {
  events: PipelineEvent[]
  snapshot: ContextSnapshot | null
  activeTab: 'flow' | 'graph' | 'prompt'
  addEvent: (event: PipelineEvent) => void
  setSnapshot: (snapshot: ContextSnapshot) => void
  setTab: (tab: 'flow' | 'graph' | 'prompt') => void
  clear: () => void
}

export const useDebugStore = create<DebugState>((set) => ({
  events: [],
  snapshot: null,
  activeTab: 'flow',
  addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  setSnapshot: (snapshot) => set({ snapshot }),
  setTab: (tab) => set({ activeTab: tab }),
  clear: () => set({ events: [], snapshot: null }),
}))
