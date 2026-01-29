import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ChatbotPanel } from "@/components/chatbot-panel";
// PPT-specific branch: sidebar skills card is not used

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-2 bg-background lg:flex-row">
      <div className="flex-1 min-h-0">
        <ChatbotPanel
          fullPage
          assistantName="PPT Girl"
        />
      </div>
    </div>
  );
}
