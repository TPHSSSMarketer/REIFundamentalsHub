import { WebsiteConfig } from '@/services/leadCaptureApi'

export function generateWholesaleDealsHTML(config: WebsiteConfig): string {
  const { headline, description, company_name, phone, email, primary_color, form_fields } = config

  const formFieldsHTML = form_fields
    .map((field) => {
      switch (field) {
        case 'name':
          return `<div>
            <label for="name" class="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
            <input type="text" id="name" name="name" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'phone':
          return `<div>
            <label for="phone" class="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
            <input type="tel" id="phone" name="phone" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'email':
          return `<div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
            <input type="email" id="email" name="email" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'address':
          return `<div>
            <label for="address" class="block text-sm font-medium text-gray-700 mb-2">Target Market/City</label>
            <input type="text" id="address" name="address" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'message':
          return `<div>
            <label for="message" class="block text-sm font-medium text-gray-700 mb-2">Experience Level</label>
            <textarea id="message" name="message" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};" placeholder="Tell us about your real estate investing experience..."></textarea>
          </div>`
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline} - {{COMPANY_NAME}}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      background: #faf5f0;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Hero Section */
    .hero {
      background: linear-gradient(135deg, {{PRIMARY_COLOR}} 0%, {{PRIMARY_COLOR}}dd 100%);
      color: white;
      padding: 100px 20px;
      text-align: center;
    }

    .hero h1 {
      font-size: 3.5rem;
      font-weight: 800;
      margin-bottom: 20px;
      line-height: 1.2;
    }

    .hero p {
      font-size: 1.25rem;
      margin-bottom: 30px;
      opacity: 0.95;
      max-width: 700px;
      margin-left: auto;
      margin-right: auto;
    }

    .hero-badge {
      display: inline-block;
      padding: 8px 20px;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 50px;
      color: white;
      font-size: 0.9rem;
      font-weight: 500;
      margin-bottom: 20px;
    }

    /* Benefits Section */
    .benefits {
      background: white;
      padding: 80px 20px;
    }

    .benefits-title {
      text-align: center;
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 60px;
      color: #1f2937;
    }

    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 40px;
      max-width: 1100px;
      margin: 0 auto;
    }

    .benefit {
      padding: 30px;
      border: 2px solid #f3f4f6;
      border-radius: 12px;
      transition: all 0.3s;
    }

    .benefit:hover {
      border-color: {{PRIMARY_COLOR}};
      box-shadow: 0 10px 30px {{PRIMARY_COLOR}}15;
      transform: translateY(-5px);
    }

    .benefit-icon {
      font-size: 3rem;
      margin-bottom: 15px;
    }

    .benefit h3 {
      font-size: 1.3rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 10px;
    }

    .benefit p {
      color: #6b7280;
      font-size: 0.95rem;
    }

    /* Form Section */
    .form-section {
      background: #f9fafb;
      padding: 80px 20px;
    }

    .form-container {
      max-width: 550px;
      margin: 0 auto;
      background: white;
      padding: 60px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
      border-top: 4px solid {{PRIMARY_COLOR}};
    }

    .form-title {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 10px;
      color: #1f2937;
    }

    .form-subtitle {
      color: #6b7280;
      margin-bottom: 30px;
      font-size: 1rem;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      font-size: 0.95rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 1rem;
      font-family: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: {{PRIMARY_COLOR}};
      box-shadow: 0 0 0 3px {{PRIMARY_COLOR}}33;
    }

    .form-group textarea {
      resize: vertical;
      min-height: 100px;
    }

    .form-submit {
      width: 100%;
      padding: 14px 32px;
      background: {{PRIMARY_COLOR}};
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1.05rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.2s;
      margin-top: 10px;
    }

    .form-submit:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }

    .form-submit:active {
      transform: translateY(0);
    }

    .guarantee {
      margin-top: 20px;
      padding: 15px;
      background: {{PRIMARY_COLOR}}10;
      border-left: 4px solid {{PRIMARY_COLOR}};
      border-radius: 6px;
      font-size: 0.9rem;
      color: #374151;
      text-align: center;
    }

    /* Footer */
    footer {
      background: #1f2937;
      color: white;
      padding: 40px 20px;
      text-align: center;
      font-size: 0.9rem;
    }

    footer p {
      margin-bottom: 10px;
    }

    footer a {
      color: {{PRIMARY_COLOR}};
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }

    .footer-contact {
      margin: 20px 0;
    }

    .footer-contact a {
      margin: 0 10px;
    }

    @media (max-width: 768px) {
      .hero h1 {
        font-size: 2.5rem;
      }

      .hero p {
        font-size: 1.05rem;
      }

      .benefits-title {
        font-size: 2rem;
      }

      .form-title {
        font-size: 1.5rem;
      }

      .form-container {
        padding: 30px;
      }

      .benefits-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <section class="hero">
    <div class="container">
      <div class="hero-badge">🔥 Join Our Buyer Network Today</div>
      <h1>{{HEADLINE}}</h1>
      <p>{{DESCRIPTION}}</p>
    </div>
  </section>

  <section class="benefits">
    <div class="container">
      <h2 class="benefits-title">Why Join Our Network?</h2>
      <div class="benefits-grid">
        <div class="benefit">
          <div class="benefit-icon">📧</div>
          <h3>Daily Deal Alerts</h3>
          <p>Get notifications of new wholesale deals matching your investment criteria</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">💰</div>
          <h3>Maximum Margins</h3>
          <p>Access deeply discounted properties with excellent profit potential</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">🤝</div>
          <h3>Trusted Network</h3>
          <p>Connect with serious investors and off-market deal sources</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">⚡</div>
          <h3>Fast Funding</h3>
          <p>Streamlined process for serious cash buyers ready to move fast</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">📊</div>
          <h3>Deal Analysis</h3>
          <p>Detailed comps and analysis for every opportunity</p>
        </div>
        <div class="benefit">
          <div class="benefit-icon">🎯</div>
          <h3>Targeted Results</h3>
          <p>Filter deals by area, type, and investment strategy</p>
        </div>
      </div>
    </div>
  </section>

  <section class="form-section">
    <div class="form-container">
      <h2 class="form-title">Join Now</h2>
      <p class="form-subtitle">Get exclusive wholesale deal alerts delivered to your inbox</p>
      <form id="lead-form">
        ${formFieldsHTML}
        <button type="submit" class="form-submit">Access Exclusive Deals</button>
        <div class="guarantee">
          ✓ 100% Free to Join • ✓ Cancel Anytime • ✓ No Credit Card Required
        </div>
      </form>
    </div>
  </section>

  <footer>
    <div class="container">
      <p>&copy; {{COMPANY_NAME}}. All rights reserved.</p>
      <div class="footer-contact">
        <a href="tel:{{PHONE}}">{{PHONE}}</a>
        <a href="mailto:{{EMAIL}}">{{EMAIL}}</a>
      </div>
      <p style="margin-top: 20px; font-size: 0.8rem; opacity: 0.7;">Privacy Policy | Terms of Service</p>
    </div>
  </footer>

  <script>
    const form = document.getElementById('lead-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      try {
        const response = await fetch('{{WEBHOOK_URL}}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          alert('Welcome! Check your email for your first exclusive deal alert.');
          form.reset();
        } else {
          alert('There was an error submitting your information. Please try again.');
        }
      } catch (error) {
        alert('There was an error submitting your information. Please try again.');
      }
    });
  </script>
</body>
</html>`
}
