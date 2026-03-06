import { create } from 'zustand'
import type { Pipeline, Deal, Contact } from '@/types'

interface AppState {
  // Selected pipeline
  selectedPipelineId: string | null
  setSelectedPipelineId: (id: string | null) => void

  // Modals
  isNewDealModalOpen: boolean
  setNewDealModalOpen: (open: boolean) => void

  isNewContactModalOpen: boolean
  setNewContactModalOpen: (open: boolean) => void

  isSMSModalOpen: boolean
  setSMSModalOpen: (open: boolean) => void

  // Selected items for editing/viewing
  selectedDeal: Deal | null
  setSelectedDeal: (deal: Deal | null) => void

  selectedContact: Contact | null
  setSelectedContact: (contact: Contact | null) => void

  // SMS composer target
  smsTargetContact: Contact | null
  setSMSTargetContact: (contact: Contact | null) => void

  // Sidebar state
  isSidebarCollapsed: boolean
  toggleSidebar: () => void

  // Mobile drawer
  isMobileDrawerOpen: boolean
  setMobileDrawerOpen: (open: boolean) => void
  toggleMobileDrawer: () => void

  // Search
  globalSearch: string
  setGlobalSearch: (search: string) => void
}

export const useStore = create<AppState>((set) => ({
  // Pipeline
  selectedPipelineId: null,
  setSelectedPipelineId: (id) => set({ selectedPipelineId: id }),

  // Modals
  isNewDealModalOpen: false,
  setNewDealModalOpen: (open) => set({ isNewDealModalOpen: open }),

  isNewContactModalOpen: false,
  setNewContactModalOpen: (open) => set({ isNewContactModalOpen: open }),

  isSMSModalOpen: false,
  setSMSModalOpen: (open) => set({ isSMSModalOpen: open }),

  // Selected items
  selectedDeal: null,
  setSelectedDeal: (deal) => set({ selectedDeal: deal }),

  selectedContact: null,
  setSelectedContact: (contact) => set({ selectedContact: contact }),

  // SMS target
  smsTargetContact: null,
  setSMSTargetContact: (contact) => set({ smsTargetContact: contact }),

  // Sidebar
  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  // Mobile drawer
  isMobileDrawerOpen: false,
  setMobileDrawerOpen: (open) => set({ isMobileDrawerOpen: open }),
  toggleMobileDrawer: () => set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),

  // Search
  globalSearch: '',
  setGlobalSearch: (search) => set({ globalSearch: search }),
}))
