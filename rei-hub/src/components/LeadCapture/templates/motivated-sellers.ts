import { TemplateConfig } from './index'

export function generateHTML(config: TemplateConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.company_name} - We Buy Houses Fast</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      color: #333;
      line-height: 1.6;
    }

    header {
      background: white;
      padding: 1.5rem 0;
      border-bottom: 1px solid #e5e7eb;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a3a5c;
    }

    .header-links {
      display: flex;
      gap: 2rem;
      align-items: center;
    }

    .header-links a {
      text-decoration: none;
      color: #666;
      font-size: 0.95rem;
      transition: color 0.3s;
    }

    .header-links a:hover {
      color: #1a3a5c;
    }

    .header-phone {
      font-weight: 600;
      color: #1a3a5c;
    }

    .hero {
      background: linear-gradient(135deg, #1a3a5c 0%, #2d5a8c 50%, #3d6ba8 100%);
      color: white;
      padding: 5rem 2rem;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 600px;
      height: 600px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      z-index: 1;
    }

    .hero-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      align-items: center;
      position: relative;
      z-index: 2;
    }

    .hero-content h1 {
      font-size: 3rem;
      font-weight: 800;
      margin-bottom: 1.5rem;
      line-height: 1.2;
    }

    .hero-content p {
      font-size: 1.2rem;
      margin-bottom: 2rem;
      opacity: 0.95;
    }

    .form-section {
      background: white;
      padding: 2.5rem;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .form-title {
      color: #1a3a5c;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .form-group {
      margin-bottom: 1.2rem;
    }

    .form-group label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-family: inherit;
      font-size: 1rem;
      transition: border-color 0.3s;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #1a3a5c;
      box-shadow: 0 0 0 3px rgba(26, 58, 92, 0.1);
    }

    .form-group textarea {
      resize: vertical;
      min-height: 80px;
    }

    .submit-btn {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, #1a3a5c 0%, #2d5a8c 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .submit-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(26, 58, 92, 0.3);
    }

    .submit-btn:active {
      transform: translateY(0);
    }

    .how-it-works {
      background: #f9fafb;
      padding: 5rem 2rem;
    }

    .section-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
    }

    .section-title {
      text-align: center;
      font-size: 2.5rem;
      font-weight: 800;
      color: #1a3a5c;
      margin-bottom: 4rem;
    }

    .steps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2rem;
    }

    .step {
      text-align: center;
    }

    .step-number {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #1a3a5c 0%, #2d5a8c 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      font-weight: 800;
      margin: 0 auto 1.5rem;
    }

    .step h3 {
      color: #1a3a5c;
      font-size: 1.3rem;
      margin-bottom: 0.75rem;
    }

    .step p {
      color: #666;
      line-height: 1.6;
    }

    .benefits {
      padding: 5rem 2rem;
    }

    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2rem;
    }

    .benefit-card {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      border-left: 4px solid #1a3a5c;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transition: transform 0.3s;
    }

    .benefit-card:hover {
      transform: translateY(-5px);
    }

    .benefit-card h3 {
      color: #1a3a5c;
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
    }

    .benefit-card p {
      color: #666;
      font-size: 0.95rem;
    }

    .testimonials {
      background: linear-gradient(135deg, #f9fafb 0%, #f0f4f8 100%);
      padding: 5rem 2rem;
    }

    .testimonials-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2rem;
    }

    .testimonial-card {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .testimonial-text {
      color: #333;
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
      line-height: 1.7;
      font-style: italic;
    }

    .testimonial-author {
      color: #1a3a5c;
      font-weight: 600;
    }

    .testimonial-title {
      color: #999;
      font-size: 0.85rem;
    }

    footer {
      background: #1a3a5c;
      color: white;
      padding: 3rem 2rem;
    }

    .footer-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .footer-section h4 {
      font-size: 1.1rem;
      margin-bottom: 1rem;
    }

    .footer-section p {
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.95rem;
      margin-bottom: 0.5rem;
    }

    .footer-section a {
      color: rgba(255, 255, 255, 0.8);
      text-decoration: none;
    }

    .footer-section a:hover {
      color: white;
    }

    .footer-bottom {
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      padding-top: 2rem;
      text-align: center;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.6);
    }

    .thank-you-message {
      display: none;
      background: #d1fae5;
      color: #065f46;
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      text-align: center;
      font-weight: 600;
    }

    .error-message {
      display: none;
      background: #fee2e2;
      color: #991b1b;
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      text-align: center;
      font-weight: 600;
    }

    @media (max-width: 768px) {
      .hero-container {
        grid-template-columns: 1fr;
        gap: 2rem;
      }

      .hero-content h1 {
        font-size: 2rem;
      }

      .steps-grid {
        grid-template-columns: 1fr;
      }

      .benefits-grid {
        grid-template-columns: 1fr;
      }

      .testimonials-grid {
        grid-template-columns: 1fr;
      }

      .footer-container {
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }

      .header-links {
        display: none;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-container">
      <div class="logo">${config.logo_url ? `<img src="${config.logo_url}" alt="${config.company_name}" style="height: 40px;">` : config.company_name}</div>
      <div class="header-links">
        <a href="#how-it-works">How It Works</a>
        <a href="#benefits">Why Us</a>
        <a href="#contact">Contact</a>
        <span class="header-phone">${config.phone}</span>
      </div>
    </div>
  </header>

  <section class="hero">
    <div class="hero-container">
      <div class="hero-content">
        <h1>${config.headline}</h1>
        <p>${config.description}</p>
      </div>
      <div class="form-section">
        <div class="form-title">${config.headline.includes('Cash') ? 'Get Your Cash Offer' : 'Get Started Today'}</div>
        <div class="thank-you-message" id="thankYou">Thank you! We'll contact you shortly.</div>
        <div class="error-message" id="error">Something went wrong. Please try again.</div>
        <form id="leadForm">
          ${generateFormFields(config.form_fields)}
          <button type="submit" class="submit-btn">Get My Cash Offer</button>
        </form>
      </div>
    </div>
  </section>

  <section class="how-it-works" id="how-it-works">
    <div class="section-container">
      <h2 class="section-title">How It Works</h2>
      <div class="steps-grid">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Submit Your Info</h3>
          <p>Tell us about your property and situation. It takes just a few minutes.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Get an Offer</h3>
          <p>We analyze your property and send you a fair cash offer within 24 hours.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Close Fast</h3>
          <p>Close on your timeline. No repairs needed. No waiting around.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="benefits" id="benefits">
    <div class="section-container">
      <h2 class="section-title">Why Choose Us</h2>
      <div class="benefits-grid">
        <div class="benefit-card">
          <h3>No Repairs Required</h3>
          <p>We buy homes in any condition. You don't need to fix anything.</p>
        </div>
        <div class="benefit-card">
          <h3>No Commissions</h3>
          <p>Save thousands in real estate commissions. You keep more money.</p>
        </div>
        <div class="benefit-card">
          <h3>Your Timeline</h3>
          <p>Close in 7 days or 7 months. We work with your schedule.</p>
        </div>
        <div class="benefit-card">
          <h3>Any Condition</h3>
          <p>Fire damage, foreclosure, ugly kitchen—we don't care. We'll buy it.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="testimonials">
    <div class="section-container">
      <h2 class="section-title">What Clients Say</h2>
      <div class="testimonials-grid">
        <div class="testimonial-card">
          <div class="testimonial-text">"I was facing foreclosure and didn't know what to do. This company gave me a fair offer and I was able to move forward with my life."</div>
          <div class="testimonial-author">Sarah Martinez</div>
          <div class="testimonial-title">Homeowner, San Antonio</div>
        </div>
        <div class="testimonial-card">
          <div class="testimonial-text">"The process was simple and transparent. No surprises, no hidden fees. I would recommend them to anyone looking to sell quickly."</div>
          <div class="testimonial-author">John Thompson</div>
          <div class="testimonial-title">Homeowner, Austin</div>
        </div>
        <div class="testimonial-card">
          <div class="testimonial-text">"I was skeptical at first, but they really delivered on their promise. Quick closing, fair price, and great communication throughout."</div>
          <div class="testimonial-author">Maria Garcia</div>
          <div class="testimonial-title">Homeowner, Dallas</div>
        </div>
      </div>
    </div>
  </section>

  <footer id="contact">
    <div class="footer-container">
      <div class="footer-section">
        <h4>${config.company_name}</h4>
        <p>We buy houses fast for cash. No repairs, no commissions, no hassle.</p>
        <p style="margin-top: 1rem; font-weight: 600;">Licensed & Insured</p>
      </div>
      <div class="footer-section">
        <h4>Quick Links</h4>
        <p><a href="#how-it-works">How It Works</a></p>
        <p><a href="#benefits">Why Us</a></p>
        <p><a href="#contact">Contact Us</a></p>
      </div>
      <div class="footer-section">
        <h4>Get in Touch</h4>
        <p>Phone: <a href="tel:${config.phone}">${config.phone}</a></p>
        <p>Email: <a href="mailto:${config.email}">${config.email}</a></p>
        ${config.market ? `<p>Market: ${config.market}</p>` : ''}
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 ${config.company_name}. All rights reserved. This is not an offer to buy or sell real estate.</p>
    </div>
  </footer>

  <script>
    window.REI_SUBMIT_URL = window.REI_SUBMIT_URL || '/api/leads';

    function generateFormFields(fields) {
      const fieldLabels = {
        name: 'Full Name',
        phone: 'Phone Number',
        email: 'Email Address',
        address: 'Property Address',
        message: 'Tell Us More (Optional)'
      };
      
      return fields.map(field => {
        const label = fieldLabels[field] || field;
        const isTextarea = field === 'message';
        return isTextarea 
          ? \`<div class="form-group"><label for="\${field}">\${label}</label><textarea id="\${field}" name="\${field}" placeholder=""></textarea></div>\`
          : \`<div class="form-group"><label for="\${field}">\${label}</label><input type="\${field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}" id="\${field}" name="\${field}" placeholder="" required></input></div>\`;
      }).join('');
    }

    document.getElementById('leadForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const data = Object.fromEntries(formData);
      
      try {
        const response = await fetch(window.REI_SUBMIT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          document.getElementById('thankYou').style.display = 'block';
          document.getElementById('error').style.display = 'none';
          this.reset();
          setTimeout(() => {
            document.getElementById('thankYou').style.display = 'none';
          }, 5000);
        } else {
          throw new Error('Form submission failed');
        }
      } catch (err) {
        document.getElementById('error').style.display = 'block';
        document.getElementById('thankYou').style.display = 'none';
        setTimeout(() => {
          document.getElementById('error').style.display = 'none';
        }, 5000);
      }
    });
  </script>
</body>
</html>`
}

function generateFormFields(fields: string[]): string {
  const fieldLabels: Record<string, string> = {
    name: 'Full Name',
    phone: 'Phone Number',
    email: 'Email Address',
    address: 'Property Address',
    message: 'Tell Us More (Optional)'
  };

  return fields.map(field => {
    const label = fieldLabels[field] || field;
    const isTextarea = field === 'message';
    const required = field !== 'message' ? 'required' : '';
    
    if (isTextarea) {
      return `<div class="form-group"><label for="${field}">${label}</label><textarea id="${field}" name="${field}" placeholder=""></textarea></div>`;
    }
    
    const inputType = field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text';
    return `<div class="form-group"><label for="${field}">${label}</label><input type="${inputType}" id="${field}" name="${field}" placeholder="" ${required}></input></div>`;
  }).join('');
}
