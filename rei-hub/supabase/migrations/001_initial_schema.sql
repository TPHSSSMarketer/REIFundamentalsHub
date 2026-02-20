-- Initial schema for REIFundamentals Hub profiles table

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  plan TEXT DEFAULT 'starter',
  billing_interval TEXT DEFAULT 'monthly',
  subscription_status TEXT DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  subscription_ends_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  paypal_subscription_id TEXT,
  helm_addon_active BOOLEAN DEFAULT FALSE,
  helm_hub_linked BOOLEAN DEFAULT FALSE,
  helm_hub_linked_at TIMESTAMPTZ,
  seats_used INTEGER DEFAULT 1,
  is_admin BOOLEAN DEFAULT FALSE,
  trial_reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);