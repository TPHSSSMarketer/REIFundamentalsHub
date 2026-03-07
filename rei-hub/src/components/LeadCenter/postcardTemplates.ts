/**
 * Pre-built postcard front design templates for RE investing campaigns.
 * Each returns an HTML string sized at 1875×1275px (6.25"×4.25" @300 DPI).
 * Designed for professional direct mail campaigns targeting homeowners.
 */

export interface PostcardDesignConfig {
  company_name: string;
  company_phone: string;
  company_website?: string;
  company_logo_url?: string;
  primary_color: string; // hex color like '#1a3a5c'
  headline_override?: string; // optional custom headline
  property_address?: string; // for address-specific templates
}

export interface PostcardTemplate {
  id: string;
  name: string;
  description: string;
  campaign_type: string; // matches campaign types: motivated_seller, cash_offer, etc.
  thumbnail_emoji: string; // emoji for UI thumbnail
  render: (config: PostcardDesignConfig) => string;
}

/**
 * Template 1: "We Buy Houses" - Bold, high-contrast design
 * Campaign type: general, cash_offer
 */
const weBuyHouses: PostcardTemplate = {
  id: 'we_buy_houses',
  name: 'We Buy Houses',
  description: 'Bold "WE BUY HOUSES" with cash offer imagery. Eye-catching, high contrast.',
  campaign_type: 'cash_offer',
  thumbnail_emoji: '🏠',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: Arial, Helvetica, sans-serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, ${config.primary_color} 0%, ${adjustBrightness(config.primary_color, 20)} 100%);
          position: relative;
          padding: 60px 50px;
          color: white;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 40px;
        }
        .logo-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .company-logo {
          width: 80px;
          height: 80px;
          object-fit: contain;
        }
        .company-name {
          font-size: 20px;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          position: relative;
        }
        .headline {
          font-size: 110px;
          font-weight: 900;
          line-height: 1.1;
          margin-bottom: 30px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
          letter-spacing: -2px;
        }
        .tagline {
          font-size: 40px;
          font-weight: bold;
          margin-bottom: 30px;
          color: #fff9e6;
          letter-spacing: 2px;
        }
        .icons {
          display: flex;
          justify-content: center;
          gap: 40px;
          font-size: 50px;
          margin-bottom: 30px;
          opacity: 0.9;
        }
        .cta-section {
          background: white;
          color: ${config.primary_color};
          padding: 20px 40px;
          border-radius: 12px;
          text-align: center;
          margin-top: 20px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .phone {
          font-size: 48px;
          font-weight: 900;
          letter-spacing: 2px;
          margin-bottom: 8px;
        }
        .cta-text {
          font-size: 18px;
          font-weight: bold;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 2px solid rgba(255,255,255,0.3);
        }
        .website {
          font-size: 16px;
          opacity: 0.9;
        }
        .guarantee {
          font-size: 14px;
          text-align: right;
          font-style: italic;
          opacity: 0.85;
          max-width: 400px;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="header">
          <div class="logo-section">
            ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
            <div class="company-name">${config.company_name}</div>
          </div>
        </div>
        <div class="main-content">
          <div class="headline">WE BUY<br>HOUSES</div>
          <div class="icons">💰🏠💵</div>
          <div class="tagline">IN ANY CONDITION</div>
          <div class="cta-section">
            <div class="phone">${config.company_phone}</div>
            <div class="cta-text">Get Your Fair Cash Offer Today</div>
          </div>
        </div>
        <div class="footer">
          ${config.company_website ? `<div class="website">${config.company_website}</div>` : '<div></div>'}
          <div class="guarantee">Fast • Fair • No Obligations</div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Template 2: "Cash Offer in 24 Hours" - Clock/timer aesthetic
 * Campaign type: cash_offer
 */
const cashOffer: PostcardTemplate = {
  id: 'cash_offer',
  name: 'Cash Offer in 24 Hours',
  description: 'Get a Cash Offer in 24 Hours with clock/timer aesthetic. Modern, clean design.',
  campaign_type: 'cash_offer',
  thumbnail_emoji: '⏰',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: 'Arial', sans-serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: flex;
          background: white;
          position: relative;
        }
        .left-section {
          flex: 0.45;
          background: linear-gradient(180deg, ${config.primary_color} 0%, ${adjustBrightness(config.primary_color, -15)} 100%);
          color: white;
          padding: 60px 40px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-start;
          position: relative;
          overflow: hidden;
        }
        .timer-circle {
          position: absolute;
          bottom: -100px;
          right: -100px;
          width: 500px;
          height: 500px;
          border: 8px solid rgba(255,255,255,0.15);
          border-radius: 50%;
        }
        .logo-section {
          position: relative;
          z-index: 2;
        }
        .company-logo {
          width: 70px;
          height: 70px;
          object-fit: contain;
          margin-bottom: 12px;
        }
        .company-name {
          font-size: 18px;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .left-content {
          position: relative;
          z-index: 2;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .speed-badge {
          display: inline-block;
          background: rgba(255,255,255,0.2);
          border: 2px solid white;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 20px;
          width: fit-content;
          letter-spacing: 1px;
        }
        .timer-icon {
          font-size: 80px;
          margin: 20px 0;
          opacity: 0.9;
        }
        .timer-text {
          font-size: 28px;
          font-weight: bold;
          line-height: 1.3;
          margin-bottom: 20px;
        }
        .left-footer {
          position: relative;
          z-index: 2;
          font-size: 14px;
          opacity: 0.9;
        }
        .right-section {
          flex: 0.55;
          padding: 60px 50px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
          border-left: 4px solid ${config.primary_color};
        }
        .main-headline {
          font-size: 56px;
          font-weight: 900;
          color: ${config.primary_color};
          line-height: 1.2;
          margin-bottom: 20px;
        }
        .description {
          font-size: 18px;
          color: #444;
          line-height: 1.6;
          margin-bottom: 30px;
        }
        .benefits {
          background: white;
          padding: 25px;
          border-radius: 10px;
          margin-bottom: 25px;
          border-left: 4px solid ${config.primary_color};
        }
        .benefit-item {
          font-size: 16px;
          color: #333;
          margin-bottom: 12px;
          padding-left: 20px;
          position: relative;
        }
        .benefit-item:before {
          content: '✓';
          position: absolute;
          left: 0;
          color: ${config.primary_color};
          font-weight: bold;
          font-size: 18px;
        }
        .benefit-item:last-child {
          margin-bottom: 0;
        }
        .phone-section {
          background: ${config.primary_color};
          color: white;
          padding: 20px;
          border-radius: 10px;
          text-align: center;
          box-shadow: 0 6px 20px rgba(0,0,0,0.12);
        }
        .phone-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 8px;
          opacity: 0.9;
        }
        .phone-number {
          font-size: 44px;
          font-weight: 900;
          letter-spacing: 2px;
        }
        .website {
          font-size: 14px;
          color: #666;
          text-align: center;
          margin-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="left-section">
          <div class="timer-circle"></div>
          <div class="logo-section">
            ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
            <div class="company-name">${config.company_name}</div>
          </div>
          <div class="left-content">
            <div class="speed-badge">⚡ FAST TURNAROUND</div>
            <div class="timer-icon">⏰</div>
            <div class="timer-text">We Move Fast So You Don't Have To Wait</div>
          </div>
          <div class="left-footer">Professional • Reliable • Local</div>
        </div>
        <div class="right-section">
          <div>
            <div class="main-headline">Cash Offer in 24 Hours</div>
            <div class="description">No waiting. No uncertainty. Just a fair cash offer when you need it.</div>
            <div class="benefits">
              <div class="benefit-item">Transparent pricing</div>
              <div class="benefit-item">Zero hidden fees</div>
              <div class="benefit-item">Any condition accepted</div>
              <div class="benefit-item">Flexible closing dates</div>
            </div>
          </div>
          <div>
            <div class="phone-section">
              <div class="phone-label">Call Now</div>
              <div class="phone-number">${config.company_phone}</div>
            </div>
            ${config.company_website ? `<div class="website">${config.company_website}</div>` : ''}
          </div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Template 3: "Motivated Seller" - Empathetic, urgent but not pushy
 * Campaign type: motivated_seller
 */
const motivatedSeller: PostcardTemplate = {
  id: 'motivated_seller',
  name: 'Need to Sell Fast?',
  description: 'Empathetic design for motivated sellers. Includes key benefits: No Repairs, No Fees, Close Quick.',
  campaign_type: 'motivated_seller',
  thumbnail_emoji: '🚀',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: Georgia, serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%);
          padding: 50px;
          position: relative;
        }
        .header {
          margin-bottom: 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .logo-name {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        .company-logo {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .company-info {
          display: flex;
          flex-direction: column;
        }
        .company-name {
          font-size: 16px;
          font-weight: bold;
          letter-spacing: 1px;
          color: ${config.primary_color};
        }
        .tagline {
          font-size: 12px;
          color: #888;
          font-style: italic;
        }
        .main-section {
          flex: 1;
          display: flex;
          gap: 40px;
          margin-bottom: 30px;
        }
        .left-content {
          flex: 0.5;
          display: flex;
          flex-direction: column;
          justify-content: center;
          border-right: 3px solid ${config.primary_color};
          padding-right: 40px;
        }
        .headline {
          font-size: 52px;
          font-weight: bold;
          color: ${config.primary_color};
          line-height: 1.2;
          margin-bottom: 25px;
        }
        .subheadline {
          font-size: 18px;
          color: #555;
          margin-bottom: 25px;
          font-family: Arial, sans-serif;
          line-height: 1.6;
        }
        .right-content {
          flex: 0.5;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-left: 40px;
        }
        .benefits-title {
          font-size: 20px;
          font-weight: bold;
          color: ${config.primary_color};
          margin-bottom: 20px;
          font-family: Arial, sans-serif;
        }
        .benefit {
          display: flex;
          gap: 15px;
          margin-bottom: 18px;
          align-items: flex-start;
        }
        .benefit-icon {
          font-size: 28px;
          flex-shrink: 0;
          min-width: 40px;
        }
        .benefit-text {
          display: flex;
          flex-direction: column;
        }
        .benefit-title {
          font-size: 16px;
          font-weight: bold;
          color: #222;
          font-family: Arial, sans-serif;
        }
        .benefit-desc {
          font-size: 13px;
          color: #666;
          font-family: Arial, sans-serif;
          margin-top: 3px;
        }
        .footer {
          background: ${config.primary_color};
          color: white;
          padding: 25px 35px;
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .footer-left {
          display: flex;
          flex-direction: column;
        }
        .cta-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 5px;
          opacity: 0.9;
          font-family: Arial, sans-serif;
        }
        .phone {
          font-size: 40px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .footer-right {
          text-align: right;
        }
        .footer-website {
          font-size: 14px;
          margin-bottom: 4px;
        }
        .footer-promise {
          font-size: 11px;
          font-style: italic;
          opacity: 0.85;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="header">
          <div class="logo-name">
            ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
            <div class="company-info">
              <div class="company-name">${config.company_name}</div>
              <div class="tagline">Your Local Real Estate Solution</div>
            </div>
          </div>
        </div>
        <div class="main-section">
          <div class="left-content">
            <div class="headline">Need to Sell Fast?</div>
            <div class="subheadline">We understand. Life happens. Let us handle the rest so you can move forward.</div>
          </div>
          <div class="right-content">
            <div class="benefits-title">Why Choose Us?</div>
            <div class="benefit">
              <div class="benefit-icon">🔧</div>
              <div class="benefit-text">
                <div class="benefit-title">No Repairs Needed</div>
                <div class="benefit-desc">Sell as-is, no strings attached</div>
              </div>
            </div>
            <div class="benefit">
              <div class="benefit-icon">💰</div>
              <div class="benefit-text">
                <div class="benefit-title">No Hidden Fees</div>
                <div class="benefit-desc">Know exactly what you'll receive</div>
              </div>
            </div>
            <div class="benefit">
              <div class="benefit-icon">⚡</div>
              <div class="benefit-text">
                <div class="benefit-title">Close in Days</div>
                <div class="benefit-desc">We move fast so you don't have to wait</div>
              </div>
            </div>
          </div>
        </div>
        <div class="footer">
          <div class="footer-left">
            <div class="cta-label">Get Your Fair Cash Offer</div>
            <div class="phone">${config.company_phone}</div>
          </div>
          <div class="footer-right">
            ${config.company_website ? `<div class="footer-website">${config.company_website}</div>` : ''}
            <div class="footer-promise">No obligation • Confidential • Professional</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Template 4: "Inherited Property" - Softer, respectful, muted colors
 * Campaign type: probate
 */
const probate: PostcardTemplate = {
  id: 'probate',
  name: 'Inherited a Property?',
  description: 'Respectful, softer tone for inherited properties. Muted colors, compassionate messaging.',
  campaign_type: 'probate',
  thumbnail_emoji: '🤝',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: 'Georgia', serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: flex;
          background: linear-gradient(to right, #e8e6e1 0%, #f5f3f0 100%);
          padding: 0;
          position: relative;
        }
        .left-accent {
          width: 15px;
          background: linear-gradient(180deg, ${config.primary_color} 0%, ${adjustBrightness(config.primary_color, 10)} 100%);
        }
        .content {
          flex: 1;
          padding: 60px 55px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .header {
          margin-bottom: 20px;
        }
        .company-logo {
          width: 55px;
          height: 55px;
          object-fit: contain;
          margin-bottom: 10px;
        }
        .company-name {
          font-size: 16px;
          font-weight: bold;
          color: ${config.primary_color};
          letter-spacing: 1px;
        }
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .headline {
          font-size: 48px;
          font-weight: bold;
          color: ${config.primary_color};
          line-height: 1.3;
          margin-bottom: 20px;
        }
        .description {
          font-size: 16px;
          color: #5a5a5a;
          line-height: 1.7;
          margin-bottom: 30px;
          font-family: Arial, sans-serif;
        }
        .support-text {
          font-size: 14px;
          color: #777;
          font-style: italic;
          margin-bottom: 30px;
          border-left: 3px solid ${config.primary_color};
          padding-left: 15px;
        }
        .services {
          background: white;
          padding: 20px 25px;
          border-radius: 8px;
          margin-bottom: 30px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .services-title {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: ${config.primary_color};
          font-weight: bold;
          margin-bottom: 12px;
          font-family: Arial, sans-serif;
        }
        .service-item {
          font-size: 13px;
          color: #555;
          margin-bottom: 8px;
          font-family: Arial, sans-serif;
          padding-left: 18px;
          position: relative;
        }
        .service-item:before {
          content: '•';
          position: absolute;
          left: 0;
          color: ${config.primary_color};
          font-weight: bold;
        }
        .service-item:last-child {
          margin-bottom: 0;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-top: 15px;
          border-top: 1px solid rgba(0,0,0,0.1);
        }
        .phone-section {
          display: flex;
          flex-direction: column;
        }
        .phone-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: ${config.primary_color};
          margin-bottom: 4px;
          font-weight: bold;
          font-family: Arial, sans-serif;
        }
        .phone {
          font-size: 36px;
          font-weight: bold;
          color: ${config.primary_color};
          letter-spacing: 1px;
        }
        .footer-right {
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .website {
          font-size: 12px;
          color: ${config.primary_color};
          font-family: Arial, sans-serif;
        }
        .tagline {
          font-size: 11px;
          color: #999;
          font-style: italic;
          font-family: Arial, sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="left-accent"></div>
        <div class="content">
          <div class="header">
            ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
            <div class="company-name">${config.company_name}</div>
          </div>
          <div class="main">
            <div class="headline">Inherited a Property?</div>
            <div class="description">Managing an inherited property can feel overwhelming. We're here to help you navigate this transition with compassion and expertise.</div>
            <div class="support-text">We specialize in helping families handle inherited real estate—no pressure, no rush, just straightforward guidance.</div>
            <div class="services">
              <div class="services-title">We Can Help With</div>
              <div class="service-item">Estate settlement assistance</div>
              <div class="service-item">Quick fair-market appraisals</div>
              <div class="service-item">Keeping or selling options explained</div>
              <div class="service-item">Discreet, compassionate service</div>
            </div>
          </div>
          <div class="footer">
            <div class="phone-section">
              <div class="phone-label">Call Us</div>
              <div class="phone">${config.company_phone}</div>
            </div>
            <div class="footer-right">
              ${config.company_website ? `<div class="website">${config.company_website}</div>` : ''}
              <div class="tagline">With compassion, always</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Template 5: "Pre-Foreclosure" - Supportive, warm colors, helping hand imagery
 * Campaign type: pre_foreclosure
 */
const preForeclosure: PostcardTemplate = {
  id: 'pre_foreclosure',
  name: 'Behind on Payments?',
  description: 'Supportive tone for homeowners facing difficulties. Warm colors with helping hand imagery.',
  campaign_type: 'pre_foreclosure',
  thumbnail_emoji: '🤲',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: Arial, Helvetica, sans-serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: flex;
          background: linear-gradient(135deg, #fff8f0 0%, #ffe8d6 100%);
          padding: 50px;
          position: relative;
        }
        .left-column {
          flex: 0.4;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding-right: 35px;
          border-right: 2px dashed ${config.primary_color};
        }
        .header {
          margin-bottom: 20px;
        }
        .company-logo {
          width: 65px;
          height: 65px;
          object-fit: contain;
          margin-bottom: 12px;
        }
        .company-name {
          font-size: 16px;
          font-weight: bold;
          color: ${config.primary_color};
          letter-spacing: 1px;
        }
        .icon-section {
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 120px;
          margin: 30px 0;
          opacity: 0.85;
        }
        .footer-left {
          font-size: 12px;
          color: #666;
          text-align: center;
        }
        .right-column {
          flex: 0.6;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding-left: 35px;
        }
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .headline {
          font-size: 46px;
          font-weight: 900;
          color: ${config.primary_color};
          line-height: 1.2;
          margin-bottom: 18px;
        }
        .subheadline {
          font-size: 20px;
          font-weight: bold;
          color: ${adjustBrightness(config.primary_color, -10)};
          margin-bottom: 20px;
        }
        .description {
          font-size: 15px;
          color: #555;
          line-height: 1.6;
          margin-bottom: 25px;
        }
        .solution-box {
          background: white;
          padding: 20px;
          border-radius: 10px;
          border-left: 5px solid ${config.primary_color};
          margin-bottom: 20px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.08);
        }
        .solution-title {
          font-size: 14px;
          font-weight: bold;
          text-transform: uppercase;
          color: ${config.primary_color};
          letter-spacing: 1px;
          margin-bottom: 8px;
        }
        .solution-text {
          font-size: 14px;
          color: #555;
          line-height: 1.5;
        }
        .footer-right {
          background: linear-gradient(135deg, ${config.primary_color} 0%, ${adjustBrightness(config.primary_color, 10)} 100%);
          color: white;
          padding: 20px 25px;
          border-radius: 10px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .footer-cta {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 6px;
          opacity: 0.9;
        }
        .phone {
          font-size: 40px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .footer-note {
          font-size: 11px;
          margin-top: 10px;
          opacity: 0.85;
          font-style: italic;
        }
        .website {
          font-size: 12px;
          color: white;
          margin-top: 8px;
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="left-column">
          <div class="header">
            ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
            <div class="company-name">${config.company_name}</div>
          </div>
          <div class="icon-section">🤲</div>
          <div class="footer-left">We're here to help, not judge</div>
        </div>
        <div class="right-column">
          <div class="main-content">
            <div class="headline">Behind on Payments?</div>
            <div class="subheadline">We Can Help</div>
            <div class="description">You don't have to face this alone. We specialize in helping homeowners in difficult situations. There are options—and we'll explore them with you, confidentially.</div>
            <div class="solution-box">
              <div class="solution-title">Your Options Include:</div>
              <div class="solution-text">Loan modifications • Selling as-is quickly • Bridge financing • Other solutions</div>
            </div>
          </div>
          <div class="footer-right">
            <div class="footer-cta">Get Help Today</div>
            <div class="phone">${config.company_phone}</div>
            ${config.company_website ? `<div class="website">${config.company_website}</div>` : ''}
            <div class="footer-note">Confidential • Judgment-free • Local expertise</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Template 6: "Absentee Owner" - Address-personalized, clean, professional
 * Campaign type: absentee_owner
 */
const absenteeOwner: PostcardTemplate = {
  id: 'absentee_owner',
  name: 'Your Property at [Address]',
  description: 'Clean professional design with address personalization. References specific property.',
  campaign_type: 'absentee_owner',
  thumbnail_emoji: '📍',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: Arial, Helvetica, sans-serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: flex;
          background: white;
          padding: 0;
          position: relative;
        }
        .top-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 40px;
          background: ${config.primary_color};
          padding: 0 50px;
          display: flex;
          align-items: center;
          color: white;
          font-size: 12px;
          font-weight: bold;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .content {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 60px 50px;
          padding-top: 80px;
          position: relative;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid ${config.primary_color};
        }
        .logo-section {
          display: flex;
          gap: 15px;
          align-items: flex-start;
        }
        .company-logo {
          width: 70px;
          height: 70px;
          object-fit: contain;
        }
        .company-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .company-name {
          font-size: 18px;
          font-weight: bold;
          color: ${config.primary_color};
          letter-spacing: 1px;
        }
        .company-tagline {
          font-size: 12px;
          color: #777;
        }
        .main-content {
          flex: 1;
          display: flex;
          gap: 40px;
          margin-bottom: 25px;
        }
        .left-side {
          flex: 0.5;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .property-address {
          background: ${config.primary_color};
          color: white;
          padding: 18px 20px;
          border-radius: 8px;
          margin-bottom: 25px;
          font-size: 16px;
          font-weight: bold;
          letter-spacing: 0.5px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        }
        .headline {
          font-size: 48px;
          font-weight: 900;
          color: #222;
          line-height: 1.2;
          margin-bottom: 20px;
        }
        .description {
          font-size: 16px;
          color: #555;
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .right-side {
          flex: 0.5;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: linear-gradient(135deg, #f9f9f9 0%, #ffffff 100%);
          padding: 30px;
          border-radius: 12px;
          border: 2px solid ${config.primary_color};
        }
        .value-prop-title {
          font-size: 18px;
          font-weight: bold;
          color: ${config.primary_color};
          margin-bottom: 20px;
        }
        .value-prop {
          display: flex;
          gap: 15px;
          margin-bottom: 15px;
          align-items: flex-start;
        }
        .value-icon {
          font-size: 28px;
          flex-shrink: 0;
        }
        .value-text {
          display: flex;
          flex-direction: column;
        }
        .value-title {
          font-size: 14px;
          font-weight: bold;
          color: #222;
          margin-bottom: 2px;
        }
        .value-desc {
          font-size: 12px;
          color: #777;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 20px;
          border-top: 2px solid #eee;
        }
        .phone-section {
          background: ${config.primary_color};
          color: white;
          padding: 18px 28px;
          border-radius: 10px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        }
        .phone-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 4px;
          opacity: 0.9;
        }
        .phone {
          font-size: 38px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .website {
          font-size: 13px;
          color: ${config.primary_color};
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="top-bar">📍 Property at: ${config.property_address || '[Address will appear here]'}</div>
        <div class="content">
          <div class="header">
            <div class="logo-section">
              ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
              <div class="company-info">
                <div class="company-name">${config.company_name}</div>
                <div class="company-tagline">Real Estate Solutions</div>
              </div>
            </div>
          </div>
          <div class="main-content">
            <div class="left-side">
              ${config.property_address ? `<div class="property-address">📍 ${config.property_address}</div>` : ''}
              <div class="headline">We're Interested in Your Property</div>
              <div class="description">Whether you're considering selling or just exploring your options, we'd like to discuss what your property is worth in today's market.</div>
            </div>
            <div class="right-side">
              <div class="value-prop-title">Why Contact Us?</div>
              <div class="value-prop">
                <div class="value-icon">💼</div>
                <div class="value-text">
                  <div class="value-title">No Pressure</div>
                  <div class="value-desc">Let's just talk about your situation</div>
                </div>
              </div>
              <div class="value-prop">
                <div class="value-icon">⏱️</div>
                <div class="value-text">
                  <div class="value-title">Quick Appraisal</div>
                  <div class="value-desc">Fair market value assessment</div>
                </div>
              </div>
              <div class="value-prop">
                <div class="value-icon">🔐</div>
                <div class="value-text">
                  <div class="value-title">Confidential</div>
                  <div class="value-desc">Your business is our priority</div>
                </div>
              </div>
            </div>
          </div>
          <div class="footer">
            <div class="phone-section">
              <div class="phone-label">Call Now</div>
              <div class="phone">${config.company_phone}</div>
            </div>
            <div>
              ${config.company_website ? `<div class="website">${config.company_website}</div>` : ''}
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Template 7: "Vacant Property" - Strong visual of emptiness, highlights vacancy costs
 * Campaign type: vacant_property
 */
const vacantProperty: PostcardTemplate = {
  id: 'vacant_property',
  name: 'Is Your Property Sitting Empty?',
  description: 'Strong visuals of empty house concept. Highlights the cost of vacancy.',
  campaign_type: 'vacant_property',
  thumbnail_emoji: '🏚️',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: Arial, Helvetica, sans-serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          background: white;
          padding: 0;
          position: relative;
        }
        .left-section {
          background: linear-gradient(135deg, #d4d4d8 0%, #a1a1a6 100%);
          padding: 50px 40px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          text-align: center;
          color: white;
          position: relative;
          overflow: hidden;
        }
        .empty-house {
          font-size: 180px;
          opacity: 0.4;
          margin: 20px 0;
          line-height: 1;
        }
        .empty-label {
          font-size: 28px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 15px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .empty-description {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 20px;
          opacity: 0.95;
        }
        .company-info {
          position: absolute;
          bottom: 30px;
          left: 40px;
          right: 40px;
          text-align: left;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .company-logo {
          width: 50px;
          height: 50px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .company-name {
          font-size: 14px;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .right-section {
          background: ${config.primary_color};
          color: white;
          padding: 50px 45px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .headline {
          font-size: 52px;
          font-weight: 900;
          line-height: 1.2;
          margin-bottom: 20px;
        }
        .cost-warning {
          background: rgba(255,255,255,0.15);
          border: 2px solid white;
          border-radius: 10px;
          padding: 25px;
          margin-bottom: 25px;
        }
        .cost-title {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 12px;
          font-weight: bold;
          opacity: 0.9;
        }
        .cost-items {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .cost-item {
          font-size: 15px;
          padding-left: 20px;
          position: relative;
          line-height: 1.4;
        }
        .cost-item:before {
          content: '❌';
          position: absolute;
          left: 0;
          font-size: 14px;
        }
        .solution-section {
          margin-bottom: 20px;
        }
        .solution-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
        }
        .solution-text {
          font-size: 14px;
          line-height: 1.6;
          opacity: 0.95;
        }
        .cta-section {
          background: white;
          color: ${config.primary_color};
          padding: 22px 25px;
          border-radius: 10px;
          text-align: center;
          box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        }
        .cta-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 6px;
          font-weight: bold;
        }
        .phone {
          font-size: 42px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .cta-sub {
          font-size: 12px;
          margin-top: 6px;
          opacity: 0.85;
        }
        .website {
          font-size: 11px;
          color: white;
          margin-top: 15px;
          opacity: 0.8;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="left-section">
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%;">
            <div class="empty-house">🏚️</div>
            <div class="empty-label">Vacant</div>
            <div class="empty-description">Every Day Costs You Money</div>
          </div>
          <div class="company-info">
            ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
            <div class="company-name">${config.company_name}</div>
          </div>
        </div>
        <div class="right-section">
          <div>
            <div class="headline">Is Your Property Sitting Empty?</div>
            <div class="cost-warning">
              <div class="cost-title">Hidden Costs of Vacancy</div>
              <div class="cost-items">
                <div class="cost-item">Property taxes continue</div>
                <div class="cost-item">Maintenance costs mount up</div>
                <div class="cost-item">Insurance keeps running</div>
                <div class="cost-item">Property value declines</div>
              </div>
            </div>
            <div class="solution-section">
              <div class="solution-title">We Have a Solution</div>
              <div class="solution-text">Stop the bleeding. Get a fair cash offer and move forward. We buy vacant properties as-is, no repairs needed.</div>
            </div>
          </div>
          <div class="cta-section">
            <div class="cta-label">Get a Cash Offer</div>
            <div class="phone">${config.company_phone}</div>
            <div class="cta-sub">No inspections • Fast closing</div>
            ${config.company_website ? `<div class="website">${config.company_website}</div>` : ''}
          </div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Template 8: "Follow-Up" - References previous contact, more personal feeling
 * Campaign type: follow_up
 */
const followUp: PostcardTemplate = {
  id: 'follow_up',
  name: 'We\'re Still Interested',
  description: 'Follow-up design that references previous contact. More personal feeling.',
  campaign_type: 'follow_up',
  thumbnail_emoji: '💌',
  render: (config: PostcardDesignConfig) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1875px;
          height: 1275px;
          font-family: Georgia, serif;
          overflow: hidden;
          background: white;
        }
        .postcard {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%);
          padding: 60px;
          position: relative;
        }
        .header {
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .logo-section {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .company-logo {
          width: 55px;
          height: 55px;
          object-fit: contain;
        }
        .company-name {
          font-size: 15px;
          font-weight: bold;
          color: ${config.primary_color};
          letter-spacing: 1px;
        }
        .date-badge {
          background: ${config.primary_color};
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-family: Arial, sans-serif;
        }
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          margin-bottom: 30px;
        }
        .greeting {
          font-size: 18px;
          color: #666;
          margin-bottom: 20px;
          font-style: italic;
          font-family: Arial, sans-serif;
        }
        .headline {
          font-size: 54px;
          font-weight: bold;
          color: ${config.primary_color};
          line-height: 1.2;
          margin-bottom: 18px;
        }
        .message {
          font-size: 16px;
          color: #555;
          line-height: 1.8;
          margin-bottom: 25px;
          font-family: Arial, sans-serif;
          max-width: 900px;
        }
        .context-box {
          background: white;
          border-left: 5px solid ${config.primary_color};
          padding: 20px 22px;
          margin-bottom: 25px;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .context-label {
          font-size: 11px;
          text-transform: uppercase;
          color: ${config.primary_color};
          letter-spacing: 1.5px;
          font-weight: bold;
          margin-bottom: 6px;
          font-family: Arial, sans-serif;
        }
        .context-text {
          font-size: 14px;
          color: #555;
          font-family: Arial, sans-serif;
          line-height: 1.5;
        }
        .footer-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 20px;
          border-top: 2px solid ${config.primary_color};
        }
        .left-footer {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .company-phone {
          font-size: 14px;
          font-family: Arial, sans-serif;
          font-weight: bold;
          color: ${config.primary_color};
        }
        .personal-touch {
          font-size: 12px;
          color: #999;
          font-family: Arial, sans-serif;
          font-style: italic;
        }
        .right-footer {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        .button {
          background: ${config.primary_color};
          color: white;
          padding: 14px 28px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-family: Arial, sans-serif;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .website {
          font-size: 12px;
          color: ${config.primary_color};
          font-weight: bold;
          font-family: Arial, sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="postcard">
        <div class="header">
          <div class="logo-section">
            ${config.company_logo_url ? `<img class="company-logo" src="${config.company_logo_url}" alt="Logo">` : ''}
            <div class="company-name">${config.company_name}</div>
          </div>
          <div class="date-badge">2nd Notice</div>
        </div>
        <div class="main">
          <div class="greeting">Hi there,</div>
          <div class="headline">We're Still Interested</div>
          <div class="message">We reached out recently because we believe your property might be a good fit for our program. We haven't heard from you yet, so we thought we'd check in one more time. If now isn't the right moment, that's completely fine—but we'd love the opportunity to discuss your options.</div>
          <div class="context-box">
            <div class="context-label">Why We're Reaching Out</div>
            <div class="context-text">Real estate decisions take time. Whether you're thinking about selling, refinancing, or just exploring options, we're here when you're ready to talk—no pressure, no commitment.</div>
          </div>
        </div>
        <div class="footer-section">
          <div class="left-footer">
            <div class="company-phone">📞 ${config.company_phone}</div>
            <div class="personal-touch">— ${config.company_name}</div>
          </div>
          <div class="right-footer">
            <div class="button">Reply Today</div>
            ${config.company_website ? `<div class="website">${config.company_website}</div>` : ''}
          </div>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Export all templates
 */
export const POSTCARD_TEMPLATES: PostcardTemplate[] = [
  weBuyHouses,
  cashOffer,
  motivatedSeller,
  probate,
  preForeclosure,
  absenteeOwner,
  vacantProperty,
  followUp,
];

/**
 * Get a postcard template by ID
 */
export function getPostcardTemplate(id: string): PostcardTemplate | undefined {
  return POSTCARD_TEMPLATES.find((template) => template.id === id);
}

/**
 * Helper function to adjust color brightness
 * @param hex - hex color code like '#1a3a5c'
 * @param percent - positive to lighten, negative to darken
 */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, (num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}
