/**
 * Browser Use Stream API route handler
 * Provides Server-Sent Events (SSE) for streaming Browser Use task updates
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BrowserUseClient } from "browser-use-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/browser-use/stream - Stream Browser Use task updates
 */
export async function POST(request: NextRequest) {
  // Authentication check
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Parse request body
  let body: { task: string };
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Validate task
  if (!body.task || typeof body.task !== "string") {
    return new Response(
      JSON.stringify({ error: "Task is required and must be a string" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "BROWSER_USE_API_KEY is not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper function to send SSE data
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const client = new BrowserUseClient({ apiKey });
        const trimmedTask = body.task.trim();
        const TIMEOUT_MS = 60000; // 1 minute timeout

        // Send initial event
        sendEvent("start", { task: trimmedTask });

        // Create task
        const task = await client.tasks.createTask({ task: trimmedTask });
        const taskId = (task as { id?: string }).id;

        sendEvent("task_created", { taskId });

        // Stream task updates using task.stream()
        for await (const step of task.stream()) {
          sendEvent("step", {
            taskId,
            step,
          });
        }

        // Wait for task completion with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Task timeout after ${TIMEOUT_MS}ms`));
          }, TIMEOUT_MS);
        });

        const result = await Promise.race([
          task.complete(),
          timeoutPromise,
        ]);

        // Send final result
        sendEvent("complete", {
          taskId,
          output: (result as { output?: unknown }).output ?? result,
          raw: result,
        });

        // Close stream
        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
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
      "X-Accel-Buffering": "no", // Disable buffering for nginx
    },
  });
}

