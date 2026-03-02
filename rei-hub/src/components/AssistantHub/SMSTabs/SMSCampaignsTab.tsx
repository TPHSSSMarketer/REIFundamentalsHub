import { useState, useEffect } from 'react'
import { Plus, Send } from 'lucide-react'
import * as phoneApi from '@/services/phoneApi'
import { toast } from 'sonner'

export default function SMSCampaignsTab() {
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [numbers, setNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [campName, setCampName] = useState('')
  const [campNumberId, setCampNumberId] = useState('')
  const [campTemplate, setCampTemplate] = useState('')
  const [campContactNumbers, setCampContactNumbers] = useState('')
  const [campSaving, setCampSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [numData, campData] = await Promise.all([
        phoneApi.getNumbers(),
        phoneApi.getSmsCampaigns(),
      ])
      setNumbers(numData.numbers)
      setCampaigns(campData.campaigns)
      if (numData.numbers.length > 0) {
        setCampNumberId(numData.numbers[0].id as string)
      }
    } catch (e) {
      // Error loading SMS campaign data - continue without data
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveCampaign(sendNow: boolean) {
    if (!campName || !campTemplate) {
      toast.error('Campaign name and message template are required')
      return
    }
    setCampSaving(true)
    try {
      // Parse contact numbers from textarea (one per line or comma-separated)
      const parsedNumbers = campContactNumbers
        .split(/[\n,]+/)
        .map((n) => n.trim())
        .filter(Boolean)

      if (sendNow && parsedNumbers.length === 0) {
        toast.error('Please enter at least one phone number to send to')
        setCampSaving(false)
        return
      }

      const result = await phoneApi.createSmsCampaign({
        name: campName,
        message_template: campTemplate,
        phone_number_id: campNumberId,
        contact_numbers: parsedNumbers.length > 0 ? parsedNumbers : undefined,
      })
      if (sendNow && result.id) {
        await phoneApi.sendSmsCampaign(result.id as string)
        toast.success(`Campaign sending to ${parsedNumbers.length} contacts!`)
      } else {
        toast.success('Campaign saved as draft')
      }
      setCampName('')
      setCampTemplate('')
      setCampContactNumbers('')
      setShowCampaignForm(false)
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create campaign')
    } finally {
      setCampSaving(false)
    }
  }

  async function handleSendCampaign(id: string) {
    try {
      await phoneApi.sendSmsCampaign(id)
      toast.success('Campaign is sending!')
      loadData()
    } catch {
      toast.error('Failed to send campaign')
    }
  }

  if (loading) {
    return <div className="animate-pulse h-96 bg-slate-100 rounded-lg" />
  }

  return (
    <div className="space-y-6">
      {/* SMS Campaigns */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">SMS Campaigns</h2>
          <button onClick={() => setShowCampaignForm(!showCampaignForm)} className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
            <Plus className="w-4 h-4" /> Create SMS Campaign
          </button>
        </div>

        {showCampaignForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-4 space-y-4">
            <input
              type="text"
              value={campName}
              onChange={(e) => setCampName(e.target.value)}
              placeholder="Campaign Name"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={campNumberId}
              onChange={(e) => setCampNumberId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {numbers.map((n: any) => (
                <option key={n.id} value={n.id}>{n.friendly_name} ({n.number})</option>
              ))}
            </select>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Phone Numbers</label>
              <textarea
                rows={3}
                value={campContactNumbers}
                onChange={(e) => setCampContactNumbers(e.target.value)}
                placeholder="Enter phone numbers (one per line or comma-separated)&#10;+15551234567&#10;+15559876543"
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">
                {campContactNumbers.split(/[\n,]+/).filter((n) => n.trim()).length} numbers entered
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message Template</label>
              <textarea
                rows={4}
                value={campTemplate}
                onChange={(e) => setCampTemplate(e.target.value)}
                placeholder="Hi {{first_name}}, ..."
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between mt-1">
                <div className="flex gap-2">
                  {['{{first_name}}', '{{city}}', '{{property_address}}'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setCampTemplate((t) => t + ' ' + f)}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <span className={`text-xs ${campTemplate.length > 160 ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                  {campTemplate.length}/160
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleSaveCampaign(false)}
                disabled={campSaving || !campName || !campTemplate}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {campSaving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                onClick={() => handleSaveCampaign(true)}
                disabled={campSaving || !campName || !campTemplate}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Send Now
              </button>
              <button onClick={() => setShowCampaignForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        )}

        {campaigns.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-6 text-center text-sm text-slate-400">No SMS campaigns yet</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {campaigns.map((c: any) => (
              <div key={c.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-slate-900">{c.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'sent' ? 'bg-green-100 text-green-700' : c.status === 'sending' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {c.status}
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-slate-500">
                  <span>Sent: {c.total_sent}</span>
                  <span>Delivered: {c.total_delivered}</span>
                  <span>Replied: {c.total_replied}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">Cost: ${c.cost?.toFixed(2)}</p>
                  {c.status === 'draft' && (
                    <button
                      onClick={() => handleSendCampaign(c.id)}
                      className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" /> Send
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
