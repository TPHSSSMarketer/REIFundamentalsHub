import { useState, useEffect } from 'react'
import { getPendingFollowups, completeFollowup } from '../../../services/bankNegotiationApi'

interface Props { token: string }

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function relativeDate(dateStr: string): { text: string; color: string } {
  const days = daysUntil(dateStr)
  if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`, color: 'text-[#CC2229]' }
  if (days === 0) return { text: 'Due today', color: 'text-orange-600' }
  if (days === 1) return { text: 'Due tomorrow', color: 'text-orange-600' }
  return { text: `In ${days} days`, color: 'text-[#1B3A6B]' }
}

type Group = { label: string; headerColor: string; items: any[] }

export default function FollowUpsTab({ token }: Props) {
  const [followups, setFollowups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completionNotes, setCompletionNotes] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { fetchFollowups() }, [token])

  async function fetchFollowups() {
    setLoading(true)
    try {
      const data = await getPendingFollowups(token)
      setFollowups(Array.isArray(data) ? data : data.followups || [])
    } catch { setFollowups([]) }
    setLoading(false)
  }

  async function handleComplete(id: string) {
    try {
      const res = await completeFollowup(id, { notes: completionNotes }, token)
      const nextDate = res?.next_followup_date ? new Date(res.next_followup_date).toLocaleDateString() : 'N/A'
      setToast(`Complete. Next follow-up set for ${nextDate}`)
      setTimeout(() => setToast(''), 4000)
      setCompletingId(null); setCompletionNotes('')
      fetchFollowups()
    } catch { setToast('Failed to complete follow-up'); setTimeout(() => setToast(''), 4000) }
  }

  const groups: Group[] = [
    { label: 'OVERDUE', headerColor: '#CC2229', items: followups.filter(f => daysUntil(f.due_date) < 0) },
    { label: 'DUE THIS WEEK', headerColor: '#ea580c', items: followups.filter(f => { const d = daysUntil(f.due_date); return d >= 0 && d <= 7 }) },
    { label: 'UPCOMING', headerColor: '#1B3A6B', items: followups.filter(f => daysUntil(f.due_date) > 7) },
  ]

  if (loading) return <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div>

  if (followups.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <p className="text-2xl mb-2">{'\u2713'}</p>
        <p className="text-lg font-bold text-green-800">No Pending Follow-Ups!</p>
        <p className="text-sm text-green-600 mt-1">All negotiations are up to date.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}

      {groups.filter(g => g.items.length > 0).map(group => (
        <div key={group.label}>
          <div className="rounded-t-lg px-4 py-2" style={{ backgroundColor: group.headerColor }}>
            <p className="text-sm font-bold text-white">{group.label} ({group.items.length})</p>
          </div>
          <div className="space-y-3 bg-white rounded-b-xl shadow p-4">
            {group.items.map((f: any) => {
              const rel = relativeDate(f.due_date)
              return (
                <div key={f.id} className="border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{f.bank_name} — {f.property_address}</p>
                      <p className={`text-sm ${rel.color}`}>{rel.text}</p>
                    </div>
                    {f.type && <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-600">{f.type}</span>}
                  </div>
                  {f.notes && <p className="text-xs text-slate-500 truncate">{f.notes}</p>}

                  {completingId === f.id ? (
                    <div className="space-y-2 pt-1">
                      <textarea placeholder="What was done?" value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} rows={2} className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                      <div className="flex gap-2">
                        <button onClick={() => handleComplete(f.id)} className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:opacity-90">Save & Complete</button>
                        <button onClick={() => { setCompletingId(null); setCompletionNotes('') }} className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setCompletingId(f.id); setCompletionNotes('') }} className="px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">Complete</button>
                      {f.negotiation_id && <a href={`#negotiation/${f.negotiation_id}`} className="px-3 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50 inline-block">View Negotiation</a>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
