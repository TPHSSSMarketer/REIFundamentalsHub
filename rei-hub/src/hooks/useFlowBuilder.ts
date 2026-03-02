import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as flowBuilderApi from '../services/flowBuilderApi'
import { ConversationFlow, FlowNode, FlowEdge, Persona, FlowExecution } from '../types'

// ── Query Keys ──

export const flowBuilderKeys = {
  all: ['flows'] as const,
  flows: () => [...flowBuilderKeys.all, 'list'] as const,
  flow: (id: string) => [...flowBuilderKeys.all, 'detail', id] as const,
  personas: () => [...flowBuilderKeys.all, 'personas'] as const,
  persona: (id: string) => [...flowBuilderKeys.all, 'persona', id] as const,
  executions: () => [...flowBuilderKeys.all, 'executions'] as const,
  execution: (id: string) => [...flowBuilderKeys.all, 'execution', id] as const,
}

// ── Flow Hooks ──

export function useFlows() {
  return useQuery({
    queryKey: flowBuilderKeys.flows(),
    queryFn: () => flowBuilderApi.listFlows(),
  })
}

export function useFlow(flowId: string | undefined) {
  return useQuery({
    queryKey: flowBuilderKeys.flow(flowId || ''),
    queryFn: () => flowBuilderApi.getFlow(flowId!),
    enabled: !!flowId,
  })
}

export function useCreateFlow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ConversationFlow>) => flowBuilderApi.createFlow(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flows() })
    },
  })
}

export function useUpdateFlow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      flowId,
      data,
    }: {
      flowId: string
      data: Partial<ConversationFlow>
    }) => flowBuilderApi.updateFlow(flowId, data),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flow(flowId) })
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flows() })
    },
  })
}

export function useDeleteFlow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (flowId: string) => flowBuilderApi.deleteFlow(flowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flows() })
    },
  })
}

// ── Node Hooks ──

export function useCreateNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      flowId,
      data,
    }: {
      flowId: string
      data: Partial<FlowNode>
    }) => flowBuilderApi.createNode(flowId, data),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flow(flowId) })
    },
  })
}

export function useUpdateNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      flowId,
      nodeId,
      data,
    }: {
      flowId: string
      nodeId: string
      data: Partial<FlowNode>
    }) => flowBuilderApi.updateNode(flowId, nodeId, data),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flow(flowId) })
    },
  })
}

export function useDeleteNode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      flowId,
      nodeId,
    }: {
      flowId: string
      nodeId: string
    }) => flowBuilderApi.deleteNode(flowId, nodeId),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flow(flowId) })
    },
  })
}

// ── Edge Hooks ──

export function useCreateEdge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      flowId,
      data,
    }: {
      flowId: string
      data: Partial<FlowEdge>
    }) => flowBuilderApi.createEdge(flowId, data),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flow(flowId) })
    },
  })
}

export function useDeleteEdge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      flowId,
      edgeId,
    }: {
      flowId: string
      edgeId: string
    }) => flowBuilderApi.deleteEdge(flowId, edgeId),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.flow(flowId) })
    },
  })
}

// ── Persona Hooks ──

export function usePersonas() {
  return useQuery({
    queryKey: flowBuilderKeys.personas(),
    queryFn: () => flowBuilderApi.listPersonas(),
  })
}

export function useCreatePersona() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Persona>) => flowBuilderApi.createPersona(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.personas() })
    },
  })
}

export function useUpdatePersona() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      personaId,
      data,
    }: {
      personaId: string
      data: Partial<Persona>
    }) => flowBuilderApi.updatePersona(personaId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.personas() })
    },
  })
}

export function useDeletePersona() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (personaId: string) => flowBuilderApi.deletePersona(personaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowBuilderKeys.personas() })
    },
  })
}

// ── Execution Hooks ──

export function useExecutions(params?: Record<string, string | number | boolean>) {
  return useQuery({
    queryKey: flowBuilderKeys.executions(),
    queryFn: () => flowBuilderApi.listExecutions(params),
  })
}

export function useExecution(executionId: string | undefined) {
  return useQuery({
    queryKey: flowBuilderKeys.execution(executionId || ''),
    queryFn: () => flowBuilderApi.getExecution(executionId!),
    enabled: !!executionId,
  })
}
