import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/types/chat";
import { formatErrorResponse } from "@/lib/chat-errors";
import { loadMessages } from "@/lib/chat-session";
import { getAcontextTokenCounts } from "@/lib/acontext-integration";
import { getAcontextClient } from "@/lib/acontext-client";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * GET /api/chat-sessions/[id]/messages - List messages for a specific session
 *
 * Notes:
 * - Messages are loaded from Acontext
 * - id is now the Acontext session ID directly
 * - If the session has no messages yet, return an empty array (no "Session not found" error).
 * - Access is enforced by verifying the session belongs to the authenticated user.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    // Next.js 15+ wraps params in a Promise; await to unwrap
    const { id } = await params; // This is now the Acontext session ID
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

    // Verify the session belongs to the authenticated user and check if it has a disk
    const { data: sessionData, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("id, acontext_disk_id, character_id")
      .eq("id", id) // id is now acontext_session_id
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError || !sessionData) {
      // Session not found or doesn't belong to user, return empty array
      return NextResponse.json({ messages: [] });
    }

    // If session doesn't have a disk, create one and update the session record
    let currentDiskId = sessionData.acontext_disk_id;
    if (!currentDiskId) {
      const acontext = getAcontextClient();
      if (acontext) {
        try {
          const disk = await acontext.disks.create();
          currentDiskId = disk.id;
          console.debug("[ChatSessions] Created disk for session without disk", {
            sessionId: id,
            diskId: currentDiskId,
          });

          // Update the session record with the new disk ID
          await supabase
            .from("chat_sessions")
            .update({ acontext_disk_id: currentDiskId })
            .eq("id", id)
            .eq("user_id", user.id);
        } catch (error) {
          console.warn("[ChatSessions] Failed to create disk for session:", error);
          // Continue without disk - session will still work
        }
      }
    }

    // Load messages from Acontext (with automatic context editing strategies applied)
    const messages = await loadMessages(id);

    const withToolCalls = messages.filter((m) => m.toolCalls && m.toolCalls.length > 0);
    console.log("[ToolCallsDebug] GET /api/chat-sessions/[id]/messages: returning messages", {
      sessionId: id,
      total: messages.length,
      withToolCallsCount: withToolCalls.length,
      toolCallsPerMsg: messages.map((m, i) => ({ i, role: m.role, n: m.toolCalls?.length ?? 0 })),
    });

    // Get current token counts for the session (for UI display)
    let tokenCounts: { total_tokens: number } | undefined;
    const counts = await getAcontextTokenCounts(id);
    if (counts) {
      tokenCounts = counts;
    }

    return NextResponse.json({ 
      messages, 
      tokenCounts,
      acontextDiskId: currentDiskId, // Include diskId in response so frontend can update
      characterId: sessionData?.character_id ?? undefined, // Return locked characterId
    });
  } catch (error) {
    return NextResponse.json(formatErrorResponse(error, false), {
      status: 500,
    });
  }
}


