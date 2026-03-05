import { useState, useEffect } from 'react'
import { Users, Loader2, Trash2, Mail, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  getTeamMembers,
  getSeatInfo,
  sendInvite,
  removeMember,
  getPendingInvites,
  cancelInvite,
  type TeamMember,
  type SeatInfo,
  type PendingInvite,
} from '@/services/teamApi'
import { getBillingStatus } from '@/services/billingApi'

export default function TeamManagementSection() {
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false) // Only show for Pro/Team owners
  const [members, setMembers] = useState<TeamMember[]>([])
  const [seats, setSeats] = useState<SeatInfo | null>(null)
  const [pending, setPending] = useState<PendingInvite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        // Check if user qualifies for team management
        const billing = await getBillingStatus()

        // Only show for Pro/Team account owners (not team members)
        if (
          billing.is_team_member ||
          !['pro', 'team'].includes(billing.plan ?? '')
        ) {
          setVisible(false)
          setLoading(false)
          return
        }

        setVisible(true)

        // Load team data in parallel
        const [membersRes, pendingRes] = await Promise.all([
          getTeamMembers(),
          getPendingInvites(),
        ])

        setMembers(membersRes.members)
        setSeats(membersRes.seats)
        setPending(pendingRes.invitations)
      } catch {
        // Silently hide section if endpoints fail (e.g., user doesn't have permission)
        setVisible(false)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  async function handleInvite() {
    if (!inviteEmail.trim()) return

    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailPattern.test(inviteEmail)) {
      toast.error('Please enter a valid email address.')
      return
    }

    setInviting(true)
    try {
      await sendInvite(inviteEmail.trim())
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')

      // Refresh lists
      const [membersRes, pendingRes] = await Promise.all([
        getTeamMembers(),
        getPendingInvites(),
      ])
      setMembers(membersRes.members)
      setSeats(membersRes.seats)
      setPending(pendingRes.invitations)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(memberId: number, email: string) {
    if (!confirm(`Remove ${email} from your team? They will lose access immediately.`)) return

    setRemovingId(memberId)
    try {
      await removeMember(memberId)
      toast.success(`${email} removed from team`)

      const membersRes = await getTeamMembers()
      setMembers(membersRes.members)
      setSeats(membersRes.seats)
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleCancelInvite(inviteId: number, email: string) {
    setCancellingId(inviteId)
    try {
      await cancelInvite(inviteId)
      toast.success(`Invite to ${email} cancelled`)
      setPending((prev) => prev.filter((p) => p.id !== inviteId))

      const membersRes = await getTeamMembers()
      setSeats(membersRes.seats)
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel invite')
    } finally {
      setCancellingId(null)
    }
  }

  // Don't render anything for non-eligible users
  if (loading || !visible) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Users className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-slate-800">Team Management</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Invite team members to share your workspace. They'll have access to all your contacts, deals, and pipeline.
      </p>

      {/* Seat Capacity Bar */}
      {seats && (
        <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">
              Seats Used
            </span>
            <span className="text-sm text-slate-500">
              {seats.seats_used} / {seats.max_seats === 999 ? 'Unlimited' : seats.max_seats}
            </span>
          </div>
          {seats.max_seats !== 999 && (
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (seats.seats_used / seats.max_seats) * 100)}%` }}
              />
            </div>
          )}
          {seats.seats_remaining <= 0 && seats.max_seats !== 999 && (
            <p className="text-xs text-amber-600 mt-2">
              All seats are used. Upgrade your plan to add more team members.
            </p>
          )}
        </div>
      )}

      {/* Invite Form */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Invite a team member
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {inviting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {inviting ? 'Sending...' : 'Invite'}
          </button>
        </div>
      </div>

      {/* Active Members */}
      {members.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Active Members</h3>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {member.full_name || member.email}
                  </p>
                  <p className="text-xs text-slate-500">{member.email}</p>
                </div>
                <button
                  onClick={() => handleRemove(member.id, member.email)}
                  disabled={removingId === member.id}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors disabled:opacity-50"
                  title="Remove member"
                >
                  {removingId === member.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Pending Invitations</h3>
          <div className="space-y-2">
            {pending.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200"
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{invite.email}</p>
                    <p className="text-xs text-slate-500">
                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleCancelInvite(invite.id, invite.email)}
                  disabled={cancellingId === invite.id}
                  className="text-slate-500 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors disabled:opacity-50 text-xs font-medium"
                >
                  {cancellingId === invite.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Cancel'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {members.length === 0 && pending.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No team members yet. Send an invite to get started!</p>
        </div>
      )}
    </div>
  )
}
