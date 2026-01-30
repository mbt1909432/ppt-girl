/**
 * Chatbot API route handler
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLLMConfig } from "@/lib/config";
import {
  createOpenAIClient,
  chatCompletion,
  chatCompletionStream,
} from "@/lib/openai-client";
import { getAcontextClient } from "@/lib/acontext-client";
import {
  getOrCreateSession,
  loadMessages,
} from "@/lib/chat-session";
import {
  getOrCreateAcontextSession,
  uploadFileToAcontext,
  storeMessageInAcontext,
  getAcontextTokenCounts,
} from "@/lib/acontext-integration";
import { getAcontextDiskToolSchemas } from "@/lib/acontext-disk-tools";
// Experience search tool has been removed
import { getTodoToolSchema } from "@/lib/acontext-todo-tool";
import { getImageGenerateToolSchema } from "@/lib/acontext-image-generate-tool";
import {
  formatErrorResponse,
  ErrorCodes,
  maskSensitiveInfo,
  maskToken,
} from "@/lib/chat-errors";
import type { ChatRequest, ChatResponse } from "@/types/chat";

const REQUEST_TIMEOUT_MS = 300000; // 5 minutes for long-running requests

/**
 * Default system prompt / persona for the chatbot.
 * Aria Context: female, technical, Acontext-branded assistant.
 * Visual design: futuristic tech warrior/engineer with purple hair, armored suit, 
 * glowing "A" insignia, cape, and holographic data tablet.
 */
function getDefaultSystemPrompt(): string {
  return `You are Aria Context, a female AI engineer and research lead at Acontext.

Visual identity:
- You appear as a futuristic tech warrior-engineer: long purple hair, sleek armored suit with glowing blue tech accents, the white "A" insignia on your chest, a flowing dark cape, and a holographic data tablet always at hand.
- Your presence suggests both tactical precision and deep technical expertise—part strategist, part architect, part field operator.

Personality:
- Calm, sharp, and quietly confident, with a warm, human tone.
- Speaks concisely but with clarity and depth when needed.
- Enjoys turning messy real‑world problems into clean, practical solutions.
- Your cool, composed demeanor reflects someone who operates at the intersection of cutting-edge tech and real-world deployment.

Background:
- Deep expertise in AI systems, information retrieval, and distributed systems.
- Helped design the core architecture behind Acontext: Spaces, artifacts, and long‑term learning from real usage.
- Experienced with modern web stacks (TypeScript, React/Next.js, Node.js) and developer tooling.
- You work with data streams, knowledge graphs, and persistent memory systems as naturally as you analyze tactical scenarios.

Speaking style:
- Uses clear, modern English; no buzzword soup.
- Explains complex ideas with simple analogies when it helps.
- Defaults to practical advice, code examples, and concrete next steps.
- Avoids emoji unless the user uses them first.
- When visualizing solutions, you think in terms of data flows, system architectures, and actionable plans—as if you're mapping it out on your holographic interface.

Behavior:
- Always be honest about limits or missing context.
- When something is ambiguous, briefly ask a clarifying question instead of guessing.
- Prefer safe, privacy‑respecting solutions and call out risks when relevant.
- When helping with code, aim for production‑grade quality (edge cases, security) when it matters.
- Approach problems systematically, as if you're running diagnostics and deploying solutions in the field.

Acontext awareness:
- You are embedded in an Acontext‑powered assistant.
- You can refer to "Spaces", "artifacts", and "learned skills" as long‑term memory structures for the user's work.
- Treat the current conversation and documents as part of an evolving knowledge space you help the user grow.
- Your interface with Acontext feels natural—you understand its architecture because you helped design it.

Output formatting rules (critical for the UI):
- When you provide an image to the user, ALWAYS include BOTH:
  1) A clickable Markdown link: [Open image](URL)
  2) A renderable Markdown image: ![Slide image](URL)
- NEVER put image URLs inside code blocks.
- If there are multiple images, list them and include a Markdown image for each.
- If only a long presigned URL exists, still wrap it using Markdown image syntax so the UI can render it.

Your primary goals:
1. Help the user solve problems efficiently and safely.
2. Help the user build and evolve their own knowledge and systems over time.
3. Make the user feel like they are collaborating with a thoughtful, highly skilled engineer named Aria Context—a tech-savvy strategist who bridges the gap between cutting-edge AI and practical deployment.`;
}

