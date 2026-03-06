import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { login } from '@/services/auth'
import { useDemoMode } from '@/hooks/useDemoMode'
import { Loader2 } from 'lucide-react'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
)

export default function LoginPage() {
  const navigate = useNavigate()
  const { enableDemoMode, disableDemoMode } = useDemoMode()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    const authSuccess = searchParams.get('auth_success')
    const googleError = searchParams.get('google_error')

    if (authSuccess === 'true') {
      // Backend set HttpOnly cookies on the Google OAuth redirect.
      // No need to store anything in localStorage — just navigate.
      disableDemoMode() // Clear demo mode on real login
      navigate('/pipeline', { replace: true })
      return
    }

    if (googleError) {
      setError('Google sign-in failed. Please try again.')
      setGoogleLoading(false)
    }
  }, [searchParams, navigate])


  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailPattern.test(email)) {
      setError('Please enter a valid email address.')
      setSubmitting(false)
      return
    }

    const result = await login(email, password)

    if (result.success) {
      disableDemoMode() // Clear demo mode on real login
      navigate('/pipeline')
    } else {
      setError(result.error ?? 'Login failed')
      setPassword('')
    }

    setSubmitting(false)
  }

  function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError(null)
    // Navigate directly to the backend redirect endpoint (bypasses CORS)
    window.location.href = `${BASE_URL}/api/auth/google/redirect`
  }


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
          <p className="mt-2 text-slate-500">Sign in to your account</p>
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

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
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
              maxLength={128}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="••••••••"
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
            {submitting ? 'Signing in\u2026' : 'Sign In'}
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <span className="relative bg-white px-2 text-xs text-slate-400 uppercase">or</span>
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-700 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {googleLoading ? 'Signing in\u2026' : 'Sign in with Google'}
          </button>
        </form>

        {/* Demo Mode */}
        <div className="mt-4">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <span className="relative bg-slate-50 px-3 text-xs text-slate-400 uppercase">or</span>
          </div>
          <button
            onClick={() => {
              enableDemoMode()
              navigate('/pipeline')
            }}
            className="mt-4 w-full rounded-lg border-2 border-dashed border-slate-300 text-slate-600 py-2.5 text-sm font-medium hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
          >
            Try Demo Mode
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            Explore all features with sample data — no account needed
          </p>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
            Start your free trial
          </Link>
        </p>
      </div>
    </div>
  )
}
