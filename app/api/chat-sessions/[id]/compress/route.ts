import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { compressSessionContext } from "@/lib/chat-session";
import { formatErrorResponse } from "@/lib/chat-errors";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * POST /api/chat-sessions/[id]/compress - Manually compress a session's context
 *
 * Notes:
 * - Applies more aggressive edit strategies (lower thresholds) to reclaim tokens.
 * - Returns compressed messages and updated token counts for UI display.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    // Next.js 15+ wraps params in a Promise; await to unwrap
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        formatErrorResponse(new Error("Authentication required"), false),
        { status: 401 }
      );
    }

    // Verify the session belongs to the authenticated user
    const { data: sessionData, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", id) // id is now acontext_session_id
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError || !sessionData) {
      return NextResponse.json(
        formatErrorResponse(new Error("Session not found"), false),
        { status: 404 }
      );
    }

    const result = await compressSessionContext(id);

    return NextResponse.json({
      messages: result.messages,
      tokenCounts: result.tokenCounts,
      strategiesApplied: result.strategiesApplied,
    });
  } catch (error) {
    return NextResponse.json(formatErrorResponse(error, false), {
      status: 500,
    });
  }
}

