import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center">
        <p className="text-8xl font-bold text-slate-300 mb-4">404</p>
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Page not found</h1>
        <p className="text-slate-600 mb-8">
          The page you're looking for doesn't exist.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
