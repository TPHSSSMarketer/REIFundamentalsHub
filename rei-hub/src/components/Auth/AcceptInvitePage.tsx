import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { validateInvite, acceptInvite } from '@/services/teamApi'

export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Invite details from validation
  const [inviteEmail, setInviteEmail] = useState('')
  const [ownerName, setOwnerName] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState('')

  // Form fields
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid invite link — no token found.')
      setLoading(false)
      return
    }

    validateInvite(token)
      .then((data) => {
        if (!data.valid) {
          setError('This invite link is invalid or has expired.')
        } else {
          setInviteEmail(data.email)
          setOwnerName(data.owner_name || data.owner_email)
          setExpiresAt(data.expires_at)
        }
      })
      .catch((err) => {
        setError(err.message || 'Unable to validate invite link.')
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fullName.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    try {
      await acceptInvite(token!, inviteEmail, fullName.trim(), password)
      setSuccess(true)
      // Backend sets auth cookies on accept, redirect after brief delay
      setTimeout(() => navigate('/dashboard', { replace: true }), 2000)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Validating invite link...</p>
        </div>
      </div>
    )
  }

  // ── Success state ──
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center p-8">
          <div className="text-5xl mb-4">&#10004;&#65039;</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">You're in!</h1>
          <p className="text-slate-500">
            Your account has been created. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    )
  }

  // ── Invalid / expired invite ──
  if (error && !inviteEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md text-center">
          <img
            src="/REIFundamentals_Hub_Logo.png"
            alt="REI Fundamentals Hub"
            className="h-16 mx-auto mb-6 object-contain"
          />
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="text-4xl mb-4">&#128683;</div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Invite</h1>
            <p className="text-slate-500 text-sm mb-6">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="rounded-lg bg-primary-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Accept invite form ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <img
            src="/REIFundamentals_Hub_Logo.png"
            alt="REI Fundamentals Hub"
            className="h-16 mx-auto mb-4 object-contain"
          />
          <p className="text-slate-500">
            <span className="font-medium text-slate-700">{ownerName}</span> invited you to join their team
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-5"
        >
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </div>
          )}

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={inviteEmail}
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-400">
              This is the email address your invite was sent to
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              required
              maxLength={100}
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="John Smith"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Create Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="At least 8 characters"
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Re-enter your password"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {submitting ? 'Creating account...' : 'Join Team'}
          </button>

          <p className="text-xs text-slate-400 text-center">
            By joining, you agree to the{' '}
            <a href="/terms" className="text-primary-600 hover:underline">
              Terms of Service
            </a>
          </p>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
