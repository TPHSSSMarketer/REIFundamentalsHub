import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Layout from './components/Common/Layout'
import ErrorBoundary from './components/Common/ErrorBoundary'
import NotFoundPage from './components/Common/NotFoundPage'
import Dashboard from './components/Dashboard/Dashboard'
import Pipeline from './components/Pipeline/Pipeline'
import Contacts from './components/Contacts/Contacts'
import AssistantHub from './components/AssistantHub/AssistantHub'
import ContentHub from './components/ContentHub/ContentHub'
import Portfolio from './components/Portfolio/Portfolio'
import ProofOfFundsPage from './components/ProofOfFunds/ProofOfFundsPage'
import DocumentsPage from './components/Documents/DocumentsPage'
import EmailMarketingPage from './components/EmailMarketing/EmailMarketingPage'
import LeadCenterPage from './components/LeadCenter/LeadCenterPage'
import PhonePage from './components/Phone/PhonePage'
import Markets from './components/Markets/Markets'
import Settings from './components/Settings/Settings'
import LandingPage from './components/LandingPage/LandingPage'
import LoginPage from './components/Auth/LoginPage'
import RegisterPage from './components/Auth/RegisterPage'
import AcceptInvitePage from './components/Auth/AcceptInvitePage'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import PricingPage from './components/Billing/PricingPage'
import BillingPage from './components/Billing/BillingPage'
import UpgradeGate from './components/Common/UpgradeGate'
import AdminPage from './components/Admin'
import BuyerVerifyPage from './components/ProofOfFunds/BuyerVerifyPage'
import ContactDetailPage from './components/CRM/ContactDetailPage'
import DealDetailPage from './components/Pipeline/DealDetailPage'
import OnboardingPage from './components/Onboarding/OnboardingPage'
import OnboardingGuard from './components/Onboarding/OnboardingGuard'
import CalendarPage from './components/Calendar/CalendarPage'
import LoanServicingPage from './components/LoanServicing/LoanServicingPage'
import AdminNegotiationsDashboard from './components/BankNegotiation/AdminNegotiationsDashboard'
import PaymentPortalPage from './components/PaymentPortal/PaymentPortalPage'
import AnalyticsPage from './components/Analytics/AnalyticsPage'
import HelpTicketsPage from './components/HelpTickets/HelpTicketsPage'
import FlowBuilder from './components/FlowBuilder/FlowBuilder'
import FlowEditor from './components/FlowBuilder/FlowEditor'
import AdminAssistantPage from './components/AdminAssistant/AdminAssistantPage'
import { isAuthenticated } from './services/auth'

/** Redirect component — sends user to an external URL */
function ExternalRedirect({ to }: { to: string }) {
  window.location.href = to
  return null
}

function BillingCompletePage() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/dashboard', { replace: true }), 3000)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center p-8">
        <div className="text-5xl mb-4">&#10004;&#65039;</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Subscription activated!</h1>
        <p className="text-slate-500">Refreshing your account&hellip;</p>
      </div>
    </div>
  )
}

function AppLayout() {
  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/deals/:dealId" element={<DealDetailPage />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:contactId" element={<ContactDetailPage />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/proof-of-funds" element={<ProofOfFundsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/email-marketing" element={<Navigate to="/assistanthub" replace />} />
        <Route path="/leadhub" element={<LeadCenterPage />} />
        <Route path="/phone" element={<PhonePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/loan-servicing" element={<LoanServicingPage />} />
        <Route path="/negotiations" element={<AdminNegotiationsDashboard />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/assistanthub" element={
          <UpgradeGate feature="assistant_hub" requiredPlan="Pro">
            <AssistantHub />
          </UpgradeGate>
        } />
        <Route path="/assistant" element={
          <UpgradeGate feature="assistant" requiredPlan="Pro">
            <AdminAssistantPage />
          </UpgradeGate>
        } />
        <Route path="/contenthub" element={
          <UpgradeGate feature="content_hub" requiredPlan="Pro">
            <ContentHub />
          </UpgradeGate>
        } />
        <Route path="/flow-builder" element={<Navigate to="/assistanthub" replace />} />
        <Route path="/flow-builder/:flowId" element={<FlowEditor />} />
        <Route path="/help" element={<HelpTicketsPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated() ? <Navigate to="/dashboard" replace /> : <LandingPage />}
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
        <Route path="/proof-of-funds/verify/:requestToken" element={<BuyerVerifyPage />} />
        <Route path="/pay" element={<PaymentPortalPage />} />
        <Route path="/privacy" element={<ExternalRedirect to="https://reifundamentalshub.com/privacy.html" />} />
        <Route path="/terms" element={<ExternalRedirect to="https://reifundamentalshub.com/terms.html" />} />
        <Route
          path="/billing/complete"
          element={
            <ProtectedRoute>
              <BillingCompletePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <OnboardingGuard>
                <AppLayout />
              </OnboardingGuard>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
