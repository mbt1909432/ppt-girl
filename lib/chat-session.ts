/**
 * Chat session persistence utilities
 * 
 * Note: Sessions are now primarily stored in Acontext.
 * Supabase only stores minimal mapping (user_id -> acontext_session_id) for querying/sorting.
 */

import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, ChatSession } from "@/types/chat";
import { createAcontextSessionDirectly } from "@/lib/acontext-integration";
import { getAcontextClient } from "@/lib/acontext-client";

/**
 * Creates a new chat session directly in Acontext
 * Supabase only stores a minimal mapping for querying
 */
export async function createChatSession(
  userId: string,
  title?: string,
  characterId?: string
): Promise<ChatSession> {
  // CharacterId is required for new sessions
  if (!characterId) {
    throw new Error("characterId is required when creating a new session");
  }

  // Create session directly in Acontext
  const result = await createAcontextSessionDirectly(userId, title, characterId);
  
  if (!result) {
    throw new Error("Failed to create Acontext session");
  }

  // Get the mapping from Supabase to get timestamps
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", result.sessionId)
    .single();

  if (error || !data) {
    // If Supabase mapping doesn't exist, return minimal session info
    // Note: We can't get diskId without querying Supabase, so it will be undefined
    return {
      id: result.sessionId,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      title: title || "New Chat",
      acontextSessionId: result.acontextSessionId,
      characterId,
    };
  }

  return {
    id: data.id,
    userId: data.user_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    title: data.title,
    acontextSessionId: data.acontext_session_id,
    acontextDiskId: data.acontext_disk_id,
    characterId: data.character_id,
  };
}

/**
 * Loads messages for a chat session from Acontext
 * Note: sessionId is now the Acontext session ID directly
 * Automatically applies context editing strategies if needed (Plan A)
 */
export async function loadMessages(
  sessionId: string
): Promise<ChatMessage[]> {
  // sessionId is now the Acontext session ID directly
  // Load messages from Acontext with automatic context editing
  const {
    loadMessagesFromAcontext,
    getAcontextTokenCounts,
    determineEditStrategies,
  } = await import("@/lib/acontext-integration");

  // Step 1: Check token counts
  const tokenCounts = await getAcontextTokenCounts(sessionId);

  // Step 2: Load messages without strategies first (to analyze tool calls)
  const messagesForAnalysis = await loadMessagesFromAcontext(sessionId);

  // Step 3: Determine which strategies to apply automatically
  const editStrategies = determineEditStrategies(tokenCounts, messagesForAnalysis);

  // Step 4: Load messages with strategies applied (if any)
  if (editStrategies.length > 0) {
    console.debug("[ChatSession] Auto-applying context editing strategies", {
      strategies: editStrategies.map((s) => s.type),
      tokenCounts: tokenCounts?.total_tokens,
    });
    return await loadMessagesFromAcontext(sessionId, editStrategies);
  }

  return messagesForAnalysis;
}

/**
 * Manually compresses a chat session's context using more aggressive thresholds.
 * This lets users reclaim context window before automatic strategies kick in.
 */
export async function compressSessionContext(sessionId: string) {
  const {
    loadMessagesFromAcontext,
    getAcontextTokenCounts,
    determineEditStrategies,
  } = await import("@/lib/acontext-integration");

  // Fetch current token counts (may be null if unavailable)
  const tokenCounts = await getAcontextTokenCounts(sessionId);

  // Load messages to analyze tool usage and provide a baseline
  const messagesForAnalysis = await loadMessagesFromAcontext(sessionId);

  // Apply strategies with a lower threshold so users can pre-emptively trim context
  const editStrategies = determineEditStrategies(tokenCounts, messagesForAnalysis, {
    tokenLimitThreshold: 70000, // Start trimming earlier than the automatic 80K threshold
    tokenLimitTarget: 60000, // Target a smaller window after manual compression
  });

  // If no strategies were chosen, return the current messages/counts
  if (editStrategies.length === 0) {
    return {
      messages: messagesForAnalysis,
      tokenCounts,
      strategiesApplied: [],
    };
  }

  console.debug("[ChatSession] Manually compressing context", {
    strategies: editStrategies.map((s) => s.type),
    tokenCounts: tokenCounts?.total_tokens,
  });

  // Load messages with strategies applied
  const compressedMessages = await loadMessagesFromAcontext(
    sessionId,
    editStrategies
  );

  // Refresh token counts after compression
  const refreshedTokenCounts = await getAcontextTokenCounts(sessionId);

  return {
    messages: compressedMessages,
    tokenCounts: refreshedTokenCounts ?? tokenCounts,
    strategiesApplied: editStrategies.map((s) => s.type),
  };
}

/**
 * Gets or creates a chat session for the current user
 * Note: sessionId is now the Acontext session ID
 */
export async function getOrCreateSession(
  userId: string,
  sessionId?: string,
  characterId?: string
): Promise<ChatSession> {
  if (sessionId) {
    // sessionId is now the Acontext session ID
    // Get the mapping from Supabase
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId) // id is now acontext_session_id
      .eq("user_id", userId)
      .single();

    if (!error && data) {
      // If session doesn't have a disk, create one and update the session record
      let diskId = data.acontext_disk_id;
      if (!diskId) {
        const acontext = getAcontextClient();
        if (acontext) {
          try {
            const disk = await acontext.disks.create();
            diskId = disk.id;
            console.debug("[ChatSession] Created disk for session without disk", {
              sessionId: data.id,
              diskId,
            });

            // Update the session record with the new disk ID
            await supabase
              .from("chat_sessions")
              .update({ acontext_disk_id: diskId })
              .eq("id", data.id)
              .eq("user_id", userId);
          } catch (error) {
            console.warn("[ChatSession] Failed to create disk for session:", error);
            // Continue without disk - session will still work
          }
        }
      }

      return {
        id: data.id,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        title: data.title,
        acontextSessionId: data.acontext_session_id,
        acontextDiskId: diskId,
        characterId: data.character_id, // Return stored characterId (locked for this session)
      };
    }
    
    // If not found in Supabase but sessionId exists, it might be a valid Acontext session
    // Return minimal session info (messages will be loaded from Acontext)
    // Note: diskId will be undefined for old sessions without disk mapping
    return {
      id: sessionId,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      title: "Chat",
      acontextSessionId: sessionId,
      // characterId is undefined for old sessions
    };
  }

  // Creating new session - characterId is required
  if (!characterId) {
    throw new Error("characterId is required when creating a new session");
  }

  return await createChatSession(userId, undefined, characterId);
}

