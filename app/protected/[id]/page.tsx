import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ChatbotPanel } from "@/components/chatbot-panel";

/**
 * Session-scoped protected page: /protected/[id].
 * Uses async params (Next.js 15+) and passes id as initialSessionId to ChatbotPanel.
 */
export default async function ProtectedSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 bg-background lg:flex-row px-4 pb-2 sm:px-6 lg:px-12">
      <div className="flex-1 min-h-0">
        <ChatbotPanel fullPage assistantName="PPT Girl" initialSessionId={id} />
      </div>
    </div>
  );
}
