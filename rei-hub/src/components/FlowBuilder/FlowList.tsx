import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, GitBranch } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { useFlows, useCreateFlow, useDeleteFlow } from '@/hooks/useFlowBuilder'
import type { ConversationFlow } from '@/types'

export default function FlowList() {
  const navigate = useNavigate()
  const { data: flows, isLoading } = useFlows()
  const createFlow = useCreateFlow()
  const deleteFlow = useDeleteFlow()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [newFlowDesc, setNewFlowDesc] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleCreate = () => {
    if (!newFlowName.trim()) return
    createFlow.mutate(
      { name: newFlowName.trim(), description: newFlowDesc.trim() || undefined },
      {
        onSuccess: (flow) => {
          setShowCreateModal(false)
          setNewFlowName('')
          setNewFlowDesc('')
          navigate(`/flow-builder/${flow.id}`)
        },
      }
    )
  }

  const handleDelete = (id: string) => {
    deleteFlow.mutate(id, {
      onSuccess: () => setDeleteConfirmId(null),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
            <div className="h-5 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-4 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {flows?.length ?? 0} flow{(flows?.length ?? 0) !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create New Flow
        </button>
      </div>

      {/* Flow list */}
      {!flows?.length ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <GitBranch className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No flows yet</h3>
          <p className="text-slate-500 text-sm mb-4">
            Create your first AI conversation flow to get started.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            Create Your First Flow
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow: ConversationFlow) => (
            <div
              key={flow.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-primary-200 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900 truncate">{flow.name}</h3>
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        flow.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {flow.status}
                    </span>
                  </div>
                  {flow.description && (
                    <p className="text-sm text-slate-500 truncate">{flow.description}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Created {new Date(flow.created_at).toLocaleDateString()} · Updated{' '}
                    {new Date(flow.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => navigate(`/flow-builder/${flow.id}`)}
                    className="p-2 rounded-lg hover:bg-primary-50 text-slate-500 hover:text-primary-600 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(flow.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delete confirmation */}
              {deleteConfirmId === flow.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-sm text-red-600">Delete this flow? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(flow.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Create New Flow</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Flow Name</label>
                <input
                  type="text"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  placeholder="e.g., Seller Lead Qualifier"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={newFlowDesc}
                  onChange={(e) => setNewFlowDesc(e.target.value)}
                  placeholder="What does this flow do?"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewFlowName('')
                  setNewFlowDesc('')
                }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newFlowName.trim() || createFlow.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 font-medium"
              >
                {createFlow.isPending ? 'Creating...' : 'Create Flow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
