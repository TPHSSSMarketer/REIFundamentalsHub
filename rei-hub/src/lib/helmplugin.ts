/**
 * helmPlugin.ts
 * Supabase helper for updating the user's Helm Hub link status
 * on the profiles table.
 *
 * Requires two columns on the `profiles` table (add in Supabase dashboard):
 *   helm_hub_linked   boolean     default false
 *   helm_hub_linked_at timestamptz nullable
 */

export async function updateHelmHubLinkStatus(
  supabase: any,
  userId: string,
  linked: boolean
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      helm_hub_linked: linked,
      helm_hub_linked_at: linked ? new Date().toISOString() : null,
    })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to update Helm Hub link status: ${error.message}`)
  }
}