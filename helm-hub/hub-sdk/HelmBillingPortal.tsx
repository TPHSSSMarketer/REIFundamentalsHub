/**
 * Helm Billing Portal — React component for REIFundamentals Hub.
 *
 * Drop this component into your Hub app to get a complete billing page
 * with Stripe and PayPal subscription buttons.
 *
 * Usage:
 *   import { HelmBillingPortal } from './HelmBillingPortal';
 *
 *   <HelmBillingPortal
 *     helmApiUrl="https://your-helm-instance.com/api"
 *     tenantId="tenant-uuid"
 *     userEmail="user@example.com"
 *     userName="John Doe"
 *     successUrl="https://hub.reifundamentals.com/billing/success"
 *     cancelUrl="https://hub.reifundamentals.com/billing/cancel"
 *   />
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  helmBilling,
  type BillingConfigResponse,
  type SubscriptionStatusResponse,
} from "./helmBillingService";

// ── Props ──────────────────────────────────────────────────────────────────

interface HelmBillingPortalProps {
  /** Helm API base URL */
  helmApiUrl: string;
  /** Optional API key */
  helmApiKey?: string;
  /** Current tenant ID */
  tenantId: string;
  /** Current user's email */
  userEmail: string;
  /** Current user's full name */
  userName?: string;
  /** Stripe customer ID (if known) */
  stripeCustomerId?: string;
  /** URL to redirect after successful checkout */
  successUrl?: string;
  /** URL to redirect after cancelled checkout */
  cancelUrl?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export const HelmBillingPortal: React.FC<HelmBillingPortalProps> = ({
  helmApiUrl,
  helmApiKey,
  tenantId,
  userEmail,
  userName,
  stripeCustomerId,
  successUrl,
  cancelUrl,
}) => {
  const [config, setConfig] = useState<BillingConfigResponse | null>(null);
  const [subscription, setSubscription] =
    useState<SubscriptionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Configure the billing service
  useEffect(() => {
    helmBilling.configure({ apiUrl: helmApiUrl, apiKey: helmApiKey });
  }, [helmApiUrl, helmApiKey]);

  // Fetch billing config and subscription status
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [billingConfig, subStatus] = await Promise.all([
          helmBilling.getBillingConfig(),
          helmBilling.getSubscriptionStatus(tenantId).catch(() => null),
        ]);
        setConfig(billingConfig);
        setSubscription(subStatus);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load billing info"
        );
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [tenantId]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleStripeCheckout = useCallback(
    async (plan: "base" | "rei_plugin") => {
      setActionLoading(`stripe-${plan}`);
      try {
        const result = await helmBilling.stripeCheckout({
          plan,
          email: userEmail,
          tenantId,
          customerId: stripeCustomerId,
          successUrl,
          cancelUrl,
        });
        if (result.checkout_url) {
          window.location.href = result.checkout_url;
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Checkout failed"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [userEmail, tenantId, stripeCustomerId, successUrl, cancelUrl]
  );

  const handlePayPalSubscribe = useCallback(
    async (plan: "base" | "rei_plugin") => {
      setActionLoading(`paypal-${plan}`);
      try {
        const result = await helmBilling.paypalSubscribe({
          plan,
          email: userEmail,
          name: userName,
          tenantId,
          returnUrl: successUrl,
          cancelUrl,
        });
        if (result.approve_url) {
          window.location.href = result.approve_url;
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Subscription failed"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [userEmail, userName, tenantId, successUrl, cancelUrl]
  );

  const handleManageSubscription = useCallback(async () => {
    if (!stripeCustomerId) {
      setError("No Stripe customer ID available");
      return;
    }
    setActionLoading("manage");
    try {
      const result = await helmBilling.stripePortal({
        customerId: stripeCustomerId,
        returnUrl: window.location.href,
      });
      if (result.portal_url) {
        window.location.href = result.portal_url;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Portal failed"
      );
    } finally {
      setActionLoading(null);
    }
  }, [stripeCustomerId]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="helm-billing-loading">Loading billing info...</div>;
  }

  if (error) {
    return (
      <div className="helm-billing-error">
        <p>{error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="helm-billing-empty">
        Billing is not available at this time.
      </div>
    );
  }

  const hasStripe = config.stripe.configured;
  const hasPayPal = config.paypal.configured;
  const isActive = subscription?.is_active ?? false;
  const hasRei = subscription?.has_rei_plugin ?? false;

  return (
    <div className="helm-billing-portal">
      {/* Subscription Status */}
      {subscription && (
        <div className="helm-billing-status">
          <h3>Your Subscription</h3>
          <div className="helm-billing-status-grid">
            <div className="helm-billing-status-item">
              <span className="helm-billing-label">Account Status</span>
              <span
                className={`helm-billing-badge ${isActive ? "active" : "inactive"}`}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="helm-billing-status-item">
              <span className="helm-billing-label">REI Plugin</span>
              <span
                className={`helm-billing-badge ${hasRei ? "active" : "inactive"}`}
              >
                {hasRei ? "Enabled" : "Not Purchased"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Base Plan */}
      {!isActive && (
        <div className="helm-billing-plan-card">
          <h3>Helm Base Plan</h3>
          <p>
            Full access to Grace AI assistant — chat, agents, voice, and
            integrations.
          </p>
          <div className="helm-billing-actions">
            {hasStripe && config.stripe.plans.base && (
              <button
                className="helm-btn helm-btn-stripe"
                disabled={actionLoading !== null}
                onClick={() => handleStripeCheckout("base")}
              >
                {actionLoading === "stripe-base"
                  ? "Processing..."
                  : "Subscribe with Stripe"}
              </button>
            )}
            {hasPayPal && config.paypal.plans.base && (
              <button
                className="helm-btn helm-btn-paypal"
                disabled={actionLoading !== null}
                onClick={() => handlePayPalSubscribe("base")}
              >
                {actionLoading === "paypal-base"
                  ? "Processing..."
                  : "Subscribe with PayPal"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* REI Plugin Upsell */}
      {isActive && !hasRei && (
        <div className="helm-billing-plan-card">
          <h3>REI Plugin</h3>
          <p>
            Deal analysis, comps, portfolio tracking, BRRRR calculator. Adds
            Real Estate mode and specialized AI agents.
          </p>
          <div className="helm-billing-actions">
            {hasStripe && config.stripe.plans.rei_plugin && (
              <button
                className="helm-btn helm-btn-stripe"
                disabled={actionLoading !== null}
                onClick={() => handleStripeCheckout("rei_plugin")}
              >
                {actionLoading === "stripe-rei_plugin"
                  ? "Processing..."
                  : "Add with Stripe"}
              </button>
            )}
            {hasPayPal && config.paypal.plans.rei_plugin && (
              <button
                className="helm-btn helm-btn-paypal"
                disabled={actionLoading !== null}
                onClick={() => handlePayPalSubscribe("rei_plugin")}
              >
                {actionLoading === "paypal-rei_plugin"
                  ? "Processing..."
                  : "Add with PayPal"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manage Subscription */}
      {isActive && hasStripe && stripeCustomerId && (
        <div className="helm-billing-manage">
          <button
            className="helm-btn helm-btn-secondary"
            disabled={actionLoading !== null}
            onClick={handleManageSubscription}
          >
            {actionLoading === "manage"
              ? "Opening..."
              : "Manage Subscription"}
          </button>
        </div>
      )}
    </div>
  );
};
