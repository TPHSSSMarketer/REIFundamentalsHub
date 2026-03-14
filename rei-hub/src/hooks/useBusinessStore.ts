import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Business {
  id: string
  name: string
  description: string | null
  mission_statement: string | null
  is_active: boolean
  is_primary: boolean
}

export interface BusinessState {
  // Current business
  currentBusiness: Business | null
  setCurrentBusiness: (business: Business | null) => void

  // All businesses for the user
  businesses: Business[]
  setBusinesses: (businesses: Business[]) => void

  // Loading state
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Helper: add a business to the list
  addBusiness: (business: Business) => void

  // Helper: remove business from list
  removeBusiness: (id: string) => void

  // Helper: update a business in the list
  updateBusinessInList: (id: string, updates: Partial<Business>) => void
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      currentBusiness: null,
      setCurrentBusiness: (business) => set({ currentBusiness: business }),

      businesses: [],
      setBusinesses: (businesses) => set({ businesses }),

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),

      addBusiness: (business) => {
        const { businesses } = get()
        set({ businesses: [...businesses, business] })
      },

      removeBusiness: (id) => {
        const { businesses, currentBusiness } = get()
        const updated = businesses.filter((b) => b.id !== id)
        set({
          businesses: updated,
          // Clear currentBusiness if it was the one being removed
          currentBusiness: currentBusiness?.id === id ? null : currentBusiness,
        })
      },

      updateBusinessInList: (id, updates) => {
        const { businesses, currentBusiness } = set((state) => ({
          businesses: state.businesses.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
          currentBusiness:
            currentBusiness?.id === id
              ? { ...currentBusiness, ...updates }
              : currentBusiness,
        }))

        // Return the updated state for consistency
        return { businesses, currentBusiness }
      },
    }),
    {
      name: 'rei-hub-business',
      partialize: (state) => ({
        currentBusiness: state.currentBusiness,
      }),
    }
  )
)
