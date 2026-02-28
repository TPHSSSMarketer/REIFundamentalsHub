import { useState } from 'react'
import { Bot, Plus, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { usePersonas, useCreatePersona, useUpdatePersona, useDeletePersona } from '@/hooks/useFlowBuilder'
import type { Persona } from '@/types'

interface PersonaFormData {
  name: string
  role: string
  tone: string
  system_prompt: string
  is_default: boolean
}

const emptyForm: PersonaFormData = {
  name: '',
  role: '',
  tone: 'professional',
  system_prompt: '',
  is_default: false,
}

export default function PersonaManager() {
  const { data: personas, isLoading } = usePersonas()
  const createPersona = useCreatePersona()
  const updatePersona = useUpdatePersona()
  const deletePersona = useDeletePersona()

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<PersonaFormData>(emptyForm)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (persona: Persona) => {
    setEditingId(persona.id)
    setForm({
      name: persona.name,
      role: persona.role || '',
      tone: persona.tone || 'professional',
      system_prompt: persona.system_prompt || '',
      is_default: persona.is_default || false,
    })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    const payload = { ...form, name: form.name.trim() }

    if (editingId) {
      updatePersona.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => { setShowModal(false); setEditingId(null) } }
      )
    } else {
      createPersona.mutate(payload, {
        onSuccess: () => { setShowModal(false) },
      })
    }
  }

  const handleDelete = (id: number) => {
    deletePersona.mutate(id, {
      onSuccess: () => setDeleteConfirmId(null),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
            <div className="h-5 bg-slate-200 rounded w-1/4 mb-2" />
            <div className="h-4 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {personas?.length ?? 0} persona{(personas?.length ?? 0) !== 1 ? 's' : ''}
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Persona
        </button>
      </div>

      {!personas?.length ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Bot className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No personas yet</h3>
          <p className="text-slate-500 text-sm mb-4">
            Create a persona to define how your AI bot sounds and behaves.
          </p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            Create Your First Persona
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {personas.map((persona: Persona) => (
            <div
              key={persona.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-primary-200 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">{persona.name}</h3>
                    {persona.role && (
                      <p className="text-xs text-slate-500">{persona.role}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(persona)}
                    className="p-1.5 rounded-lg hover:bg-primary-50 text-slate-400 hover:text-primary-600"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(persona.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {persona.tone && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {persona.tone}
                </span>
              )}
              {persona.is_default && (
                <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full ml-1">
                  Default
                </span>
              )}
              {persona.system_prompt && (
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">{persona.system_prompt}</p>
              )}

              {deleteConfirmId === persona.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-red-600">Delete this persona?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(persona.id)}
                      className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Persona' : 'Create Persona'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Friendly Agent"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="e.g., Real Estate Investment Advisor"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tone</label>
                <select
                  value={form.tone}
                  onChange={(e) => setForm({ ...form, tone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                  <option value="empathetic">Empathetic</option>
                  <option value="persuasive">Persuasive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">System Prompt</label>
                <textarea
                  value={form.system_prompt}
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                  placeholder="Instructions for how this persona should behave..."
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">Set as default persona</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || createPersona.isPending || updatePersona.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 font-medium"
              >
                {(createPersona.isPending || updatePersona.isPending) ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