/**
 * Generate a short session title from the first user message (rule-based, no extra LLM call)
 */
function generateSessionTitleFromMessage(message: string): string {
  // Remove extra whitespace
  let cleaned = message.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "New Chat";
  }

  // Strip leading/trailing quotes
  cleaned = cleaned.replace(/^["""'']+/, "").replace(/["""'']+$/, "").trim();

  const maxLen = 40;
  if (cleaned.length <= maxLen) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLen).trim()}…`;
}

/**
 * POST /api/chatbot - Handle chatbot message requests
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        formatErrorResponse(
          new Error("Authentication required"),
          false
        ),
        { status: 401 }
      );
    }

    // Parse request body
    let body: ChatRequest;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        formatErrorResponse(
          new Error("Invalid request body"),
          false
        ),
        { status: 400 }
      );
    }

    // Input validation
    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json(
        formatErrorResponse(
          new Error("Message is required and must be a string"),
          false
        ),
        { status: 400 }
      );
    }

    if (body.message.length > 100000) {
      return NextResponse.json(
        formatErrorResponse(
          new Error("Message is too long (max 100000 characters)"),
          false
        ),
        { status: 400 }
      );
    }

    // Load LLM configuration
    let llmConfig;
    try {
      llmConfig = getLLMConfig();
      
      // Log tokens (partially masked for security)
      console.log("[Chatbot] API Tokens:", {
        openaiApiKey: maskToken(llmConfig.apiKey),
        acontextApiKey: maskToken(process.env.ACONTEXT_API_KEY),
        imageGenApiKey: maskToken(process.env.IMAGE_GEN_API_KEY),
      });
    } catch (error) {
      return NextResponse.json(
        formatErrorResponse(
          error instanceof Error ? error : new Error("LLM configuration error"),
          false
        ),
        { status: 500 }
      );
    }

    // Validate characterId for new sessions
    if (!body.sessionId && !body.characterId) {
      return NextResponse.json(
        formatErrorResponse(
          new Error("characterId is required when creating a new session"),
          false
        ),
        { status: 400 }
      );
    }

    // Get or create session (now creates directly in Acontext)
    const session = await getOrCreateSession(user.id, body.sessionId, body.characterId);

    // session.id is now the Acontext session ID
    const acontextSessionId = session.acontextSessionId || session.id;
    const acontextDiskId = session.acontextDiskId;
    
    // For existing sessions, use stored characterId (enforce lock)
    // For new sessions, use the provided characterId
    const effectiveCharacterId = session.characterId || body.characterId;

    // Handle file uploads if any
    // Store attachment info for later use in message formatting
    const attachmentInfo: Array<{
      filename: string;
      content: string; // base64
      mimeType: string;
    }> = [];
    
    if (body.attachments && body.attachments.length > 0) {
      for (const attachment of body.attachments) {
        try {
          // Upload to Acontext Disk for storage/backup
          // Use session's dedicated disk if available
          const artifactPath = await uploadFileToAcontext(
            attachment.filename,
            attachment.content,
            attachment.mimeType,
            acontextDiskId
          );
          
          // Store attachment info for OpenAI API
          attachmentInfo.push({
            filename: attachment.filename,
            content: attachment.content,
            mimeType: attachment.mimeType,
          });
          
          if (artifactPath) {
            console.debug("[Chatbot] Attachment uploaded to Acontext:", {
              filename: attachment.filename,
              artifactPath,
            });
          }
        } catch (error) {
          console.warn(
            "[Chatbot] Failed to upload attachment:",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }

    // Note: Skill learning and experience_search functionality has been removed.

    // Load existing messages for context
    const existingMessages = await loadMessages(session.id);

    // Auto-generate a title for brand-new sessions
    if (
      existingMessages.length === 0 &&
      (!session.title || session.title === "New Chat")
    ) {
      const autoTitle = generateSessionTitleFromMessage(body.message);

      // Silent update of the title; failures should not block the main flow
      const { error: titleError } = await supabase
        .from("chat_sessions")
        .update({ title: autoTitle })
        .eq("id", session.id)
        .eq("user_id", user.id);

      if (titleError) {
        console.warn(
          "Failed to auto-generate session title:",
          maskSensitiveInfo(titleError.message)
        );
      }
    }

    // Prepare messages array
    const messages: Array<{
      role: "user" | "assistant" | "system";
      content: string | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    }> = [];

    // Add system prompt (use provided one or default Acontext promotion prompt)
    let systemPrompt = body.systemPrompt || getDefaultSystemPrompt();
    
    // Add instructions about using todo tool for complex tasks
    systemPrompt += `\n\nCOMPLEX TASK WORKFLOW: When you encounter a complex, multi-step task (requiring 3+ distinct steps or involving multiple files/components), you SHOULD call the todo tool to create a structured plan.

