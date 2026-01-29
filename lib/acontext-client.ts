/**
 * Acontext client wrapper
 *
 * - Creates a single AcontextClient instance per Node.js process
 * - Reads configuration from environment variables
 *
 * This is intentionally lightweight so you can swap or disable Acontext
 * just by changing env vars, without touching call sites.
 */

import { AcontextClient } from "@acontext/acontext";

let cachedClient: AcontextClient | null = null;

/**
 * Get (or lazily create) the shared Acontext client.
 *
 * If the required env vars are missing, this returns null so that
 * callers can gracefully no-op.
 */
export function getAcontextClient(): AcontextClient | null {
  const apiKey = process.env.ACONTEXT_API_KEY;
  const baseUrl = process.env.ACONTEXT_BASE_URL;

  if (!apiKey) {
    // Acontext is optional – if not configured, just skip integration.
    console.debug("[Acontext] API key not configured, skipping integration");
    return null;
  }

  if (!cachedClient) {
    console.debug("[Acontext] Initializing client", {
      baseUrl: baseUrl || "default (SDK default)",
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey?.length ?? 0,
    });
    
    // Only pass baseUrl if explicitly set (let SDK use its default otherwise)
    cachedClient = new AcontextClient(
      baseUrl
        ? {
            apiKey,
            baseUrl,
          }
        : {
            apiKey,
          }
    );
  }

  return cachedClient;
}


