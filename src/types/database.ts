/**
 * Supabase Database Types
 *
 * These correspond to the tables you create in your Supabase project.
 * Run the SQL migration in /supabase/migrations/001_initial_schema.sql
 * to set up the database.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id'>>
      }
      organizations: {
        Row: Organization
        Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Organization, 'id'>>
      }
    }
  }
}

export interface Profile {
  id: string // matches auth.users.id
  email: string
  full_name: string
  company_name: string | null
  organization_id: string | null
  role: 'owner' | 'admin' | 'member'
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  owner_id: string
  // GHL API credentials (per-organization)
  ghl_api_key: string | null
  ghl_location_id: string | null
  ghl_base_url: string
  // Google Calendar credentials (optional)
  google_client_id: string | null
  google_api_key: string | null
  // Subscription
  plan: 'trial' | 'starter' | 'professional' | 'enterprise'
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}
