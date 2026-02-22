import { Routes, Route, Navigate } from 'react-router-dom'
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
import PhonePage from './components/Phone/PhonePage'
import Markets from './components/Markets/Markets'
import Settings from './components/Settings/Settings'
import LandingPage from './components/LandingPage/LandingPage'
import LoginPage from './components/Auth/LoginPage'
import RegisterPage from './components/Auth/RegisterPage'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import PricingPage from './components/Billing/PricingPage'
import BillingPage from './components/Billing/BillingPage'
import UpgradeGate from './components/Common/UpgradeGate'
import AdminPage from './components/Admin'
import BuyerVerifyPage from './components/ProofOfFunds/BuyerVerifyPage'
import OnboardingPage from './components/Onboarding/OnboardingPage'
import OnboardingGuard from './components/Onboarding/OnboardingGuard'
import { isAuthenticated } from './services/auth'

function AppLayout() {
  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/proof-of-funds" element={<ProofOfFundsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/email-marketing" element={<EmailMarketingPage />} />
        <Route path="/phone" element={<PhonePage />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/assistanthub" element={
          <UpgradeGate feature="assistant_hub" requiredPlan="Pro">
            <AssistantHub />
          </UpgradeGate>
        } />
        <Route path="/contenthub" element={
          <UpgradeGate feature="content_hub" requiredPlan="Pro">
            <ContentHub />
          </UpgradeGate>
        } />
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
          element={isAuthenticated() ? <Navigate to="/pipeline" replace /> : <LandingPage />}
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/proof-of-funds/verify/:requestToken" element={<BuyerVerifyPage />} />
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
