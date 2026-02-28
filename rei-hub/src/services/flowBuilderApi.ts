import { ConversationFlow, FlowNode, FlowEdge, Persona, FlowExecution } from '../types'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('rei_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json()
  if (res.status === 401) {
    localStorage.removeItem('rei_token')
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? 'Request failed')
}

// ── Flow endpoints ──

export async function listFlows(): Promise<ConversationFlow[]> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows`, {
    method: 'GET',
    headers: authHeaders(),
  })
  return handleResponse<ConversationFlow[]>(res)
}

export async function createFlow(data: Partial<ConversationFlow>): Promise<ConversationFlow> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<ConversationFlow>(res)
}

export async function getFlow(flowId: string): Promise<ConversationFlow> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}`, {
    method: 'GET',
    headers: authHeaders(),
  })
  return handleResponse<ConversationFlow>(res)
}

export async function updateFlow(
  flowId: string,
  data: Partial<ConversationFlow>
): Promise<ConversationFlow> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<ConversationFlow>(res)
}

export async function deleteFlow(flowId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Failed to delete flow')
  }
}

// ── Node endpoints ──

export async function createNode(
  flowId: string,
  data: Partial<FlowNode>
): Promise<FlowNode> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}/nodes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<FlowNode>(res)
}

export async function updateNode(
  flowId: string,
  nodeId: string,
  data: Partial<FlowNode>
): Promise<FlowNode> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<FlowNode>(res)
}

export async function deleteNode(flowId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}/nodes/${nodeId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Failed to delete node')
  }
}

// ── Edge endpoints ──

export async function createEdge(flowId: string, data: Partial<FlowEdge>): Promise<FlowEdge> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}/edges`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<FlowEdge>(res)
}

export async function deleteEdge(flowId: string, edgeId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/flows/${flowId}/edges/${edgeId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Failed to delete edge')
  }
}

// ── Persona endpoints ──

export async function listPersonas(): Promise<Persona[]> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/personas`, {
    method: 'GET',
    headers: authHeaders(),
  })
  return handleResponse<Persona[]>(res)
}

export async function createPersona(data: Partial<Persona>): Promise<Persona> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/personas`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<Persona>(res)
}

export async function updatePersona(
  personaId: string,
  data: Partial<Persona>
): Promise<Persona> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/personas/${personaId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<Persona>(res)
}

export async function deletePersona(personaId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/personas/${personaId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Failed to delete persona')
  }
}

// ── Execution endpoints ──

export async function listExecutions(
  params?: Record<string, string | number | boolean>
): Promise<FlowExecution[]> {
  const query = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      query.append(key, String(value))
    })
  }
  const queryString = query.toString()
  const url = `${BASE_URL}/api/flow-builder/executions${queryString ? `?${queryString}` : ''}`
  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders(),
  })
  return handleResponse<FlowExecution[]>(res)
}

export async function getExecution(executionId: string): Promise<FlowExecution> {
  const res = await fetch(`${BASE_URL}/api/flow-builder/executions/${executionId}`, {
    method: 'GET',
    headers: authHeaders(),
  })
  return handleResponse<FlowExecution>(res)
}
