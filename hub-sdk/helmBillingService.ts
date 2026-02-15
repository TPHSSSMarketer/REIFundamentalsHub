/**
 * Helm Billing Service — Drop-in client for REIFundamentals Hub.
 *
 * This file lives in the Hub codebase and handles all communication
 * with Helm's billing API. It provides methods to:
 *
 * - Fetch billing configuration (publishable keys, plan IDs)
 * - Create Stripe Checkout sessions
 * - Create PayPal subscriptions
 * - Open Stripe Billing Portal
 * - Check tenant subscription/plugin status
 *
 * Usage:
 *   import { helmBilling } from './helmBillingService';
 *
 *   // Initialize with your Helm API URL
 *   helmBilling.configure({ apiUrl: 'https://your-helm-instance.com/api' });
 *
 *   // Fetch billing config on page load
 *   const config = await helmBilling.getBillingConfig();
 *
 *   // Create a Stripe checkout
 *   const { checkout_url } = await helmBilling.stripeCheckout({
 *     plan: 'base',
 *     email: 'user@example.com',
 *     tenantId: 'tenant-uuid',
 *     successUrl: 'https://hub.reifundamentals.com/billing/success',
 *     cancelUrl: 'https://hub.reifundamentals.com/billing/cancel',
 *   });
 *   window.location.href = checkout_url;
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface HelmBillingConfig {
  /** Base URL for Helm API (e.g., https://your-helm.com/api) */
  apiUrl: string;
  /** Optional API key for authenticated requests */
  apiKey?: string;
}

export interface BillingConfigResponse {
  stripe: {
    configured: boolean;
    publishable_key: string | null;
    plans: {
      base: string | null;
      rei_plugin: string | null;
    };
  };
  paypal: {
    configured: boolean;
    client_id: string | null;
    mode: string;
    plans: {
      base: string | null;
      rei_plugin: string | null;
    };
  };
}

export interface StripeCheckoutRequest {
  plan: "base" | "rei_plugin";
  email: string;
  tenantId: string;
  customerId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface StripeCheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface StripePortalRequest {
  customerId: string;
  returnUrl?: string;
}

export interface StripePortalResponse {
  portal_url: string;
}

export interface PayPalSubscribeRequest {
  plan: "base" | "rei_plugin";
  email: string;
  name?: string;
  tenantId: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PayPalSubscribeResponse {
  subscription_id: string;
  approve_url: string | null;
  status: string;
}

export interface SubscriptionStatusResponse {
  tenant_id: string;
  is_active: boolean;
  enabled_plugins: string[];
  has_rei_plugin: boolean;
}

// ── Service ────────────────────────────────────────────────────────────────

class HelmBillingService {
  private apiUrl = "";
  private apiKey = "";

  /**
   * Configure the billing service with your Helm API URL.
   */
  configure(config: HelmBillingConfig): void {
    this.apiUrl = config.apiUrl.replace(/\/$/, ""); // strip trailing slash
    this.apiKey = config.apiKey || "";
  }

  /**
   * Internal fetch wrapper with auth headers.
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.apiUrl) {
      throw new Error(
        "HelmBillingService not configured. Call helmBilling.configure() first."
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    const res = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // ── Public Methods ─────────────────────────────────────────────────────

  /**
   * Get billing configuration (publishable keys, plan IDs).
   * Call this on page load to know which payment buttons to show.
   */
  async getBillingConfig(): Promise<BillingConfigResponse> {
    return this.request<BillingConfigResponse>("/hub/billing/config");
  }

  /**
   * Create a Stripe Checkout session.
   * Redirect the user to `checkout_url` after calling this.
   */
  async stripeCheckout(
    params: StripeCheckoutRequest
  ): Promise<StripeCheckoutResponse> {
    return this.request<StripeCheckoutResponse>("/hub/billing/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({
        plan: params.plan,
        email: params.email,
        tenant_id: params.tenantId,
        customer_id: params.customerId,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      }),
    });
  }

  /**
   * Open Stripe Billing Portal for self-serve management.
   * Redirect the user to `portal_url` after calling this.
   */
  async stripePortal(
    params: StripePortalRequest
  ): Promise<StripePortalResponse> {
    return this.request<StripePortalResponse>("/hub/billing/stripe/portal", {
      method: "POST",
      body: JSON.stringify({
        customer_id: params.customerId,
        return_url: params.returnUrl,
      }),
    });
  }

  /**
   * Create a PayPal subscription.
   * Redirect the user to `approve_url` after calling this.
   */
  async paypalSubscribe(
    params: PayPalSubscribeRequest
  ): Promise<PayPalSubscribeResponse> {
    return this.request<PayPalSubscribeResponse>("/hub/billing/paypal/subscribe", {
      method: "POST",
      body: JSON.stringify({
        plan: params.plan,
        email: params.email,
        name: params.name,
        tenant_id: params.tenantId,
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      }),
    });
  }

  /**
   * Check a tenant's subscription and plugin status.
   * Use this to gate features in the Hub UI.
   */
  async getSubscriptionStatus(
    tenantId: string
  ): Promise<SubscriptionStatusResponse> {
    return this.request<SubscriptionStatusResponse>(
      `/hub/billing/subscription/${tenantId}`
    );
  }
}

// ── Singleton Export ────────────────────────────────────────────────────────

export const helmBilling = new HelmBillingService();
