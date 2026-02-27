import { WebsiteConfig } from '@/services/leadCaptureApi'

export function generateCashBuyerHTML(config: WebsiteConfig): string {
  const { headline, description, company_name, phone, email, primary_color, form_fields } = config

  const formFieldsHTML = form_fields
    .map((field) => {
      switch (field) {
        case 'name':
          return `<div>
            <label for="name" class="block text-sm font-medium text-gray-200 mb-2">Full Name *</label>
            <input type="text" id="name" name="name" required class="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'phone':
          return `<div>
            <label for="phone" class="block text-sm font-medium text-gray-200 mb-2">Phone Number *</label>
            <input type="tel" id="phone" name="phone" required class="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'email':
          return `<div>
            <label for="email" class="block text-sm font-medium text-gray-200 mb-2">Email Address *</label>
            <input type="email" id="email" name="email" required class="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'address':
          return `<div>
            <label for="address" class="block text-sm font-medium text-gray-200 mb-2">Property Address</label>
            <input type="text" id="address" name="address" class="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};">
          </div>`
        case 'message':
          return `<div>
            <label for="message" class="block text-sm font-medium text-gray-200 mb-2">Investment Preferences</label>
            <textarea id="message" name="message" rows="3" class="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:outline-none" style="focus-ring-color: {{PRIMARY_COLOR}};"></textarea>
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
      color: #e5e7eb;
      background: #0f172a;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Hero Section */
    .hero {
      background: linear-gradient(135deg, #1a1f3a 0%, #1e293b 100%);
      color: white;
      padding: 100px 20px;
      text-align: center;
      border-bottom: 2px solid {{PRIMARY_COLOR}};
    }

    .hero h1 {
      font-size: 3.5rem;
      font-weight: 800;
      margin-bottom: 20px;
      line-height: 1.2;
      color: white;
    }

    .hero p {
      font-size: 1.25rem;
      margin-bottom: 40px;
      color: #cbd5e1;
      max-width: 700px;
      margin-left: auto;
      margin-right: auto;
    }

    .hero-cta {
      display: inline-block;
      padding: 12px 28px;
      background: {{PRIMARY_COLOR}};
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      transition: opacity 0.2s;
    }

    .hero-cta:hover {
      opacity: 0.9;
    }

    /* Features Section */
    .features {
      background: #1a2942;
      padding: 60px 20px;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 30px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .feature-card {
      background: #0f172a;
      padding: 30px;
      border-radius: 8px;
      border-left: 4px solid {{PRIMARY_COLOR}};
    }

    .feature-icon {
      font-size: 2.5rem;
      margin-bottom: 15px;
    }

    .feature-card h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: white;
      margin-bottom: 10px;
    }

    .feature-card p {
      color: #9ca3af;
      font-size: 0.95rem;
    }

    /* Form Section */
    .form-section {
      background: #0f172a;
      padding: 80px 20px;
    }

    .form-container {
      max-width: 500px;
      margin: 0 auto;
      background: #1a2942;
      padding: 50px;
      border-radius: 12px;
      border: 1px solid #334155;
    }

    .form-title {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 10px;
      color: white;
    }

    .form-subtitle {
      color: #9ca3af;
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
      color: #cbd5e1;
      margin-bottom: 8px;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 12px 16px;
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 6px;
      font-size: 1rem;
      font-family: inherit;
      color: white;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .form-group input::placeholder,
    .form-group textarea::placeholder {
      color: #64748b;
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
      border-radius: 6px;
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

    /* Footer */
    footer {
      background: #1a1f3a;
      color: #9ca3af;
      padding: 40px 20px;
      text-align: center;
      font-size: 0.9rem;
      border-top: 1px solid #334155;
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

      .form-title {
        font-size: 1.5rem;
      }

      .form-container {
        padding: 30px;
      }

      .features-grid {
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
      <a href="#lead-form" class="hero-cta">Join Our Network</a>
    </div>
  </section>

  <section class="features">
    <div class="container">
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🎯</div>
          <h3>Exclusive Deals</h3>
          <p>Access to off-market properties before public listings</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📊</div>
          <h3>Real-Time Updates</h3>
          <p>Get notified instantly when new deals match your criteria</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">💼</div>
          <h3>Professional Support</h3>
          <p>Dedicated support for serious cash buyers</p>
        </div>
      </div>
    </div>
  </section>

  <section class="form-section">
    <div class="form-container">
      <h2 class="form-title">Get Deal Alerts</h2>
      <p class="form-subtitle">Register to receive exclusive off-market deal notifications</p>
      <form id="lead-form">
        ${formFieldsHTML}
        <button type="submit" class="form-submit">Register Now</button>
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
          alert('Success! You will receive deal alerts shortly.');
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
