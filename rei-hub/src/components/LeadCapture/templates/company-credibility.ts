import { TemplateConfig } from './index'

export function generateHTML(config: TemplateConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.company_name} - About Us</title>
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
      background: #1e3a5f;
      color: white;
      padding: 1.5rem 0;
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
      color: white;
    }

    .header-links {
      display: flex;
      gap: 2rem;
      align-items: center;
    }

    .header-links a {
      text-decoration: none;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.95rem;
      transition: color 0.3s;
    }

    .header-links a:hover {
      color: white;
    }

    .header-phone {
      font-weight: 600;
      color: white;
    }

    .hero {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5187 50%, #3d6bb3 100%);
      color: white;
      padding: 5rem 2rem;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      top: 0;
      right: -20%;
      width: 500px;
      height: 500px;
      background: rgba(255, 255, 255, 0.05);
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
      color: #1e3a5f;
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
      border-color: #1e3a5f;
      box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.1);
    }

    .form-group textarea {
      resize: vertical;
      min-height: 80px;
    }

    .submit-btn {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5187 100%);
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
      box-shadow: 0 10px 30px rgba(30, 58, 95, 0.3);
    }

    .stats {
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
      color: #1e3a5f;
      margin-bottom: 4rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2rem;
    }

    .stat {
      text-align: center;
      padding: 2rem;
      background: linear-gradient(135deg, #f0f4f8 0%, #e8ecf1 100%);
      border-radius: 12px;
    }

    .stat-number {
      font-size: 2.5rem;
      font-weight: 800;
      color: #1e3a5f;
      margin-bottom: 0.5rem;
    }

    .stat h3 {
      color: #1e3a5f;
      font-size: 1.2rem;
      margin-bottom: 0.5rem;
    }

    .stat p {
      color: #666;
      font-size: 0.95rem;
    }

    .benefits {
      padding: 5rem 2rem;
      background: linear-gradient(to right, #f9fafb, #f0f4f8);
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
      border-top: 4px solid #1e3a5f;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transition: transform 0.3s;
    }

    .benefit-card:hover {
      transform: translateY(-5px);
    }

    .benefit-card h3 {
      color: #1e3a5f;
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
    }

    .benefit-card p {
      color: #666;
      font-size: 0.95rem;
    }

    .testimonials {
      background: white;
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
      border-left: 4px solid #1e3a5f;
    }

    .testimonial-text {
      color: #333;
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
      line-height: 1.7;
      font-style: italic;
    }

    .testimonial-author {
      color: #1e3a5f;
      font-weight: 600;
    }

    .testimonial-title {
      color: #999;
      font-size: 0.85rem;
    }

    footer {
      background: #1e3a5f;
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
      }

      .hero-content h1 {
        font-size: 2rem;
      }

      .stats-grid {
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
        <a href="#stats">Our Story</a>
        <a href="#benefits">Why Trust Us</a>
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
        <div class="form-title">Contact Us Today</div>
        <div class="thank-you-message" id="thankYou">Thank you! We'll be in touch soon.</div>
        <div class="error-message" id="error">Something went wrong. Please try again.</div>
        <form id="leadForm">
          ${generateFormFields(config.form_fields)}
          <button type="submit" class="submit-btn">Send Message</button>
        </form>
      </div>
    </div>
  </section>

  <section class="stats" id="stats">
    <div class="section-container">
      <h2 class="section-title">Our Track Record</h2>
      <div class="stats-grid">
        <div class="stat">
          <div class="stat-number">500+</div>
          <h3>Properties Sold</h3>
          <p>Thousands of happy customers who trusted us with their biggest investment.</p>
        </div>
        <div class="stat">
          <div class="stat-number">15+ Years</div>
          <h3>Industry Experience</h3>
          <p>Decades of expertise navigating real estate markets and helping families.</p>
        </div>
        <div class="stat">
          <div class="stat-number">98%</div>
          <h3>Customer Satisfaction</h3>
          <p>Our clients consistently rate us among the best in the region.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="benefits" id="benefits">
    <div class="section-container">
      <h2 class="section-title">Why Trust Us</h2>
      <div class="benefits-grid">
        <div class="benefit-card">
          <h3>BBB Accredited</h3>
          <p>Verified BBB member with an A+ rating. We maintain the highest standards of integrity.</p>
        </div>
        <div class="benefit-card">
          <h3>Licensed & Insured</h3>
          <p>All agents fully licensed and bonded. Complete professional insurance coverage.</p>
        </div>
        <div class="benefit-card">
          <h3>Community Focus</h3>
          <p>We live and work in this community. Your success is our success.</p>
        </div>
        <div class="benefit-card">
          <h3>Transparent Process</h3>
          <p>No hidden fees. No surprises. Everything explained clearly from start to finish.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="testimonials">
    <div class="section-container">
      <h2 class="section-title">Trusted By Our Community</h2>
      <div class="testimonials-grid">
        <div class="testimonial-card">
          <div class="testimonial-text">"Professional, transparent, and genuinely caring. They treated our sale like it was their own home. Highly recommend!"</div>
          <div class="testimonial-author">Jennifer Nelson</div>
          <div class="testimonial-title">Home Seller</div>
        </div>
        <div class="testimonial-card">
          <div class="testimonial-text">"I needed a quick sale and they delivered. Great communication and fair dealing. Five stars all the way."</div>
          <div class="testimonial-author">Marcus Williams</div>
          <div class="testimonial-title">Property Seller</div>
        </div>
        <div class="testimonial-card">
          <div class="testimonial-text">"This team is different. They actually care about helping, not just making a commission. Thank you for everything!"</div>
          <div class="testimonial-author">Sandra Lopez</div>
          <div class="testimonial-title">Repeat Customer</div>
        </div>
      </div>
    </div>
  </section>

  <footer id="contact">
    <div class="footer-container">
      <div class="footer-section">
        <h4>${config.company_name}</h4>
        <p>Your trusted local real estate partner for buying, selling, and investing.</p>
        <p style="margin-top: 1rem; font-weight: 600;">BBB Accredited A+</p>
      </div>
      <div class="footer-section">
        <h4>Quick Links</h4>
        <p><a href="#stats">Our Story</a></p>
        <p><a href="#benefits">Why Trust Us</a></p>
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
      <p>© 2026 ${config.company_name}. All rights reserved. Licensed in your state.</p>
    </div>
  </footer>

  <script>
    window.REI_SUBMIT_URL = window.REI_SUBMIT_URL || '/api/leads';

    function generateFormFields(fields) {
      const fieldLabels = {
        name: 'Your Name',
        phone: 'Phone Number',
        email: 'Email Address',
        address: 'How Can We Help?',
        message: 'Tell Us More'
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
    name: 'Your Name',
    phone: 'Phone Number',
    email: 'Email Address',
    address: 'How Can We Help?',
    message: 'Tell Us More'
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
