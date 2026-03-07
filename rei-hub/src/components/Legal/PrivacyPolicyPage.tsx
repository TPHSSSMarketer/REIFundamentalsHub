import { Link } from 'react-router-dom'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-blue-700">
            REIFundamentals Hub
          </Link>
          <Link to="/login" className="text-sm text-blue-600 hover:underline">
            Sign In
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
          <p>
            This Privacy Policy explains how REIFundamentals PMA ("we", "our", or "us"),
            operating the REIFundamentals Hub platform, collects, uses, and protects your
            information when you interact with our websites and services.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Who We Are</h2>
          <p>
            We are a Private Membership Association. Our main website address
            is: <a href="https://hub.reifundamentalshub.com" className="text-blue-600 hover:underline">hub.reifundamentalshub.com</a>.
          </p>
          <p>
            REIFundamentals Hub is a software platform designed for real estate investors,
            providing CRM tools, deal management, property analysis, calendar scheduling,
            document management, and related services exclusively to our members.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Information We Collect</h2>
          <p>
            When you use REIFundamentals Hub, we may collect the following types of information:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Account Information:</strong> Your name, email address, and login credentials
              when you create an account or sign in.
            </li>
            <li>
              <strong>CRM and Deal Data:</strong> Property addresses, contact information for sellers,
              buyers, agents, and other parties, deal details, financial figures, notes, and documents
              you enter into the platform.
            </li>
            <li>
              <strong>Calendar and Task Data:</strong> Events, tasks, appointments, and scheduling
              information you create or sync through the platform.
            </li>
            <li>
              <strong>Third-Party Integrations:</strong> When you connect external services
              (such as Google Calendar), we store authentication tokens necessary to maintain
              that connection. We access only the data scopes you explicitly authorize.
            </li>
            <li>
              <strong>Payment Information:</strong> Billing is processed through Stripe and/or PayPal.
              We do not store your full credit card numbers. Payment processors handle your financial
              data under their own privacy policies.
            </li>
            <li>
              <strong>Usage Data:</strong> We may collect general usage information such as pages visited,
              features used, and browser type to improve our services.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Google Calendar Integration</h2>
          <p>
            REIFundamentals Hub offers optional integration with Google Calendar. When you
            choose to connect your Google Calendar:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              We request access to the <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">https://www.googleapis.com/auth/calendar</code> scope,
              which allows us to read and write calendar events.
            </li>
            <li>
              We use this access solely to sync your REIFundamentals Hub events and tasks
              with your Google Calendar, enabling two-way synchronization of appointments,
              property showings, closings, and other real estate-related scheduling.
            </li>
            <li>
              Your Google Calendar data is not sold, shared with third parties, or used for
              advertising purposes.
            </li>
            <li>
              You can disconnect Google Calendar at any time from the Calendar settings page,
              which revokes our access and removes stored tokens.
            </li>
          </ul>
          <p>
            REIFundamentals Hub's use and transfer of information received from Google APIs
            adheres to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Cookies</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              When you log in, we set secure HttpOnly cookies to maintain your authenticated
              session. These are essential for the platform to function.
            </li>
            <li>
              We may use analytics cookies (such as Cloudflare Web Analytics) to understand
              general traffic patterns. These do not track individual users.
            </li>
            <li>
              Logging out removes all session cookies.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Embedded Content from Other Websites</h2>
          <p>
            Content on our platform may include embedded media (e.g., maps, property images,
            videos) from other sites. These behave the same way as if you had visited the
            originating site. These external websites may collect data about you, use cookies,
            embed third-party tracking, and monitor your interaction with embedded content.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Who We Share Your Data With</h2>
          <p>
            We do not sell your personal data. Data is only shared in limited scenarios, such as:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              With payment processors (Stripe, PayPal) solely to process your subscription payments.
            </li>
            <li>
              With third-party property data providers (such as ATTOM Data) when you request
              property lookups — only the property address is sent, not your personal information.
            </li>
            <li>
              With AI providers (such as Anthropic, OpenAI) when you use AI-powered features
              like deal analysis — only the deal data you submit is sent, processed, and returned.
            </li>
            <li>
              When necessary for legal or administrative purposes.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">How Long We Retain Your Data</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Your account data, CRM records, deals, contacts, and documents are retained for
              as long as your membership is active.
            </li>
            <li>
              If you cancel your membership, your data will be retained for 90 days to allow
              for reactivation, after which it may be permanently deleted.
            </li>
            <li>
              You may request immediate deletion of your data at any time (excluding data we
              are required to keep for legal or security reasons).
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">What Rights You Have Over Your Data</h2>
          <p>If you have an account, you may:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Request an exported file of the personal data we hold about you.</li>
            <li>
              Request deletion of your data (excluding data we are required to keep for legal
              or security reasons).
            </li>
            <li>
              Disconnect any third-party integrations (Google Calendar, etc.) at any time from
              your account settings.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Data Security</h2>
          <p>
            We take reasonable measures to protect your data, including encrypted connections (HTTPS),
            secure authentication tokens, and database-level access controls. However, no method of
            transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Where Your Data Is Sent</h2>
          <p>
            Your data may be processed by third-party services we use to operate the platform,
            including cloud hosting providers (Cloudflare, Railway, Supabase), payment processors,
            and AI service providers. All such providers maintain their own privacy and security
            policies.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Contact Us</h2>
          <p>
            For privacy-related concerns, data access requests, or questions, please contact:
          </p>
          <address className="not-italic mt-4 text-gray-700">
            <strong>REIFundamentals PMA</strong><br />
            c/o Member Services<br />
            240 Main Street, Unit 635<br />
            Near Northport, New York Republic 11768<br />
            Non-Domestic, Without the United States<br /><br />
            Email:{' '}
            <a href="mailto:support@reifundamentalshub.com" className="text-blue-600 hover:underline">
              support@reifundamentalshub.com
            </a>
          </address>

          <hr className="my-10 border-gray-300" />

          <p className="text-sm text-gray-500">
            Private Membership Association Notice: REIFundamentals is a Private Membership
            Association dedicated to providing real estate investment tools and services to
            its members. All content, communications, and services are offered exclusively
            to members. &copy; {new Date().getFullYear()} REIFundamentals PMA. All Rights Reserved.
          </p>
        </div>
      </main>
    </div>
  )
}
