import { ProtectedLayoutClient } from "@/components/protected-layout-client";

/**
 * Server layout for /protected. Awaits params when present (dynamic segment
 * e.g. /protected/[id]) to satisfy Next.js 15+ async params. Never passes
 * params to client to avoid "params are being enumerated" error.
 */
export default async function ProtectedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params?: Promise<{ id?: string }>;
}) {
  if (params) await params;
  return <ProtectedLayoutClient>{children}</ProtectedLayoutClient>;
}
