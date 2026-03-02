import { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Trash2,
  Play,
  Mic,
  Square,
  Send,
  Voicemail,
  Megaphone,
  Sparkles,
} from 'lucide-react'
import * as phoneApi from '@/services/phoneApi'
import { toast } from 'sonner'

interface Voice {
  [key: string]: unknown
}

export default function VoicemailDropsTab() {
  const [drops, setDrops] = useState<any[]>([])
  const [voices, setVoices] = useState<Voice[]>([])
  const [numbers, setNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', drop_type: 'recorded', script_template: '', elevenlabs_voice_id: '', audio_url: '' })
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Campaign state
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [campName, setCampName] = useState('')
  const [campDropId, setCampDropId] = useState('')
  const [campNumberId, setCampNumberId] = useState('')
  const [campContactNumbers, setCampContactNumbers] = useState('')
  const [campSending, setCampSending] = useState(false)
  const [vmSubTab, setVmSubTab] = useState<'drops' | 'campaigns'>('drops')
  const [vmCampaigns, setVmCampaigns] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [dropData, voiceData, numData] = await Promise.all([
        phoneApi.getVoicemailDrops(),
        phoneApi.getVoices().catch(() => ({ voices: [] as Voice[] })),
        phoneApi.getNumbers(),
      ])
      setDrops(dropData.drops)
      setVoices(voiceData.voices)
      setNumbers(numData.numbers)
      if (numData.numbers.length > 0) setCampNumberId(numData.numbers[0].id as string)
      if (dropData.drops.length > 0) setCampDropId(dropData.drops[0].id)
    } catch (e) {
      // Error loading voicemail drops - continue without data
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    try {
      await phoneApi.createVoicemailDrop({
        name: form.name,
        drop_type: form.drop_type,
        script_template: form.script_template || undefined,
        elevenlabs_voice_id: form.elevenlabs_voice_id || undefined,
        audio_url: form.audio_url || undefined,
      })
      toast.success('Voicemail drop created')
      setShowForm(false)
      setForm({ name: '', drop_type: 'recorded', script_template: '', elevenlabs_voice_id: '', audio_url: '' })
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create drop')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this voicemail drop?')) return
    try {
      await phoneApi.deleteVoicemailDrop(id)
      toast.success('Voicemail drop deleted')
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete drop')
    }
  }

  async function handleSendCampaign() {
    if (!campName || !campDropId || !campNumberId) {
      toast.error('Please fill in all required fields')
      return
    }
    setCampSending(true)
    try {
      // Parse contact numbers as contact_ids (in a full implementation these would be real contact IDs)
      const contactIds = campContactNumbers.split('\n').map((s) => s.trim()).filter(Boolean)
      if (contactIds.length === 0) {
        toast.error('Please enter at least one contact number')
        setCampSending(false)
        return
      }
      await phoneApi.sendVoicemailCampaign({
        name: campName,
        voicemail_drop_id: campDropId,
        phone_number_id: campNumberId,
        contact_ids: contactIds,
      })
      toast.success('Voicemail campaign launched!')
      setCampName('')
      setCampContactNumbers('')
      setShowCampaignForm(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to launch campaign')
    } finally {
      setCampSending(false)
    }
  }

  function handleSendCampaignFromDrop(dropId: string) {
    setCampDropId(dropId)
    setShowCampaignForm(true)
    setVmSubTab('campaigns')
  }

  async function handleStartRecord() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => chunksRef.current.push(e.data)
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setForm((f) => ({ ...f, audio_url: url }))
        stream.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch {
      alert('Microphone access denied')
    }
  }

  function handleStopRecord() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function dropTypeBadge(type: string) {
    switch (type) {
      case 'recorded': return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Recorded</span>
      case 'uploaded': return <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Uploaded</span>
      case 'ai_personalized': return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Sparkles className="w-3 h-3" />AI Personalized</span>
      default: return null
    }
  }

  if (loading) {
    return <div className="animate-pulse h-48 bg-slate-100 rounded-lg" />
  }

  return (
    <div className="space-y-6">
      {/* Sub-tab toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setVmSubTab('drops')}
          className={`px-4 py-2 text-sm rounded-lg ${vmSubTab === 'drops' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          My Drops
        </button>
        <button
          onClick={() => setVmSubTab('campaigns')}
          className={`px-4 py-2 text-sm rounded-lg ${vmSubTab === 'campaigns' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Campaigns
        </button>
      </div>

      {vmSubTab === 'drops' && (
        <>
      {/* My Drops */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">My Drops</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          <Plus className="w-4 h-4" /> Create New Drop
        </button>
      </div>

      {drops.length === 0 && !showForm ? (
        <div className="bg-slate-50 rounded-lg p-8 text-center">
          <Voicemail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No voicemail drops yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {drops.map((d: any) => (
            <div key={d.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-slate-900">{d.name}</p>
                  <div className="mt-1">{dropTypeBadge(d.drop_type)}</div>
                </div>
                <button onClick={() => handleDelete(d.id)} className="text-slate-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {d.audio_url && (
                <button className="flex items-center gap-1.5 mt-3 text-xs text-primary-600 hover:text-primary-700">
                  <Play className="w-3.5 h-3.5" /> Preview
                </button>
              )}
              <button
                onClick={() => handleSendCampaignFromDrop(d.id)}
                className="w-full mt-3 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg hover:bg-green-100"
              >
                Send Campaign
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Create New Drop</h3>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Drop Name"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <div className="flex gap-3">
              {[
                { key: 'recorded', label: 'Recorded' },
                { key: 'uploaded', label: 'Uploaded' },
                { key: 'ai_personalized', label: 'AI Personalized' },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setForm({ ...form, drop_type: t.key })}
                  className={`px-4 py-2 text-sm rounded-lg border ${form.drop_type === t.key ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {form.drop_type === 'recorded' && (
            <div>
              {recording ? (
                <button onClick={handleStopRecord} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg">
                  <Square className="w-4 h-4" /> Stop Recording
                </button>
              ) : (
                <button onClick={handleStartRecord} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg">
                  <Mic className="w-4 h-4" /> Record in Browser
                </button>
              )}
              {form.audio_url && <p className="text-xs text-green-600 mt-2">Recording saved</p>}
            </div>
          )}

          {form.drop_type === 'uploaded' && (
            <div>
              <input
                type="file"
                accept=".mp3,.wav,.m4a"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setForm({ ...form, audio_url: URL.createObjectURL(file) })
                }}
                className="text-sm"
              />
            </div>
          )}

          {form.drop_type === 'ai_personalized' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Script Template</label>
                <textarea
                  value={form.script_template}
                  onChange={(e) => setForm({ ...form, script_template: e.target.value })}
                  placeholder="Hi {{first_name}}, this is [your name] calling about the property at {{property_address}} in {{city}}..."
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2 mt-1">
                  {['{{first_name}}', '{{city}}', '{{property_address}}'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setForm({ ...form, script_template: form.script_template + ' ' + f })}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Voice</label>
                <select
                  value={form.elevenlabs_voice_id}
                  onChange={(e) => setForm({ ...form, elevenlabs_voice_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a voice...</option>
                  {voices.map((v: any) => (
                    <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                AI Voicemail Drops — $0.25/drop (billed from credits, not included in any plan). Powered by ElevenLabs AI.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={!form.name} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
              Create Drop
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* Campaigns Sub-tab */}
      {vmSubTab === 'campaigns' && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Voicemail Campaigns</h2>
            <button
              onClick={() => setShowCampaignForm(!showCampaignForm)}
              className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
            >
              <Megaphone className="w-4 h-4" /> New Campaign
            </button>
          </div>

          {showCampaignForm && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Launch Voicemail Campaign</h3>
              <input
                type="text"
                value={campName}
                onChange={(e) => setCampName(e.target.value)}
                placeholder="Campaign Name (e.g. Absentee Owner Outreach)"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Voicemail Drop</label>
                <select
                  value={campDropId}
                  onChange={(e) => setCampDropId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a voicemail drop...</option>
                  {drops.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.drop_type})</option>
                  ))}
                </select>
                {drops.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No drops yet — create one in the Drops tab first.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Number</label>
                <select
                  value={campNumberId}
                  onChange={(e) => setCampNumberId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {numbers.map((n: any) => (
                    <option key={n.id} value={n.id}>{n.friendly_name} ({n.number})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Contact Numbers <span className="text-slate-400 font-normal">(one per line)</span>
                </label>
                <textarea
                  value={campContactNumbers}
                  onChange={(e) => setCampContactNumbers(e.target.value)}
                  rows={5}
                  placeholder={'+15551234567\n+15559876543\n+15551112222'}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {campContactNumbers.split('\n').filter((s) => s.trim()).length} numbers entered &middot; Est. cost: $
                  {(campContactNumbers.split('\n').filter((s) => s.trim()).length * 0.25).toFixed(2)} credits
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSendCampaign}
                  disabled={campSending || !campName || !campDropId || !campNumberId}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" /> {campSending ? 'Launching...' : 'Launch Campaign'}
                </button>
                <button
                  onClick={() => setShowCampaignForm(false)}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showCampaignForm && (
            <div className="bg-slate-50 rounded-lg p-8 text-center">
              <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Create a campaign to mass-deliver voicemail drops to your contact list.</p>
              <p className="text-xs text-slate-400 mt-1">Each drop costs $0.25 in credits (AI Personalized) or $0.05 (Standard)</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
