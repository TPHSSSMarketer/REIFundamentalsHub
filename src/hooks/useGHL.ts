import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ghlService } from '@/services/ghl'
import type { Contact, Deal, Pipeline } from '@/types'
import { toast } from 'sonner'

// ============ CONTACTS HOOKS ============

export function useContacts(params?: { limit?: number; offset?: number; query?: string }) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => ghlService.getContacts(params),
  })
}

export function useContact(contactId: string) {
  return useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => ghlService.getContact(contactId),
    enabled: !!contactId,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (contact: Partial<Contact>) => ghlService.createContact(contact),
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
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      ghlService.updateContact(id, data),
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
    mutationFn: (contactId: string) => ghlService.deleteContact(contactId),
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
  return useQuery({
    queryKey: ['deals', pipelineId],
    queryFn: () => ghlService.getDeals(pipelineId),
  })
}

export function useDeal(dealId: string) {
  return useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => ghlService.getDeal(dealId),
    enabled: !!dealId,
  })
}

export function useCreateDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (deal: Partial<Deal>) => ghlService.createDeal(deal),
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

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Deal> }) =>
      ghlService.updateDeal(id, data),
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

  return useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      ghlService.updateDealStage(dealId, stageId),
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
    mutationFn: (dealId: string) => ghlService.deleteDeal(dealId),
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
  return useQuery({
    queryKey: ['pipelines'],
    queryFn: () => ghlService.getPipelines(),
  })
}

// ============ MESSAGING HOOKS ============

export function useSendSMS() {
  return useMutation({
    mutationFn: ({ contactId, message }: { contactId: string; message: string }) =>
      ghlService.sendSMS(contactId, message),
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
    mutationFn: ({
      contactId,
      subject,
      body,
    }: {
      contactId: string
      subject: string
      body: string
    }) => ghlService.sendEmail(contactId, subject, body),
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
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => ghlService.getTasks(),
  })
}
