import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register, error, setError, isLoading } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  function validate(): boolean {
    if (password.length < 8) {
      setClientError('Password must be at least 8 characters')
      return false
    }
    if (password !== confirmPassword) {
      setClientError('Passwords do not match')
      return false
    }
    setClientError(null)
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setError(null)
    try {
      await register(email, password, fullName || undefined)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  const busy = submitting || isLoading
  const displayError = clientError || error

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">REI Fundamentals Hub</h1>
          <p className="mt-2 text-slate-500">Create your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-5"
        >
          {/* Trial banner */}
          <div className="rounded-lg bg-primary-50 border border-primary-200 text-primary-700 text-sm px-4 py-3 text-center">
            7-day free trial &mdash; no credit card required
          </div>

          {displayError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {displayError}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Jane Doe"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Min. 8 characters"
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
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Re-enter password"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Creating account…' : 'Start Free Trial'}
          </button>
        </form>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
