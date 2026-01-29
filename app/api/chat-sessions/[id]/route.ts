import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatErrorResponse } from "@/lib/chat-errors";
import { deleteAcontextSession } from "@/lib/acontext-integration";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * DELETE /api/chat-sessions/[id] - Delete a specific chat session
 * 
 * Note: id is now the Acontext session ID.
 * Messages are stored in Acontext, so deleting the session mapping
 * removes access to the messages.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
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

    // Ensure the session belongs to the authenticated user
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", id) // id is now acontext_session_id
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError) {
      throw new Error(`Failed to verify session ownership: ${sessionError.message}`);
    }

    if (!session) {
      return NextResponse.json(
        formatErrorResponse(new Error("Session not found"), false),
        { status: 404 }
      );
    }

    // Delete from Acontext and remove mapping from Supabase
    const deleted = await deleteAcontextSession(id);

    if (!deleted) {
      throw new Error("Failed to delete session");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(formatErrorResponse(error, false), {
      status: 500,
    });
  }
}


