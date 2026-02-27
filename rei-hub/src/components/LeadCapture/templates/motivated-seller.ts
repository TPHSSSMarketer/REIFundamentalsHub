import { WebsiteConfig } from '@/services/leadCaptureApi'

export function generateMotivatedSellerHTML(config: WebsiteConfig): string {
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
            <label for="address" class="block text-sm font-medium text-gray-700 mb-2">Property Address</label>
            <input type="text" id="address" name="address" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'message':
          return `<div>
            <label for="message" class="block text-sm font-medium text-gray-700 mb-2">Tell Us About Your Property</label>
            <textarea id="message" name="message" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};"></textarea>
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
      background: #f9fafb;
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
      padding: 80px 20px;
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
    }

    /* Form Section */
    .form-section {
      background: white;
      padding: 60px 20px;
    }

    .form-container {
      max-width: 500px;
      margin: 0 auto;
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
      font-size: 1.1rem;
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

    /* Trust Signals */
    .trust-signals {
      background: #f3f4f6;
      padding: 60px 20px;
    }

    .signals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 30px;
      max-width: 900px;
      margin: 0 auto;
    }

    .signal {
      text-align: center;
    }

    .signal-icon {
      font-size: 2.5rem;
      margin-bottom: 15px;
    }

    .signal h3 {
      font-size: 1.2rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 8px;
    }

    .signal p {
      color: #6b7280;
      font-size: 0.95rem;
    }

    /* CTA Section */
    .cta-section {
      background: white;
      padding: 60px 20px;
      text-align: center;
    }

    .cta-section h2 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 20px;
      color: #1f2937;
    }

    .cta-section p {
      font-size: 1.1rem;
      color: #6b7280;
      margin-bottom: 30px;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .cta-button {
      display: inline-block;
      padding: 14px 40px;
      background: {{PRIMARY_COLOR}};
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: opacity 0.2s;
    }

    .cta-button:hover {
      opacity: 0.9;
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
      color: #60a5fa;
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

      .form-title {
        font-size: 1.5rem;
      }

      .cta-section h2 {
        font-size: 1.5rem;
      }

      .signals-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <section class="hero">
    <div class="container">
      <h1>{{HEADLINE}}</h1>
      <p>{{DESCRIPTION}}</p>
    </div>
  </section>

  <section class="form-section">
    <div class="form-container">
      <h2 class="form-title">Get a Free Cash Offer</h2>
      <p class="form-subtitle">Fill out the form below and we'll contact you within 24 hours</p>
      <form id="lead-form">
        ${formFieldsHTML}
        <button type="submit" class="form-submit">Get My Free Offer</button>
      </form>
    </div>
  </section>

  <section class="trust-signals">
    <div class="container">
      <div class="signals-grid">
        <div class="signal">
          <div class="signal-icon">⚡</div>
          <h3>Fast Cash Offers</h3>
          <p>Get a no-obligation offer in 24 hours or less</p>
        </div>
        <div class="signal">
          <div class="signal-icon">🏠</div>
          <h3>All Property Types</h3>
          <p>We buy houses in any condition, anywhere</p>
        </div>
        <div class="signal">
          <div class="signal-icon">✓</div>
          <h3>No Hidden Fees</h3>
          <p>Transparent pricing with no surprises</p>
        </div>
      </div>
    </div>
  </section>

  <section class="cta-section">
    <div class="container">
      <h2>Sell Your House Fast for Cash</h2>
      <p>Don't wait months for a traditional sale. Get a fair cash offer from {{COMPANY_NAME}} today.</p>
      <a href="#lead-form" class="cta-button">Start Now</a>
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
          alert('Thank you! We will contact you shortly.');
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
