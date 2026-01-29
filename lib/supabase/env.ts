/**
 * Supabase env resolution. Supports both standard and PPT-prefixed vars
 * (e.g. Vercel/Supabase integration uses NEXT_PUBLIC_PPT_SUPABASE_*).
 * Prefer PPT_ when set, otherwise fall back to NEXT_PUBLIC_SUPABASE_*.
 */
export function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_PPT_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function getSupabasePublishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_PPT_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