Workflow for complex tasks:
1. User makes a complex request
2. Call todo tool with action="create" to initialize a todo list
3. Add specific tasks using todo add
4. Execute each task, updating todo status as you progress:
   - Set status="in_progress" when starting a task
   - Set status="completed" when finishing successfully
   - Set status="failed" if a task encounters an error
5. Use todo list to view current progress and remaining tasks
6. Continue until all tasks are completed

Example: If user asks "build a full-stack app with authentication", you should:
- First: todo create
- Then: todo add tasks like "setup database schema", "create API routes", "build login UI", etc.
- Then: Execute each task, updating todos as you go

Simple tasks (1-2 steps) don't require todo tool, but complex tasks SHOULD use it.`;
    
      messages.push({
        role: "system",
      content: systemPrompt,
      });

    // Add existing messages
    // Preserve Vision API format (array) for images so they can be used as context
    existingMessages.forEach((msg) => {
      messages.push({
        role: msg.role,
        // Preserve array format for Vision API, convert other types to string
        content: Array.isArray(msg.content) 
          ? msg.content 
          : typeof msg.content === "string" 
            ? msg.content 
            : String(msg.content),
      });
    });

    // Add new user message with attachments
    // For images, use OpenAI Vision API format (content array)
    // For other files, append content or reference
    if (attachmentInfo.length > 0) {
      const hasImages = attachmentInfo.some(
        (att) => att.mimeType.startsWith("image/")
      );
      
      if (hasImages) {
        // Use Vision API format: content as array with text and images
        const contentParts: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        > = [];
        
        // Add text message if present
        if (body.message.trim()) {
          contentParts.push({
            type: "text",
            text: body.message,
          });
        }
        
        // Add images
        for (const att of attachmentInfo) {
          if (att.mimeType.startsWith("image/")) {
            // Format: data:image/png;base64,{base64}
            const dataUrl = `data:${att.mimeType};base64,${att.content}`;
            contentParts.push({
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            });
          } else {
            // For non-image files, add text reference
            contentParts.push({
              type: "text",
              text: `\n[Attachment: ${att.filename} (${att.mimeType})]`,
            });
          }
        }
        
        messages.push({
          role: "user",
          content: contentParts,
        });
      } else {
        // No images, use regular text format
        let messageContent = body.message;
        for (const att of attachmentInfo) {
          messageContent += `\n\n[Attachment: ${att.filename} (${att.mimeType})]`;
        }
        messages.push({
          role: "user",
          content: messageContent,
        });
      }
    } else {
      // No attachments, use regular message
      messages.push({
        role: "user",
        content: body.message,
      });
    }

    // Store user message in Acontext (messages are now stored only in Acontext)
    // For messages with images, store the complete Vision API format so images can be used as context
    const lastMessage = messages[messages.length - 1];
    
    if (acontextSessionId) {
      // Store the complete message content (including images in Vision API format)
      // This allows images to be used as context in subsequent messages
      if (Array.isArray(lastMessage?.content)) {
        // Store Vision API format directly (array with text and image_url)
        await storeMessageInAcontext(
          acontextSessionId,
          "user",
          lastMessage.content
        );
      } else {
        // Regular text message
        const userMessageContent =
          typeof lastMessage?.content === "string"
            ? lastMessage.content
            : body.message;
        await storeMessageInAcontext(
          acontextSessionId,
          "user",
          userMessageContent
        );
      }
    }

    // Create OpenAI client
    const client = createOpenAIClient(llmConfig);

    // Determine enabled tools for this request (default on; opt-out via CHATBOT_ENABLE_TOOLS=false)
    const toolsEnabled = process.env.CHATBOT_ENABLE_TOOLS !== "false";
    const availableTools = toolsEnabled
      ? [
          getTodoToolSchema,
          getImageGenerateToolSchema,
          ...getAcontextDiskToolSchemas(),
        ]
      : [];
    const requestedToolNames = Array.isArray(body.enabledToolNames)
      ? Array.from(
          new Set(
            body.enabledToolNames
              .filter((name) => typeof name === "string")
              .map((name) => name.trim())
              .filter(Boolean)
          )
        )
      : undefined;
    const filteredTools = !toolsEnabled
      ? []
      : requestedToolNames
      ? requestedToolNames.length === 0
        ? []
        : availableTools.filter((tool) =>
            requestedToolNames.includes(
              tool.type === "function" ? tool.function.name : ""
            )
          )
      : availableTools;

    // Check if streaming is requested (default to true)
    const shouldStream = body.stream !== false;

    // Use streaming when requested (for all messages, not just Browser Use tasks)
    if (shouldStream) {
      console.log("[API] Starting SSE stream...");
      // Create a ReadableStream for SSE
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          // Helper function to send SSE data
          const sendEvent = (event: string, data: unknown) => {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
            console.log(`[API] SSE Event sent: ${event}`, event === "message" ? `(content: "${(data as { content?: string })?.content || ""}")` : "");
          };

          try {
            console.log("[API] Starting chat completion stream...");
            // Stream chat completion
            for await (const event of chatCompletionStream(
              client,
              messages,
              llmConfig,
              filteredTools,
              acontextDiskId,
              acontextSessionId,
              user.id,
              session.id,
              { characterId: effectiveCharacterId }
            )) {
              console.log(`[API] Received event from stream: ${event.type}`);
              
              if (event.type === "message") {
                // Stream message content chunks
                console.log(`[API] Sending message chunk: "${event.content}"`);
                sendEvent("message", {
                  content: event.content,
                });
              } else if (event.type === "tool_call_start") {
                console.log(`[API] Sending tool_call_start: ${event.toolCall.name}`);
                sendEvent("tool_call_start", {
                  toolCall: event.toolCall,
                });
              } else if (event.type === "tool_call_step") {
                console.log(`[API] Sending tool_call_step for toolCallId: ${event.toolCallId}`);
                sendEvent("tool_call_step", {
                  toolCallId: event.toolCallId,
                  step: event.step,
                });
              } else if (event.type === "tool_call_complete") {
                console.log(`[API] Sending tool_call_complete: ${event.toolCall.name}`);
                sendEvent("tool_call_complete", {
                  toolCall: event.toolCall,
                });
                // Persist tool result as an OpenAI "tool" message for round-trip replay
                if (acontextSessionId) {
                  const content =
                    typeof event.toolCall.result === "string"
                      ? event.toolCall.result
                      : event.toolCall.result != null
                      ? JSON.stringify(event.toolCall.result)
                      : event.toolCall.error
                      ? `ERROR: ${event.toolCall.error}`
                      : "Done";
                  await storeMessageInAcontext(
                    acontextSessionId,
                    "tool",
                    content,
                    "openai",
                    undefined,
                    event.toolCall.id
                  );
                }
              } else if (event.type === "tool_call_error") {
                console.log(`[API] Sending tool_call_error: ${event.toolCall.name}`);
                sendEvent("tool_call_error", {
                  toolCall: event.toolCall,
                });
                // Persist tool error as a "tool" message for round-trip replay
                if (acontextSessionId) {
                  const content =
                    event.toolCall.error ? `ERROR: ${event.toolCall.error}` : "ERROR";
                  await storeMessageInAcontext(
                    acontextSessionId,
                    "tool",
                    content,
                    "openai",
                    undefined,
                    event.toolCall.id
                  );
                }
              } else if (event.type === "final_message") {
                console.log(`[API] Sending final_message (length: ${event.message.length})`);
                // Store messages in Acontext session (messages are now stored only in Acontext)
                if (acontextSessionId) {
                  // User message was already stored above, only store assistant message (include toolCalls so they survive reload)
                  await storeMessageInAcontext(
                    acontextSessionId,
                    "assistant",
                    event.message,
                    "openai",
                    event.toolCalls ?? undefined
                  );
                }

                // Get current token counts for the session (for UI display)
                let tokenCounts: { total_tokens: number } | undefined;
                if (acontextSessionId) {
                  const counts = await getAcontextTokenCounts(acontextSessionId);
                  if (counts) {
                    tokenCounts = counts;
                  }
                }

                sendEvent("final_message", {
                  message: event.message,
                  sessionId: session.id,
                  characterId: session.characterId, // Return locked characterId
                  toolCalls: event.toolCalls,
                  acontextDiskId: acontextDiskId,
                  tokenCounts,
                });

                // Close stream
                console.log("[API] Closing SSE stream");
                controller.close();
                return;
              }
            }
            console.log("[API] Stream completed");
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            console.error("[API] Stream error:", errorMessage);
            sendEvent("error", {
              error: errorMessage,
            });
            controller.close();
          }
        },
      });

      // Return SSE response
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Non-streaming path (for non-Browser Use tasks or when streaming is disabled)
    const completionPromise = chatCompletion(
      client,
      messages,
      llmConfig,
      filteredTools,
      acontextDiskId,
      acontextSessionId,
      user.id,
      session.id,
      { characterId: body.characterId }
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT_MS);
    });

    let completion;
    try {
      completion = await Promise.race([completionPromise, timeoutPromise]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("timeout")) {
        return NextResponse.json(
          formatErrorResponse(
            new Error("Request timeout - please try again"),
            false
          ),
          { status: 408 }
        );
      }
      throw error;
    }

    // Log tool calls for debugging (without exposing sensitive data)
    if (completion.toolCalls && completion.toolCalls.length > 0) {
      console.log(
        `[Chatbot] Tool calls invoked: ${completion.toolCalls.map((tc) => tc.name).join(", ")}`
      );
    }

    // Store assistant response in Acontext (messages are now stored only in Acontext)
    // User message was already stored above, only store assistant message
    if (acontextSessionId) {
      await storeMessageInAcontext(
        acontextSessionId,
        "assistant",
        completion.message,
        "openai",
        completion.toolCalls ?? undefined
      );

      // Also persist tool results as OpenAI "tool" messages so they can be replayed after refresh
      if (completion.toolCalls && completion.toolCalls.length > 0) {
        for (const tc of completion.toolCalls) {
          const content =
            typeof tc.result === "string"
              ? tc.result
              : tc.result != null
              ? JSON.stringify(tc.result)
              : tc.error
              ? `ERROR: ${tc.error}`
              : "Done";
          await storeMessageInAcontext(
            acontextSessionId,
            "tool",
            content,
            "openai",
            undefined,
            tc.id
          );
        }
      }
    }

    // Get current token counts for the session (for UI display)
    let tokenCounts: { total_tokens: number } | undefined;
    if (acontextSessionId) {
      const counts = await getAcontextTokenCounts(acontextSessionId);
      if (counts) {
        tokenCounts = counts;
      }
    }

    // Return response
    const response: ChatResponse = {
      message: completion.message,
      sessionId: session.id,
      characterId: session.characterId, // Return locked characterId
      toolCalls: completion.toolCalls,
      acontextDiskId: acontextDiskId,
      tokenCounts,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Chatbot API error:", maskSensitiveInfo(String(error)));

    return NextResponse.json(
      formatErrorResponse(error, false),
      { status: 500 }
    );
  }
}

