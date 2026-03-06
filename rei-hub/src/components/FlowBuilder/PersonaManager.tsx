import { useState, useRef } from 'react'
import { Bot, Plus, Pencil, Trash2, X, Copy, Lock, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { usePersonas, useCreatePersona, useUpdatePersona, useDeletePersona, useClonePersona, useVoices } from '@/hooks/useFlowBuilder'
import type { ElevenLabsVoice } from '@/hooks/useFlowBuilder'
import type { Persona } from '@/types'

interface PersonaFormData {
  name: string
  role: string
  tone: string
  system_prompt: string
  is_default: boolean
  elevenlabs_voice_id: string
}

const emptyForm: PersonaFormData = {
  name: '',
  role: '',
  tone: 'professional',
  system_prompt: '',
  is_default: false,
  elevenlabs_voice_id: '',
}

export default function PersonaManager() {
  const { data: personas, isLoading } = usePersonas()
  const { data: voices } = useVoices()
  const createPersona = useCreatePersona()
  const updatePersona = useUpdatePersona()
  const deletePersona = useDeletePersona()
  const clonePersona = useClonePersona()

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PersonaFormData>(emptyForm)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Separate system personas from user-owned
  const systemPersonas = personas?.filter((p: Persona) => p.is_system) ?? []
  const userPersonas = personas?.filter((p: Persona) => !p.is_system) ?? []

  // Helper: get voice name by ID
  const getVoiceName = (voiceId?: string) => {
    if (!voiceId || !voices) return null
    const voice = voices.find((v: ElevenLabsVoice) => v.voice_id === voiceId)
    return voice?.name ?? null
  }

  // Play/stop voice preview
  const togglePreview = (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      // Stop playing
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingVoiceId(null)
      return
    }
    // Stop any current playback
    audioRef.current?.pause()

    const voice = voices?.find((v: ElevenLabsVoice) => v.voice_id === voiceId)
    if (!voice?.preview_url) return

    const audio = new Audio(voice.preview_url)
    audio.onended = () => setPlayingVoiceId(null)
    audio.play().catch(() => setPlayingVoiceId(null))
    audioRef.current = audio
    setPlayingVoiceId(voiceId)
  }

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
      system_prompt: persona.system_prompt || persona.personality_prompt || '',
      is_default: persona.is_default || false,
      elevenlabs_voice_id: persona.elevenlabs_voice_id || '',
    })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    const payload = {
      ...form,
      name: form.name.trim(),
      elevenlabs_voice_id: form.elevenlabs_voice_id || null,
    }

    if (editingId) {
      updatePersona.mutate(
        { personaId: editingId, data: payload },
        { onSuccess: () => { setShowModal(false); setEditingId(null) } }
      )
    } else {
      createPersona.mutate(payload, {
        onSuccess: () => { setShowModal(false) },
      })
    }
  }

  const handleDelete = (id: string) => {
    deletePersona.mutate(id, {
      onSuccess: () => setDeleteConfirmId(null),
    })
  }

  const handleClone = (id: string) => {
    clonePersona.mutate(id)
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

      {/* System Personas — Platform-provided */}
      {systemPersonas.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Platform Personas — Clone to customize
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {systemPersonas.map((persona: Persona) => (
              <div
                key={persona.id}
                className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 p-4 group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">{persona.name}</h3>
                      {persona.description && (
                        <p className="text-xs text-slate-500">{persona.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <span className="flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      <Lock className="w-3 h-3" />
                      Platform
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {persona.tone && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {persona.tone}
                    </span>
                  )}
                  {getVoiceName(persona.elevenlabs_voice_id) ? (
                    <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                      <Volume2 className="w-3 h-3" />
                      {getVoiceName(persona.elevenlabs_voice_id)}
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full">
                      No voice assigned
                    </span>
                  )}
                </div>
                {(persona.personality_prompt || persona.system_prompt) && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {persona.personality_prompt || persona.system_prompt}
                  </p>
                )}
                <button
                  onClick={() => handleClone(persona.id)}
                  disabled={clonePersona.isPending}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {clonePersona.isPending ? 'Cloning...' : 'Clone & Customize'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User-owned Personas */}
      {userPersonas.length > 0 && (
        <div>
          {systemPersonas.length > 0 && (
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Your Personas
            </h3>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {userPersonas.map((persona: Persona) => (
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
                      {(persona.role || persona.description) && (
                        <p className="text-xs text-slate-500">{persona.role || persona.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleClone(persona.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      title="Clone"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
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
                <div className="flex flex-wrap gap-1.5">
                  {persona.tone && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {persona.tone}
                    </span>
                  )}
                  {persona.is_default && (
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                  {persona.cloned_from && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                      Cloned
                    </span>
                  )}
                  {getVoiceName(persona.elevenlabs_voice_id) ? (
                    <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                      <Volume2 className="w-3 h-3" />
                      {getVoiceName(persona.elevenlabs_voice_id)}
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full">
                      No voice
                    </span>
                  )}
                </div>
                {(persona.system_prompt || persona.personality_prompt) && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                    {persona.system_prompt || persona.personality_prompt}
                  </p>
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
        </div>
      )}

      {/* Empty state — only if no personas at all */}
      {!personas?.length && (
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

              {/* Voice Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Voice (ElevenLabs)</label>
                <div className="flex gap-2">
                  <select
                    value={form.elevenlabs_voice_id}
                    onChange={(e) => setForm({ ...form, elevenlabs_voice_id: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  >
                    <option value="">No voice assigned</option>
                    {voices?.map((voice: ElevenLabsVoice) => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                  {form.elevenlabs_voice_id && (
                    <button
                      type="button"
                      onClick={() => togglePreview(form.elevenlabs_voice_id)}
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        playingVoiceId === form.elevenlabs_voice_id
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-300 hover:bg-slate-50 text-slate-600'
                      )}
                      title={playingVoiceId === form.elevenlabs_voice_id ? 'Stop preview' : 'Preview voice'}
                    >
                      {playingVoiceId === form.elevenlabs_voice_id
                        ? <VolumeX className="w-4 h-4" />
                        : <Volume2 className="w-4 h-4" />
                      }
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  This voice will be used for AI voice calls with this persona.
                  {!voices?.length && ' Connect your ElevenLabs API key in Settings to see available voices.'}
                </p>
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
