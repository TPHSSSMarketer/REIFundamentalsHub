import { TemplateConfig } from './index'
import { renderIcon, renderStars, heroImages, avatarImages, adjustBrightness, hexToRgba } from './icons'
import { getTemplateDefaults } from './defaults'

export function generateHTML(config: TemplateConfig): string {
  const color = config.primary_color || '#1e3a5f'
  const colorDark = adjustBrightness(color, -20)
  const colorLight = adjustBrightness(color, 20)
  const heroImage = heroImages.company_credibility
  const avatars = avatarImages.company_credibility
  const defaults = getTemplateDefaults('company_credibility')
  const trustBadges = config.trust_badges || defaults.trust_badges
  const testimonials = config.testimonials || defaults.testimonials
  const faqItems = config.faq_items || defaults.faq_items

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.company_name} - Your Trusted Real Estate Partner</title>
  <meta name="description" content="${config.description}">
  <meta property="og:title" content="${config.headline}">
  <meta property="og:description" content="${config.description}">
  <meta property="og:image" content="${heroImage}">
  <meta property="og:type" content="website">
  <meta name="theme-color" content="${color}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: ${color};
      --primary-dark: ${colorDark};
      --primary-light: ${colorLight};
      --primary-10: ${hexToRgba(color, 0.1)};
      --primary-20: ${hexToRgba(color, 0.2)};
      --accent: #f59e0b;
      --text-dark: #1f2937;
      --text-medium: #4b5563;
      --text-light: #6b7280;
      --bg-light: #f9fafb;
      --bg-white: #ffffff;
      --border: #e5e7eb;
      --success: #10b981;
      --star-color: #fbbf24;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--text-dark);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* ===== HEADER ===== */
    header {
      background: var(--bg-white);
      padding: 1rem 0;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
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
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--primary);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .logo img { height: 40px; border-radius: 4px; }
    .header-nav {
      display: flex;
      gap: 2rem;
      align-items: center;
    }
    .header-nav a {
      text-decoration: none;
      color: var(--text-medium);
      font-size: 0.95rem;
      font-weight: 500;
      transition: color 0.3s;
    }
    .header-nav a:hover { color: var(--primary); }
    .header-phone {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 700;
      color: var(--primary);
      text-decoration: none;
      font-size: 1.05rem;
    }
    .header-phone svg { width: 18px; height: 18px; }
    .mobile-toggle {
      display: none;
      background: none;
      border: none;
      color: var(--text-dark);
      cursor: pointer;
      padding: 0.5rem;
    }
    .mobile-menu {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--bg-white);
      z-index: 200;
      padding: 2rem;
      flex-direction: column;
      gap: 1.5rem;
    }
    .mobile-menu.active { display: flex; }
    .mobile-menu a {
      font-size: 1.2rem;
      color: var(--text-dark);
      text-decoration: none;
      font-weight: 600;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
    }
    .mobile-close {
      align-self: flex-end;
      background: none;
      border: none;
      color: var(--text-dark);
      cursor: pointer;
      padding: 0.5rem;
    }

    /* ===== HERO ===== */
    .hero {
      background-image: url('${heroImage}');
      background-size: cover;
      background-position: center;
      position: relative;
      min-height: 650px;
      display: flex;
      align-items: center;
      padding: 4rem 2rem;
    }
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, ${hexToRgba(color, 0.85)} 0%, rgba(0,0,0,0.6) 100%);
      z-index: 1;
    }
    .hero-container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 3rem;
      align-items: center;
      position: relative;
      z-index: 2;
      width: 100%;
    }
    .hero-content { color: white; }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(4px);
      padding: 0.5rem 1rem;
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      color: white;
    }
    .hero-badge svg { width: 16px; height: 16px; }
    .hero-content h1 {
      font-size: 3.2rem;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 1.5rem;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .hero-content p {
      font-size: 1.2rem;
      margin-bottom: 2rem;
      opacity: 0.95;
      line-height: 1.7;
      max-width: 540px;
    }
    .hero-stats {
      display: flex;
      gap: 2.5rem;
      margin-top: 2rem;
    }
    .hero-stat { text-align: center; }
    .hero-stat .number {
      font-size: 2rem;
      font-weight: 800;
      display: block;
    }
    .hero-stat .label {
      font-size: 0.85rem;
      opacity: 0.85;
    }

    /* ===== FORM ===== */
    .form-card {
      background: var(--bg-white);
      padding: 2.5rem;
      border-radius: 16px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.3);
    }
    .form-title {
      color: var(--primary);
      font-size: 1.4rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      text-align: center;
    }
    .form-subtitle {
      color: var(--text-light);
      font-size: 0.9rem;
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .form-group { margin-bottom: 1rem; }
    .form-group label {
      display: block;
      color: var(--text-dark);
      font-weight: 600;
      margin-bottom: 0.4rem;
      font-size: 0.9rem;
    }
    .form-group input, .form-group textarea {
      width: 100%;
      padding: 0.85rem 1rem;
      border: 2px solid var(--border);
      border-radius: 10px;
      font-family: inherit;
      font-size: 1rem;
      transition: all 0.3s;
      background: var(--bg-light);
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 4px var(--primary-10);
      background: white;
    }
    .form-group textarea { resize: vertical; min-height: 80px; }
    .submit-btn {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s;
      margin-top: 0.5rem;
      letter-spacing: 0.3px;
    }
    .submit-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px ${hexToRgba(color, 0.4)};
    }
    .form-note {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-light);
      margin-top: 0.75rem;
    }
    .form-note svg { width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px; }
    .success-msg, .error-msg {
      display: none;
      padding: 1rem;
      border-radius: 10px;
      text-align: center;
      font-weight: 600;
      margin-top: 1rem;
    }
    .success-msg { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .error-msg { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

    /* ===== TRUST BAR ===== */
    .trust-bar {
      background: var(--bg-light);
      padding: 2rem;
      border-bottom: 1px solid var(--border);
    }
    .trust-bar-container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 3rem;
      flex-wrap: wrap;
    }
    .trust-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--text-medium);
      font-weight: 600;
      font-size: 0.95rem;
    }
    .trust-item svg { color: var(--primary); width: 22px; height: 22px; }
    .trust-item .stars { color: var(--star-color); display: flex; gap: 2px; }
    .trust-item .stars svg { width: 16px; height: 16px; }
    .trust-item strong { color: var(--primary); font-size: 1.1rem; }

    /* ===== SECTIONS COMMON ===== */
    .section { padding: 5rem 2rem; }
    .section-container { max-width: 1200px; margin: 0 auto; }
    .section-header { text-align: center; margin-bottom: 3.5rem; }
    .section-label {
      display: inline-block;
      background: var(--primary-10);
      color: var(--primary);
      padding: 0.4rem 1rem;
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 1rem;
    }
    .section-title {
      font-size: 2.5rem;
      font-weight: 800;
      color: var(--text-dark);
      margin-bottom: 1rem;
      line-height: 1.2;
    }
    .section-subtitle {
      font-size: 1.1rem;
      color: var(--text-light);
      max-width: 600px;
      margin: 0 auto;
    }

    /* ===== HOW IT WORKS ===== */
    .how-it-works { background: var(--bg-white); }
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2.5rem;
    }
    .step { text-align: center; position: relative; padding: 2rem 1.5rem; }
    .step-number {
      position: absolute;
      top: 0; right: 1.5rem;
      font-size: 4rem;
      font-weight: 800;
      color: var(--primary-10);
      line-height: 1;
    }
    .step-icon {
      width: 80px; height: 80px;
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      color: white;
      box-shadow: 0 8px 20px ${hexToRgba(color, 0.3)};
    }
    .step-icon svg { width: 36px; height: 36px; }
    .step h3 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-dark); }
    .step p { color: var(--text-light); font-size: 0.95rem; line-height: 1.6; }

    /* ===== BENEFITS ===== */
    .benefits { background: var(--bg-light); }
    .benefits-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; }
    .benefit-card {
      background: var(--bg-white);
      padding: 2rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      display: flex;
      gap: 1.25rem;
      transition: all 0.3s;
    }
    .benefit-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 30px rgba(0,0,0,0.08);
      border-color: var(--primary);
    }
    .benefit-icon {
      width: 52px; height: 52px; min-width: 52px;
      background: var(--primary-10);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
    }
    .benefit-icon svg { width: 26px; height: 26px; }
    .benefit-card h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-dark); }
    .benefit-card p { color: var(--text-light); font-size: 0.95rem; line-height: 1.6; }

    /* ===== TESTIMONIALS ===== */
    .testimonials { background: var(--bg-white); }
    .testimonials-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
    .testimonial-card {
      background: var(--bg-light);
      padding: 2rem;
      border-radius: 16px;
      border: 1px solid var(--border);
      transition: all 0.3s;
    }
    .testimonial-card:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.08); }
    .testimonial-stars { color: var(--star-color); display: flex; gap: 2px; margin-bottom: 1rem; }
    .testimonial-stars svg { width: 18px; height: 18px; }
    .testimonial-text { color: var(--text-medium); font-size: 0.95rem; line-height: 1.7; margin-bottom: 1.5rem; font-style: italic; }
    .testimonial-author { display: flex; align-items: center; gap: 1rem; }
    .testimonial-avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary-20); }
    .testimonial-name { font-weight: 700; font-size: 0.95rem; color: var(--text-dark); }
    .testimonial-title { font-size: 0.8rem; color: var(--text-light); }

    /* ===== FAQ ===== */
    .faq { background: var(--bg-light); }
    .faq-list { max-width: 800px; margin: 0 auto; }
    .faq-item { margin-bottom: 1rem; }
    .faq-question {
      width: 100%; padding: 1.25rem 1.5rem;
      background: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: 12px;
      text-align: left; cursor: pointer;
      display: flex; justify-content: space-between; align-items: center;
      font-weight: 600; font-size: 1rem; color: var(--text-dark);
      transition: all 0.3s; font-family: inherit;
    }
    .faq-question:hover { border-color: var(--primary); box-shadow: 0 4px 12px var(--primary-10); }
    .faq-question.active { background: var(--primary); color: white; border-color: var(--primary); border-radius: 12px 12px 0 0; }
    .faq-question svg { width: 20px; height: 20px; transition: transform 0.3s; flex-shrink: 0; }
    .faq-question.active svg { transform: rotate(180deg); }
    .faq-answer {
      display: none; padding: 1.25rem 1.5rem;
      background: var(--bg-white);
      border: 1px solid var(--border); border-top: none;
      border-radius: 0 0 12px 12px;
      color: var(--text-medium); line-height: 1.7; font-size: 0.95rem;
    }
    .faq-answer.active { display: block; }

    /* ===== CTA BANNER ===== */
    .cta-banner {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white; padding: 5rem 2rem; text-align: center;
      position: relative; overflow: hidden;
    }
    .cta-banner::before {
      content: ''; position: absolute; top: -50%; right: -10%;
      width: 400px; height: 400px; background: rgba(255,255,255,0.08); border-radius: 50%;
    }
    .cta-banner h2 { font-size: 2.5rem; font-weight: 800; margin-bottom: 1rem; position: relative; z-index: 1; }
    .cta-banner p { font-size: 1.15rem; opacity: 0.9; margin-bottom: 2rem; max-width: 600px; margin-left: auto; margin-right: auto; position: relative; z-index: 1; }
    .cta-btn {
      display: inline-block; padding: 1rem 2.5rem; background: var(--accent); color: white;
      border: none; border-radius: 10px; font-size: 1.1rem; font-weight: 700; cursor: pointer;
      transition: all 0.3s; text-decoration: none; position: relative; z-index: 1;
    }
    .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.2); background: #e08e09; }

    /* ===== FOOTER ===== */
    footer { background: #111827; color: #d1d5db; padding: 4rem 2rem 2rem; }
    .footer-container { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 3rem; }
    .footer-brand h3 { font-size: 1.4rem; font-weight: 800; color: white; margin-bottom: 1rem; }
    .footer-brand p { font-size: 0.9rem; line-height: 1.7; color: #9ca3af; margin-bottom: 1.5rem; }
    .footer-social { display: flex; gap: 1rem; }
    .footer-social a { width: 40px; height: 40px; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #d1d5db; transition: all 0.3s; text-decoration: none; }
    .footer-social a:hover { background: var(--primary); color: white; }
    .footer-social svg { width: 18px; height: 18px; }
    footer h4 { color: white; font-weight: 700; margin-bottom: 1.5rem; text-transform: uppercase; letter-spacing: 1px; font-size: 0.85rem; }
    .footer-links { list-style: none; }
    .footer-links li { margin-bottom: 0.75rem; }
    .footer-links a { color: #9ca3af; text-decoration: none; font-size: 0.9rem; transition: color 0.3s; }
    .footer-links a:hover { color: white; }
    .footer-contact li { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
    .footer-contact svg { width: 18px; height: 18px; color: var(--primary-light); flex-shrink: 0; }
    .footer-contact a { color: #9ca3af; text-decoration: none; transition: color 0.3s; }
    .footer-contact a:hover { color: white; }
    .footer-bottom { max-width: 1200px; margin: 3rem auto 0; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; font-size: 0.85rem; color: #6b7280; }

    /* ===== RESPONSIVE ===== */
    @media (max-width: 1024px) {
      .hero-container { grid-template-columns: 1fr; max-width: 600px; }
      .hero-content h1 { font-size: 2.5rem; }
      .benefits-grid { grid-template-columns: 1fr; }
      .testimonials-grid { grid-template-columns: 1fr; }
      .footer-container { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 768px) {
      .header-nav { display: none; }
      .mobile-toggle { display: block; }
      .hero { min-height: auto; padding: 3rem 1.5rem; }
      .hero-content h1 { font-size: 2rem; }
      .hero-stats { gap: 1.5rem; }
      .hero-stat .number { font-size: 1.5rem; }
      .steps-grid { grid-template-columns: 1fr; gap: 2rem; }
      .section { padding: 3.5rem 1.5rem; }
      .section-title { font-size: 2rem; }
      .trust-bar-container { gap: 1.5rem; }
      .cta-banner h2 { font-size: 1.8rem; }
      .footer-container { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <header>
    <div class="header-container">
      <a href="#" class="logo">
        ${config.logo_url ? `<img src="${config.logo_url}" alt="${config.company_name}">` : `${renderIcon('home', 22)} ${config.company_name}`}
      </a>
      <nav class="header-nav">
        <a href="#how-it-works">How It Works</a>
        <a href="#benefits">Why Us</a>
        <a href="#testimonials">Reviews</a>
        <a href="#faq">FAQ</a>
        <a href="tel:${config.phone}" class="header-phone">${renderIcon('phone', 18)} ${config.phone}</a>
      </nav>
      <button class="mobile-toggle" onclick="document.getElementById('mobileMenu').classList.add('active')" aria-label="Open menu">
        ${renderIcon('menu', 24)}
      </button>
    </div>
  </header>

  <!-- MOBILE MENU -->
  <div id="mobileMenu" class="mobile-menu">
    <button class="mobile-close" onclick="document.getElementById('mobileMenu').classList.remove('active')" aria-label="Close menu">
      ${renderIcon('x', 28)}
    </button>
    <a href="#how-it-works" onclick="document.getElementById('mobileMenu').classList.remove('active')">How It Works</a>
    <a href="#benefits" onclick="document.getElementById('mobileMenu').classList.remove('active')">Why Us</a>
    <a href="#testimonials" onclick="document.getElementById('mobileMenu').classList.remove('active')">Reviews</a>
    <a href="#faq" onclick="document.getElementById('mobileMenu').classList.remove('active')">FAQ</a>
    <a href="tel:${config.phone}" style="color: var(--primary);">${config.phone}</a>
  </div>

  <!-- HERO -->
  <section class="hero">
    <div class="hero-container">
      <div class="hero-content">
        <div class="hero-badge">${renderIcon('award', 16)} Established & Trusted</div>
        <h1>${config.headline}</h1>
        <p>${config.description}</p>
        <div class="hero-stats">
          <div class="hero-stat"><span class="number">15+</span><span class="label">Years In Business</span></div>
          <div class="hero-stat"><span class="number">1,000+</span><span class="label">Happy Clients</span></div>
          <div class="hero-stat"><span class="number">A+</span><span class="label">BBB Rating</span></div>
        </div>
      </div>
      <div class="form-card">
        <h2 class="form-title">Get In Touch</h2>
        <p class="form-subtitle">Learn how we can help with your real estate needs.</p>
        <form id="leadForm">
          ${generateFormFields(config.form_fields)}
          <button type="submit" class="submit-btn">Contact Us →</button>
          <p class="form-note">${renderIcon('shieldCheck', 14)} Your info is private and never shared.</p>
        </form>
        <div class="success-msg" id="successMsg">Thank you! We'll be in touch within 24 hours.</div>
        <div class="error-msg" id="errorMsg">Something went wrong. Please try again or call us directly.</div>
      </div>
    </div>
  </section>

  <!-- TRUST BAR -->
  <section class="trust-bar">
    <div class="trust-bar-container">
      ${trustBadges.map(badge => `<div class="trust-item">${renderIcon(badge.icon, 22)} <span>${badge.bold ? `<strong>${badge.bold}</strong> ` : ''}${badge.text}</span></div>`).join('\n      ')}
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="section how-it-works" id="how-it-works">
    <div class="section-container">
      <div class="section-header">
        <span class="section-label">Our Process</span>
        <h2 class="section-title">How It Works</h2>
        <p class="section-subtitle">Building relationships with our clients is at the heart of everything we do.</p>
      </div>
      <div class="steps-grid">
        <div class="step">
          <span class="step-number">01</span>
          <div class="step-icon">${renderIcon('phone', 36)}</div>
          <h3>Reach Out</h3>
          <p>Contact us by phone or fill out our form. We're here to listen and answer all your questions about your real estate needs.</p>
        </div>
        <div class="step">
          <span class="step-number">02</span>
          <div class="step-icon">${renderIcon('users', 36)}</div>
          <h3>Meet Our Team</h3>
          <p>We'll connect you with our experienced professionals who understand your market and your goals.</p>
        </div>
        <div class="step">
          <span class="step-number">03</span>
          <div class="step-icon">${renderIcon('trendingUp', 36)}</div>
          <h3>Get Results</h3>
          <p>With our proven expertise and commitment to your success, we'll deliver outstanding results you can trust.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- BENEFITS -->
  <section class="section benefits" id="benefits">
    <div class="section-container">
      <div class="section-header">
        <span class="section-label">Why Choose Us</span>
        <h2 class="section-title">The Credibility Advantage</h2>
        <p class="section-subtitle">When you work with us, you're choosing a partner with proven experience and integrity.</p>
      </div>
      <div class="benefits-grid">
        <div class="benefit-card">
          <div class="benefit-icon">${renderIcon('shieldCheck', 26)}</div>
          <div><h3>Licensed & Insured</h3><p>All team members are fully licensed, insured, and comply with all industry regulations and standards.</p></div>
        </div>
        <div class="benefit-card">
          <div class="benefit-icon">${renderIcon('heart', 26)}</div>
          <div><h3>Community Focused</h3><p>We're deeply rooted in our community and invested in building long-term relationships with our clients.</p></div>
        </div>
        <div class="benefit-card">
          <div class="benefit-icon">${renderIcon('checkCircle', 26)}</div>
          <div><h3>Transparent Process</h3><p>We believe in clear communication and transparent practices from start to finish. No hidden fees or surprises.</p></div>
        </div>
        <div class="benefit-card">
          <div class="benefit-icon">${renderIcon('award', 26)}</div>
          <div><h3>Proven Track Record</h3><p>15+ years of success helping over 1,000 satisfied clients achieve their real estate goals.</p></div>
        </div>
      </div>
    </div>
  </section>

  <!-- TESTIMONIALS -->
  <section class="section testimonials" id="testimonials">
    <div class="section-container">
      <div class="section-header">
        <span class="section-label">Real Stories</span>
        <h2 class="section-title">What Our Clients Say</h2>
        <p class="section-subtitle">Don't just take our word for it. Here's what real clients have to say about working with us.</p>
      </div>
      <div class="testimonials-grid">
        ${testimonials.map((t, i) => `<div class="testimonial-card">
          <div class="testimonial-stars">${renderStars(t.stars || 5)}</div>
          <p class="testimonial-text">"${t.quote}"</p>
          <div class="testimonial-author">
            <img src="${avatars[i % avatars.length]}" alt="${t.name}" class="testimonial-avatar">
            <div><div class="testimonial-name">${t.name}</div><div class="testimonial-title">${t.title}${config.market ? `, ${config.market}` : ''}</div></div>
          </div>
        </div>`).join('\n        ')}
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="section faq" id="faq">
    <div class="section-container">
      <div class="section-header">
        <span class="section-label">Common Questions</span>
        <h2 class="section-title">Frequently Asked Questions</h2>
      </div>
      <div class="faq-list">
        ${faqItems.map(faq => `<div class="faq-item">
          <button class="faq-question" onclick="toggleFAQ(this)">${faq.question} ${renderIcon('chevronDown', 20)}</button>
          <div class="faq-answer">${faq.answer}</div>
        </div>`).join('\n        ')}
      </div>
    </div>
  </section>

  <!-- CTA BANNER -->
  <section class="cta-banner">
    <h2>Ready to Work With a Team You Can Trust?</h2>
    <p>Contact us today to learn how our experience and expertise can benefit your real estate goals.</p>
    <a href="#" class="cta-btn" onclick="document.getElementById('leadForm').scrollIntoView({behavior:'smooth'});return false;">Get In Touch Today →</a>
  </section>

  <!-- FOOTER -->
  <footer>
    <div class="footer-container">
      <div class="footer-brand">
        <h3>${config.company_name}</h3>
        <p>Trusted real estate professionals with 15+ years of experience. We're committed to delivering exceptional service and helping our clients achieve their real estate goals${config.market ? `. Proudly serving ${config.market} and surrounding areas` : ''}.</p>
        <div class="footer-social">
          <a href="#" aria-label="Facebook">${renderIcon('facebook', 18)}</a>
          <a href="#" aria-label="Instagram">${renderIcon('instagram', 18)}</a>
          <a href="#" aria-label="Website">${renderIcon('globe', 18)}</a>
        </div>
      </div>
      <div>
        <h4>Quick Links</h4>
        <ul class="footer-links">
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="#benefits">Why Choose Us</a></li>
          <li><a href="#testimonials">Reviews</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
      </div>
      <div>
        <h4>Contact Us</h4>
        <ul class="footer-links footer-contact">
          <li>${renderIcon('phone', 18)} <a href="tel:${config.phone}">${config.phone}</a></li>
          <li>${renderIcon('mail', 18)} <a href="mailto:${config.email}">${config.email}</a></li>
          ${config.market ? `<li>${renderIcon('mapPin', 18)} <span>${config.market}</span></li>` : ''}
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; ${new Date().getFullYear()} ${config.company_name}. All rights reserved.</p>
    </div>
  </footer>

  <script>
    var submitUrl = window.REI_SUBMIT_URL || '${config.company_slug && config.slug ? `/${config.company_slug}/sites/${config.slug}/submit` : config.slug ? `/sites/${config.slug}/submit` : '/api/leads'}';
    document.getElementById('leadForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var form = e.target;
      var btn = form.querySelector('.submit-btn');
      var data = {};
      new FormData(form).forEach(function(val, key) { data[key] = val; });
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(r) {
        if (!r.ok) throw new Error('Failed');
        document.getElementById('successMsg').style.display = 'block';
        document.getElementById('errorMsg').style.display = 'none';
        form.reset();
        setTimeout(function() { document.getElementById('successMsg').style.display = 'none'; }, 5000);
      })
      .catch(function() {
        document.getElementById('errorMsg').style.display = 'block';
        document.getElementById('successMsg').style.display = 'none';
        setTimeout(function() { document.getElementById('errorMsg').style.display = 'none'; }, 5000);
      })
      .finally(function() {
        btn.disabled = false;
        btn.textContent = 'Contact Us \\u2192';
      });
    });
    function toggleFAQ(btn) {
      var answer = btn.nextElementSibling;
      var isActive = btn.classList.contains('active');
      document.querySelectorAll('.faq-question').forEach(function(q) {
        q.classList.remove('active');
        if (q.nextElementSibling) q.nextElementSibling.classList.remove('active');
      });
      if (!isActive) { btn.classList.add('active'); answer.classList.add('active'); }
    }
    document.querySelectorAll('a[href^="#"]').forEach(function(a) {
      a.addEventListener('click', function(e) {
        var target = document.querySelector(this.getAttribute('href'));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    });
  </script>
</body>
</html>`
}

function generateFormFields(fields: string[]): string {
  const fieldConfig: Record<string, { label: string; type: string; placeholder: string; required: boolean }> = {
    name: { label: 'Full Name', type: 'text', placeholder: 'John Smith', required: true },
    phone: { label: 'Phone Number', type: 'tel', placeholder: '(555) 123-4567', required: true },
    email: { label: 'Email Address', type: 'email', placeholder: 'john@example.com', required: true },
    address: { label: 'Property Address', type: 'text', placeholder: '123 Main St, City, State', required: true },
    message: { label: 'Tell Us About Your Situation (Optional)', type: 'textarea', placeholder: 'Any details about your needs...', required: false },
  }

  return fields.map(field => {
    const cfg = fieldConfig[field] || { label: field, type: 'text', placeholder: '', required: false }
    if (cfg.type === 'textarea') {
      return `<div class="form-group">
            <label for="${field}">${cfg.label}</label>
            <textarea id="${field}" name="${field}" placeholder="${cfg.placeholder}" rows="3"></textarea>
          </div>`
    }
    return `<div class="form-group">
          <label for="${field}">${cfg.label}</label>
          <input type="${cfg.type}" id="${field}" name="${field}" placeholder="${cfg.placeholder}" ${cfg.required ? 'required' : ''}>
        </div>`
  }).join('\n          ')
}
