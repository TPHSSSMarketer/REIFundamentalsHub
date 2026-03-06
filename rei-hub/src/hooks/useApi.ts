import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { logout } from '@/services/auth'
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
  updateDealStage as apiUpdateDealStage,
} from '@/services/crmApi'
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

export function useContacts(_options?: { limit?: number }) {
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
      apiUpdateDealStage(dealId, stageId),
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

const TASKS_KEY = 'rei_tasks'

function getDemoTasks() {
  const stored = localStorage.getItem(TASKS_KEY)
  if (stored) return { tasks: JSON.parse(stored) }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)

  const tasks = [
    {
      id: 'task-1',
      title: 'Call seller for 123 Main St',
      description: 'Follow up on counter offer',
      status: 'pending',
      priority: 'high',
      due_date: today,
      due_time: '10:00 AM',
      completed: false,
      created_at: yesterday,
    },
    {
      id: 'task-2',
      title: 'Schedule property inspection',
      description: '456 Oak Ave — inspector availability',
      status: 'pending',
      priority: 'high',
      due_date: today,
      due_time: '2:00 PM',
      completed: false,
      created_at: yesterday,
    },
    {
      id: 'task-3',
      title: 'Review title report',
      description: '789 Pine Rd — title company sent docs',
      status: 'pending',
      priority: 'medium',
      due_date: tomorrow,
      completed: false,
      created_at: today,
    },
    {
      id: 'task-4',
      title: 'Send offer to listing agent',
      description: 'New lead on Elm Street property',
      status: 'pending',
      priority: 'medium',
      due_date: tomorrow,
      completed: false,
      created_at: today,
    },
    {
      id: 'task-5',
      title: 'Run comps for Oak Ave deal',
      description: 'MLS comps within 0.5 mile radius',
      status: 'completed',
      priority: 'low',
      due_date: yesterday,
      completed: true,
      created_at: yesterday,
    },
  ]
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
  return { tasks }
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => getDemoTasks(),
  })
}

// ============ MESSAGING HOOKS ============

export function useSendSMS() {
  return useMutation({
    mutationFn: withAuth(async ({ contactId, message }: { contactId: string; message: string }) => {
      return phoneApi.sendSms({ to_number: contactId, body: message, phone_number_id: 'default' })
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
      const { sendContactEmail } = await import('@/services/emailMarketingApi')
      return sendContactEmail(contactId, subject, body)
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

// ============ PHONE SYSTEM HOOKS ============

import * as phoneApi from '@/services/phoneApi'

// ── Call History ─────────────────────────────────────────────

export function useCallHistory(contactId?: string) {
  return useQuery({
    queryKey: ['phone', 'calls', contactId],
    queryFn: () => phoneApi.getCalls(contactId),
  })
}

export function useUpdateCall() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { disposition?: string; notes?: string } }) =>
      phoneApi.updateCall(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone', 'calls'] })
      toast.success('Call updated')
    },
    onError: () => {
      toast.error('Failed to update call')
    },
  })
}

// ── SMS Campaigns ────────────────────────────────────────────

export function useSmsCampaigns() {
  return useQuery({
    queryKey: ['phone', 'sms', 'campaigns'],
    queryFn: () => phoneApi.getSmsCampaigns(),
  })
}

export function useCreateSmsCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      message_template: string
      phone_number_id: string
      list_id?: string
      scheduled_at?: string
    }) => phoneApi.createSmsCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone', 'sms', 'campaigns'] })
      toast.success('SMS campaign created')
    },
    onError: () => {
      toast.error('Failed to create SMS campaign')
    },
  })
}

export function useSendSmsCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (campaignId: string) => phoneApi.sendSmsCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone', 'sms', 'campaigns'] })
      toast.success('SMS campaign sent!')
    },
    onError: () => {
      toast.error('Failed to send SMS campaign')
    },
  })
}

// ── Voicemail Campaigns ──────────────────────────────────────

export function useVoicemailDrops() {
  return useQuery({
    queryKey: ['phone', 'voicemail', 'drops'],
    queryFn: () => phoneApi.getVoicemailDrops(),
  })
}

export function useSendVoicemailCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      voicemail_drop_id: string
      phone_number_id: string
      contact_ids: string[]
    }) => phoneApi.sendVoicemailCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone', 'voicemail'] })
      toast.success('Voicemail campaign launched!')
    },
    onError: () => {
      toast.error('Failed to send voicemail campaign')
    },
  })
}

// ── Fax ──────────────────────────────────────────────────────

export function useFaxHistory() {
  return useQuery({
    queryKey: ['phone', 'fax'],
    queryFn: () => phoneApi.getFaxHistory(),
  })
}

export function useSendFax() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      to_number: string
      from_number_id: string
      media_url: string
      contact_id?: string
    }) => phoneApi.sendFax(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone', 'fax'] })
      toast.success('Fax sent successfully')
    },
    onError: () => {
      toast.error('Failed to send fax')
    },
  })
}

// ── Credits ──────────────────────────────────────────────────

export function usePhoneCredits() {
  return useQuery({
    queryKey: ['phone', 'credits'],
    queryFn: () => phoneApi.getCredits(),
  })
}

export function usePurchaseCredits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (bundle: string) => phoneApi.purchaseCredits(bundle),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['phone', 'credits'] })
      if (data.checkout_url && data.checkout_url !== '#demo-checkout') {
        window.open(data.checkout_url, '_blank')
      } else {
        toast.success('Credits purchase — Stripe checkout coming soon!')
      }
    },
    onError: () => {
      toast.error('Failed to purchase credits')
    },
  })
}
