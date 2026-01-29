import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Supports both NEXT_PUBLIC_SUPABASE_* and NEXT_PUBLIC_PPT_SUPABASE_* (e.g. Vercel)
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export const hasEnvVars =
  !!getSupabaseUrl() && !!getSupabasePublishableKey();
