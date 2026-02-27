import { TemplateConfig } from './index'

export function generateHTML(config: TemplateConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.company_name} - Off-Market Deals</title>
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
      background: #1a1a1a;
      color: white;
      padding: 1.5rem 0;
      border-bottom: 3px solid #d4a574;
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
      color: #d4a574;
    }

    .header-links {
      display: flex;
      gap: 2rem;
      align-items: center;
    }

    .header-links a {
      text-decoration: none;
      color: #ccc;
      font-size: 0.95rem;
      transition: color 0.3s;
    }

    .header-links a:hover {
      color: #d4a574;
    }

    .header-phone {
      font-weight: 600;
      color: #d4a574;
    }

    .hero {
      background: linear-gradient(110deg, #2d2d2d 0%, #1a1a1a 50%, #3d3d3d 100%);
      color: white;
      padding: 5rem 2rem;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      top: 50%;
      right: -10%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(212, 165, 116, 0.15) 0%, transparent 70%);
      border-radius: 50%;
      z-index: 1;
    }

    .hero-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
      display: grid;
      grid-template-columns: 1.2fr 1fr;
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
      color: #d4a574;
    }

    .hero-content p {
      font-size: 1.15rem;
      margin-bottom: 2rem;
      opacity: 0.9;
      line-height: 1.7;
    }

    .form-section {
      background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
      padding: 2.5rem;
      border-radius: 12px;
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.5);
      border-top: 4px solid #d4a574;
    }

    .form-title {
      color: #1a1a1a;
      font-size: 1.4rem;
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
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-family: inherit;
      font-size: 1rem;
      transition: all 0.3s;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #d4a574;
      box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15);
      background: #fffbf7;
    }

    .form-group textarea {
      resize: vertical;
      min-height: 80px;
    }

    .submit-btn {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, #d4a574 0%, #c49564 100%);
      color: #1a1a1a;
      border: none;
      border-radius: 6px;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .submit-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 35px rgba(212, 165, 116, 0.4);
    }

    .submit-btn:active {
      transform: translateY(0);
    }

    .how-it-works {
      background: white;
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
      color: #1a1a1a;
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
      width: 70px;
      height: 70px;
      background: linear-gradient(135deg, #d4a574 0%, #c49564 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: 800;
      margin: 0 auto 1.5rem;
    }

    .step h3 {
      color: #1a1a1a;
      font-size: 1.3rem;
      margin-bottom: 0.75rem;
    }

    .step p {
      color: #666;
      line-height: 1.6;
    }

    .benefits {
      padding: 5rem 2rem;
      background: linear-gradient(to right, #f5f5f5, #fafafa);
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
      border-bottom: 4px solid #d4a574;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: all 0.3s;
    }

    .benefit-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
    }

    .benefit-card h3 {
      color: #1a1a1a;
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
    }

    .benefit-card p {
      color: #666;
      font-size: 0.95rem;
    }

    .testimonials {
      background: #1a1a1a;
      padding: 5rem 2rem;
    }

    .testimonials .section-title {
      color: #d4a574;
    }

    .testimonials-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2rem;
    }

    .testimonial-card {
      background: rgba(255, 255, 255, 0.05);
      padding: 2rem;
      border-radius: 12px;
      border-left: 4px solid #d4a574;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .testimonial-text {
      color: #e0e0e0;
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
      line-height: 1.7;
      font-style: italic;
    }

    .testimonial-author {
      color: #d4a574;
      font-weight: 600;
    }

    .testimonial-title {
      color: #999;
      font-size: 0.85rem;
    }

    footer {
      background: #0d0d0d;
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
      color: #d4a574;
    }

    .footer-section p {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.95rem;
      margin-bottom: 0.5rem;
    }

    .footer-section a {
      color: rgba(255, 255, 255, 0.7);
      text-decoration: none;
    }

    .footer-section a:hover {
      color: #d4a574;
    }

    .footer-bottom {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 2rem;
      text-align: center;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.5);
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
        <a href="#benefits">Why Join</a>
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
        <div class="form-title">Join Our VIP List</div>
        <div class="thank-you-message" id="thankYou">Thank you! Check your email for next steps.</div>
        <div class="error-message" id="error">Something went wrong. Please try again.</div>
        <form id="leadForm">
          ${generateFormFields(config.form_fields)}
          <button type="submit" class="submit-btn">Join Our Buyers List</button>
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
          <h3>Sign Up Now</h3>
          <p>Join our exclusive buyers network in minutes. Complete our quick registration form.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Get Deal Alerts</h3>
          <p>Receive exclusive off-market deals directly in your inbox. First access, best selection.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Close Deals</h3>
          <p>Analyze, make your offer, and close below market value. Build your portfolio fast.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="benefits" id="benefits">
    <div class="section-container">
      <h2 class="section-title">Why Join</h2>
      <div class="benefits-grid">
        <div class="benefit-card">
          <h3>Off-Market Access</h3>
          <p>Properties never listed publicly. Get first dibs on the best deals before anyone else.</p>
        </div>
        <div class="benefit-card">
          <h3>Below Market Value</h3>
          <p>Buy properties at 20-40% below retail. Maximize your investment returns immediately.</p>
        </div>
        <div class="benefit-card">
          <h3>First Look Guarantee</h3>
          <p>VIP members see deals 48 hours before general list. Get the best pick of inventory.</p>
        </div>
        <div class="benefit-card">
          <h3>Exclusive Opportunities</h3>
          <p>Access deals only for serious investors. No tire-kickers, only real buyers.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="testimonials">
    <div class="section-container">
      <h2 class="section-title">Member Success Stories</h2>
      <div class="testimonials-grid">
        <div class="testimonial-card">
          <div class="testimonial-text">"I've closed 12 properties through this network in the last two years. The deal flow is consistent and the properties are genuine wholesale deals. Highly recommended."</div>
          <div class="testimonial-author">David Chen</div>
          <div class="testimonial-title">Real Estate Investor</div>
        </div>
        <div class="testimonial-card">
          <div class="testimonial-text">"The access to off-market deals is game-changing. I've built a six-figure portfolio in less than 18 months thanks to the quality deals and professional support."</div>
          <div class="testimonial-author">Angela Rodriguez</div>
          <div class="testimonial-title">Portfolio Builder</div>
        </div>
        <div class="testimonial-card">
          <div class="testimonial-text">"Finally a network where I can find cash flow properties consistently. The transparency and deal quality set this apart from other buyer networks I've tried."</div>
          <div class="testimonial-author">Michael Brooks</div>
          <div class="testimonial-title">Cash Flow Investor</div>
        </div>
      </div>
    </div>
  </section>

  <footer id="contact">
    <div class="footer-container">
      <div class="footer-section">
        <h4>${config.company_name}</h4>
        <p>The premier off-market real estate deal platform for serious investors.</p>
        <p style="margin-top: 1rem; font-weight: 600;">Members Only Network</p>
      </div>
      <div class="footer-section">
        <h4>Quick Links</h4>
        <p><a href="#how-it-works">How It Works</a></p>
        <p><a href="#benefits">Why Join</a></p>
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
      <p>© 2026 ${config.company_name}. All rights reserved. This is not an offer to sell real estate.</p>
    </div>
  </footer>

  <script>
    window.REI_SUBMIT_URL = window.REI_SUBMIT_URL || '/api/leads';

    function generateFormFields(fields) {
      const fieldLabels = {
        name: 'Full Name',
        phone: 'Phone Number',
        email: 'Email Address',
        address: 'Preferred Markets',
        message: 'Investment Focus (Optional)'
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
    address: 'Preferred Markets',
    message: 'Investment Focus (Optional)'
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
