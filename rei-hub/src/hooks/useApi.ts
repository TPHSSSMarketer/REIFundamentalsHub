import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiService } from '@/services/api'
import { getAuthHeader, logout } from '@/services/auth'
import {
  getDeals,
  getDeal,
  createDeal,
  updateDeal,
  deleteDeal,
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
} from '@/services/db'
import { mockPipelines } from '@/data/mockData'
import type { Contact, Deal } from '@/types'
import { toast } from 'sonner'

const USER_ID = 'local-user'

/** Wrap an async fn so that a 401 response triggers logout + redirect. */
function withAuth<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    try {
      const result = await fn(...args)
      return result
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.status === 401) {
        logout()
      }
      throw err
    }
  }) as T
}

// ============ CONTACTS HOOKS ============

export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: () => getContacts(USER_ID),
  })
}

export function useContact(contactId: string) {
  return useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => getContact(contactId),
    enabled: !!contactId,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (contact: Partial<Contact>) => createContact(USER_ID, contact),
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

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) => updateContact(id, data),
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

  return useMutation({
    mutationFn: (contactId: string) => deleteContact(contactId),
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

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: () => getDeals(USER_ID),
  })
}

export function useDeal(dealId: string) {
  return useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => getDeal(dealId),
    enabled: !!dealId,
  })
}

export function useCreateDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (deal: Partial<Deal>) => createDeal(USER_ID, deal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Deal created successfully')
    },
    onError: () => {
      toast.error('Failed to create deal')
    },
  })
}

export function useUpdateDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Deal> }) => updateDeal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Deal updated successfully')
    },
    onError: () => {
      toast.error('Failed to update deal')
    },
  })
}

export function useUpdateDealStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      updateDeal(dealId, { stage: stageId as Deal['stage'] }),
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

  return useMutation({
    mutationFn: (dealId: string) => deleteDeal(dealId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Deal deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete deal')
    },
  })
}

// ============ PIPELINES HOOKS ============

export function usePipelines() {
  return useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => mockPipelines,
  })
}

// ============ TASKS HOOKS ============

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => ({ tasks: [] as any[] }),
  })
}

// ============ MESSAGING HOOKS ============

export function useSendSMS() {
  return useMutation({
    mutationFn: withAuth(async ({ contactId, message }: { contactId: string; message: string }) => {
      void getAuthHeader() // ensure token is available
      return apiService.sendSMS(contactId, message)
    }),
    onSuccess: () => {
      toast.success('SMS sent successfully')
    },
    onError: () => {
      toast.error('Failed to send SMS')
    },
  })
}

export function useSendEmail() {
  return useMutation({
    mutationFn: withAuth(async ({
      contactId,
      subject,
      body,
    }: {
      contactId: string
      subject: string
      body: string
    }) => {
      void getAuthHeader() // ensure token is available
      return apiService.sendEmail(contactId, subject, body)
    }),
    onSuccess: () => {
      toast.success('Email sent successfully')
    },
    onError: () => {
      toast.error('Failed to send email')
    },
  })
}

// ============ DEAL NOTES HOOKS ============

export function useUpdateDealNotes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ dealId, notes }: { dealId: string; notes: string }) =>
      updateDeal(dealId, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Deal analysis saved')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save deal notes')
    },
  })
}
