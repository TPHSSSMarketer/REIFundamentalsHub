import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiService } from '@/services/api'
import { useDemoMode } from './useDemoMode'
import { mockContacts, mockDeals, mockPipelines, mockMetrics, mockActivities } from '@/data/mockData'
import type { Contact, Deal, DashboardMetrics, Activity } from '@/types'
import { toast } from 'sonner'

// ============ CONTACTS HOOKS ============

export function useContacts(params?: { limit?: number; offset?: number; query?: string }) {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['contacts', params],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        let filtered = [...mockContacts]
        if (params?.query) {
          const q = params.query.toLowerCase()
          filtered = filtered.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.email.toLowerCase().includes(q) ||
              c.phone.includes(q)
          )
        }
        return { contacts: filtered, total: filtered.length }
      }
      return apiService.getContacts(params)
    },
  })
}

export function useContact(contactId: string) {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 200))
        return mockContacts.find((c) => c.id === contactId) || null
      }
      return apiService.getContact(contactId)
    },
    enabled: !!contactId,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async (contact: Partial<Contact>) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 500))
        const newContact: Contact = {
          id: `demo-${Date.now()}`,
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email || '',
          phone: contact.phone || '',
          tags: contact.tags || [],
          source: contact.source,
          dateAdded: new Date().toISOString(),
        }
        mockContacts.unshift(newContact)
        return newContact
      }
      return apiService.createContact(contact)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact created successfully')
    },
    onError: () => {
      toast.error('Failed to create contact')
    },
  })
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Contact> }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        const index = mockContacts.findIndex((c) => c.id === id)
        if (index !== -1) {
          mockContacts[index] = { ...mockContacts[index], ...data }
          return mockContacts[index]
        }
        throw new Error('Contact not found')
      }
      return apiService.updateContact(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact updated successfully')
    },
    onError: () => {
      toast.error('Failed to update contact')
    },
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async (contactId: string) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        const index = mockContacts.findIndex((c) => c.id === contactId)
        if (index !== -1) {
          mockContacts.splice(index, 1)
        }
        return
      }
      return apiService.deleteContact(contactId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete contact')
    },
  })
}

// ============ DEALS HOOKS ============

export function useDeals(pipelineId?: string) {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['deals', pipelineId],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        let filtered = [...mockDeals]
        if (pipelineId) {
          filtered = filtered.filter((d) => d.pipelineId === pipelineId)
        }
        return { deals: filtered }
      }
      return apiService.getDeals(pipelineId)
    },
  })
}

export function useDeal(dealId: string) {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['deal', dealId],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 200))
        return mockDeals.find((d) => d.id === dealId) || null
      }
      return apiService.getDeal(dealId)
    },
    enabled: !!dealId,
  })
}

export function useCreateDeal() {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async (deal: Partial<Deal>) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 500))
        const newDeal: Deal = {
          id: `demo-deal-${Date.now()}`,
          title: deal.title || 'New Deal',
          value: deal.value || 0,
          stageId: deal.stageId || 'stage-1',
          pipelineId: deal.pipelineId || 'pipeline-1',
          contactId: deal.contactId,
          contactName: deal.contactName,
          status: 'open',
          createdAt: new Date().toISOString(),
        }
        mockDeals.unshift(newDeal)
        return newDeal
      }
      return apiService.createDeal(deal)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
      toast.success('Deal created successfully')
    },
    onError: () => {
      toast.error('Failed to create deal')
    },
  })
}

export function useUpdateDeal() {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Deal> }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        const index = mockDeals.findIndex((d) => d.id === id)
        if (index !== -1) {
          mockDeals[index] = { ...mockDeals[index], ...data }
          return mockDeals[index]
        }
        throw new Error('Deal not found')
      }
      return apiService.updateDeal(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
      toast.success('Deal updated successfully')
    },
    onError: () => {
      toast.error('Failed to update deal')
    },
  })
}

export function useUpdateDealStage() {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: string; stageId: string }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 200))
        const index = mockDeals.findIndex((d) => d.id === dealId)
        if (index !== -1) {
          mockDeals[index].stageId = stageId
          return mockDeals[index]
        }
        throw new Error('Deal not found')
      }
      return apiService.updateDealStage(dealId, stageId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
    },
    onError: () => {
      toast.error('Failed to move deal')
    },
  })
}

export function useDeleteDeal() {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async (dealId: string) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        const index = mockDeals.findIndex((d) => d.id === dealId)
        if (index !== -1) {
          mockDeals.splice(index, 1)
        }
        return
      }
      return apiService.deleteDeal(dealId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['metrics'] })
      toast.success('Deal deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete deal')
    },
  })
}

// ============ PIPELINES HOOKS ============

export function usePipelines() {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 200))
        return { pipelines: mockPipelines }
      }
      return apiService.getPipelines()
    },
  })
}

// ============ METRICS HOOKS ============

export function useMetrics() {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['metrics'],
    queryFn: async (): Promise<DashboardMetrics> => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        return mockMetrics
      }
      return mockMetrics
    },
  })
}

// ============ ACTIVITIES HOOKS ============

export function useActivities() {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['activities'],
    queryFn: async (): Promise<Activity[]> => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300))
        return mockActivities
      }
      return mockActivities
    },
  })
}

// ============ MESSAGING HOOKS ============

export function useSendSMS() {
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async ({ contactId, message }: { contactId: string; message: string }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 800))
        console.log('Demo: SMS sent to', contactId, ':', message)
        return
      }
      return apiService.sendSMS(contactId, message)
    },
    onSuccess: () => {
      toast.success('SMS sent successfully')
    },
    onError: () => {
      toast.error('Failed to send SMS')
    },
  })
}

export function useSendEmail() {
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async ({
      contactId,
      subject,
      body,
    }: {
      contactId: string
      subject: string
      body: string
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 800))
        console.log('Demo: Email sent to', contactId, ':', subject)
        return
      }
      return apiService.sendEmail(contactId, subject, body)
    },
    onSuccess: () => {
      toast.success('Email sent successfully')
    },
    onError: () => {
      toast.error('Failed to send email')
    },
  })
}

// ============ TASKS HOOKS ============

export function useTasks() {
  const { isDemoMode } = useDemoMode()

  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 200))
        return { tasks: [] }
      }
      return apiService.getTasks()
    },
  })
}

// ============ DEAL NOTES HOOKS ============

export function useUpdateDealNotes() {
  const { isDemoMode } = useDemoMode()

  return useMutation({
    mutationFn: async ({ dealId, notes }: { dealId: string; notes: string }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 500))
        return { id: dealId, notes }
      }
      return apiService.updateDeal(dealId, { notes } as any)
    },
    onSuccess: () => {
      toast.success('Deal analysis saved to GHL')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save to GHL')
    },
  })
}
