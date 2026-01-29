import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatSession } from "@/types/chat";
import { formatErrorResponse } from "@/lib/chat-errors";

/**
 * GET /api/chat-sessions - List chat sessions for the authenticated user
 * 
 * Note: Sessions are stored in Acontext, Supabase only stores minimal mapping
 * for querying and sorting (user_id -> acontext_session_id + metadata)
 */
export async function GET(_request: NextRequest) {
  try {
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

    // Get session mappings from Supabase
    // Note: id is now the acontext_session_id
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to load chat sessions: ${error.message}`);
    }

    const sessions: ChatSession[] =
      data?.map((s) => ({
        id: s.id, // This is now the acontext_session_id
        userId: s.user_id,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        title: s.title ?? undefined,
        acontextSessionId: s.acontext_session_id ?? s.id, // Use id if acontext_session_id is null
        acontextDiskId: s.acontext_disk_id ?? undefined,
        characterId: s.character_id ?? undefined, // Locked character ID for this session
      })) ?? [];

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(formatErrorResponse(error, false), {
      status: 500,
    });
  }
}


