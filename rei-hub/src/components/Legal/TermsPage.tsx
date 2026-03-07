import { Link } from 'react-router-dom'

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms &amp; Conditions</h1>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
          <p>
            These Terms and Conditions ("Terms") govern your use of the REIFundamentals Hub
            platform and its associated services, operated by REIFundamentals PMA (collectively
            referred to as "the Company," "we," "our," or "us"). By accessing or using our
            websites or services, you agree to be bound by these Terms.
          </p>
          <p>
            REIFundamentals operates as a Private Membership Association (PMA). All interactions
            are governed by private contract, private membership agreement, and common law
            principles — not statutory public law.
          </p>
          <p>
            We reserve the right to modify or update these Terms at any time. Continued use of
            the site following any changes constitutes acceptance of those modifications. Please
            review this page periodically for updates.
          </p>
          <p>
            If you are acting on behalf of a legal entity, you affirm that you are authorized
            to bind that entity to these Terms.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Services</h2>
          <p>
            REIFundamentals Hub provides real estate investment management tools including CRM,
            deal pipeline management, property analysis, AI-powered underwriting, calendar and
            task management, document management, lead capture, communication tools, and related
            services for our Members.
          </p>
          <p>
            You agree not to use any services for unlawful purposes. We reserve the right to
            charge fees for services, as listed on our pricing page, and to adjust pricing at
            our discretion. All services are offered under private contract within the PMA framework.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Subscription and Billing</h2>
          <p>
            Access to REIFundamentals Hub requires an active subscription. Subscriptions are
            billed monthly or annually through Stripe and/or PayPal. By subscribing, you
            authorize us to charge your selected payment method on a recurring basis.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>You may cancel your subscription at any time from your account settings.</li>
            <li>Upon cancellation, you retain access through the end of your current billing period.</li>
            <li>Refund requests are handled on a case-by-case basis. Please contact support for assistance.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Your Data</h2>
          <p>
            You retain ownership of all data you enter into REIFundamentals Hub, including
            contacts, deals, documents, notes, and other records. We do not claim ownership
            of your content.
          </p>
          <p>
            You grant us a limited license to store, process, and display your data solely
            for the purpose of providing and improving our services to you.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Third-Party Services</h2>
          <p>
            Our platform may integrate with external services including Google Calendar,
            Stripe, PayPal, ATTOM Data, AI providers (Anthropic, OpenAI), and others. These
            are provided for your convenience. We do not control or endorse these services
            and assume no liability for their content or practices.
          </p>
          <p>
            Each integration requires your explicit authorization and can be disconnected at
            any time from your account settings.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Prohibited Uses and Intellectual Property</h2>
          <p>
            You are granted a non-exclusive, non-transferable, revocable license to access
            and use the platform solely for private, non-commercial use under your membership
            (or for your business operations as a real estate investor). You agree not to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Use the platform for unlawful, harmful, or disruptive activities.</li>
            <li>Copy, modify, reproduce, or create derivative works based on our platform or its code.</li>
            <li>Attempt to reverse-engineer, decompile, or extract source code from the platform.</li>
            <li>Share your login credentials with unauthorized users.</li>
            <li>Remove copyright notices or intellectual property markings.</li>
          </ul>
          <p>
            All platform content — including text, graphics, software, logos, and layouts — is
            the sole property of REIFundamentals PMA and protected by applicable law.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">PMA Activities and Offerings</h2>
          <p>
            All activities, services, and offerings — including software access, consultations,
            educational material, and member benefits — are conducted entirely within the
            private domain of REIFundamentals PMA.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Any fees, dues, donations, or purchases are private transactions between members.</li>
            <li>These transactions are not charitable contributions for tax deduction purposes.</li>
            <li>
              No portion of any funds exchanged is intended to be used as a public franchise
              system deduction or write-off.
            </li>
          </ul>
          <p>
            By becoming a Member, you acknowledge that all offerings are governed by private
            agreement, not public law or administrative codes.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">AI-Powered Features Disclaimer</h2>
          <p>
            REIFundamentals Hub includes AI-powered analysis tools for property underwriting,
            deal analysis, and other features. These tools are provided for informational
            purposes only and should not be considered professional financial, legal, or
            investment advice.
          </p>
          <p>
            AI-generated analysis may contain errors or inaccuracies. You are solely responsible
            for verifying all information and making your own investment decisions. We strongly
            recommend consulting qualified professionals before making significant financial decisions.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Disclaimer of Certain Liabilities</h2>
          <p>
            Information on our platform may contain errors or inaccuracies. We make no
            warranties — express or implied — regarding the accuracy, reliability, or
            completeness of the content or services provided. To the maximum extent
            permitted by law:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>We are not liable for any indirect, incidental, consequential, or special damages.</li>
            <li>We disclaim all implied warranties of merchantability or fitness for a particular purpose.</li>
            <li>Our content and services are provided "as is" without warranty or guarantee.</li>
            <li>
              We are not liable for investment losses, missed deals, or financial decisions
              made based on data or analysis provided by the platform.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless REIFundamentals PMA, its managers,
            directors, affiliates, agents, and team members from any claims, damages, losses,
            liabilities, costs, or expenses (including attorney's fees) arising from your
            misuse of the platform or violation of these Terms.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Termination and Access Restriction</h2>
          <p>
            We reserve the right to terminate your access to our platform and services at any
            time, without notice, particularly if you violate these Terms or breach your
            membership obligations.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Miscellaneous</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              These Terms are governed by the laws of the jurisdiction in which the PMA is
              organized, excluding conflict of law rules.
            </li>
            <li>
              If any part of these Terms is deemed unenforceable, the remaining provisions
              shall remain valid and enforceable.
            </li>
            <li>
              These Terms constitute the entire agreement between you and the Company regarding
              your use of the platform and services.
            </li>
            <li>
              No joint venture, partnership, or employment relationship is created by your use
              of the platform.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Contact Information</h2>
          <p>
            Questions or concerns about these Terms can be sent to:
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
            <br />
            Website:{' '}
            <a href="https://hub.reifundamentalshub.com" className="text-blue-600 hover:underline">
              hub.reifundamentalshub.com
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
