import { WebsiteConfig } from '@/services/leadCaptureApi'

export function generatePropertyEvaluationHTML(config: WebsiteConfig): string {
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
            <label for="address" class="block text-sm font-medium text-gray-700 mb-2">Property Address *</label>
            <input type="text" id="address" name="address" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'message':
          return `<div>
            <label for="message" class="block text-sm font-medium text-gray-700 mb-2">Additional Property Details</label>
            <textarea id="message" name="message" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};" placeholder="Year built, condition, recent upgrades, etc."></textarea>
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
      background: #fafaf9;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Header */
    header {
      background: white;
      padding: 20px 0;
      border-bottom: 1px solid #e7e5e4;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: {{PRIMARY_COLOR}};
    }

    /* Hero Section */
    .hero {
      background: linear-gradient(135deg, {{PRIMARY_COLOR}} 0%, {{PRIMARY_COLOR}}cc 100%);
      color: white;
      padding: 100px 20px;
      text-align: center;
    }

    .hero h2 {
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

    /* Steps Section */
    .steps {
      background: white;
      padding: 60px 20px;
    }

    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 40px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .step {
      text-align: center;
    }

    .step-number {
      display: inline-block;
      width: 50px;
      height: 50px;
      background: {{PRIMARY_COLOR}};
      color: white;
      border-radius: 50%;
      line-height: 50px;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 15px;
    }

    .step h3 {
      font-size: 1.2rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 10px;
    }

    .step p {
      color: #6b7280;
      font-size: 0.95rem;
    }

    /* Form Section */
    .form-section {
      background: #f0fdf4;
      padding: 80px 20px;
    }

    .form-container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      padding: 60px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
    }

    .form-title {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 15px;
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

    .disclaimer {
      margin-top: 20px;
      padding: 15px;
      background: #f3f4f6;
      border-radius: 6px;
      font-size: 0.85rem;
      color: #6b7280;
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
      .hero h2 {
        font-size: 2.5rem;
      }

      .hero p {
        font-size: 1.05rem;
      }

      .form-title {
        font-size: 1.5rem;
      }

      .form-container {
        padding: 30px;
      }

      .steps-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>{{COMPANY_NAME}}</h1>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <h2>{{HEADLINE}}</h2>
      <p>{{DESCRIPTION}}</p>
    </div>
  </section>

  <section class="steps">
    <div class="container">
      <div class="steps-grid">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Enter Your Address</h3>
          <p>Provide your property address and basic information</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Get Your Estimate</h3>
          <p>Receive a free, no-obligation property valuation</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Talk to an Expert</h3>
          <p>Discuss your results with a local real estate professional</p>
        </div>
      </div>
    </div>
  </section>

  <section class="form-section">
    <div class="form-container">
      <h2 class="form-title">Get Your Free Evaluation</h2>
      <p class="form-subtitle">It takes just 2 minutes to find out your home's value</p>
      <form id="lead-form">
        ${formFieldsHTML}
        <button type="submit" class="form-submit">Get My Free Estimate</button>
        <div class="disclaimer">
          We'll send your property evaluation to your email. 100% free, no obligation.
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
          alert('Success! Check your email for your property valuation.');
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
