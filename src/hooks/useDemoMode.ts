import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DemoModeState {
  isDemoMode: boolean
  enableDemoMode: () => void
  disableDemoMode: () => void
}

export const useDemoMode = create<DemoModeState>()(
  persist(
    (set) => ({
      isDemoMode: false,
      enableDemoMode: () => set({ isDemoMode: true }),
      disableDemoMode: () => set({ isDemoMode: false }),
    }),
    {
      name: 'rei-hub-demo-mode',
    }
  )
)
