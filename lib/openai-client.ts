/**
 * OpenAI client wrapper for LLM interactions
 */

import OpenAI from "openai";
import type { ChatMessage, LLMConfig, ToolInvocation } from "@/types/chat";
import {
  executeAcontextDiskTool,
  isAcontextDiskToolName,
} from "@/lib/acontext-disk-tools";
// Experience search tool has been removed
import {
  runTodo,
  isTodoToolName,
} from "@/lib/acontext-todo-tool";
import {
  runImageGenerate,
  isImageGenerateToolName,
} from "@/lib/acontext-image-generate-tool";

function safeToolResultToMessageContent(
  toolName: string,
  toolCallId: string,
  result: unknown,
  maxBytes: number = 9_500_000 // stay under common 10MB/provider limits
): string {
  // We must ensure tool message content doesn't exceed provider limits,
  // otherwise the *next* LLM call fails (e.g. 400 string too long).
  let json = "";
  try {
    json = JSON.stringify(result ?? {});
  } catch (e) {
    json = JSON.stringify({
      error: "Failed to stringify tool result",
      toolName,
      toolCallId,
      reason: e instanceof Error ? e.message : String(e),
    });
  }

  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes <= maxBytes) return json;

  // Build a small summary instead of sending the full payload.
  const summary = {
    truncated: true,
    toolName,
    toolCallId,
    originalBytes: bytes,
    maxBytes,
    note:
      "Tool result was too large to include in the conversation. Base64 blobs or large raw payloads were omitted. Refer to saved artifacts/disk outputs instead.",
    preview: json.slice(0, 2000),
  };
  return JSON.stringify(summary);
}


/**
 * Creates an OpenAI client instance
 */
export function createOpenAIClient(config: LLMConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.endpoint,
  });
}

/**
 * Converts ChatMessage array to OpenAI format
 * Supports Vision API format (content as array) for images
 */
function messagesToOpenAIFormat(
  messages: ChatMessage[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    if (msg.role === "system") {
      return {
        role: "system",
        content: typeof msg.content === "string" ? msg.content : String(msg.content),
      };
    }
    if (msg.role === "user") {
      // Support Vision API format: content can be string or array
      // Array format: [{ type: "text", text: "..." }, { type: "image_url", image_url: { url: "..." } }]
      if (Array.isArray(msg.content)) {
        return {
          role: "user",
          // OpenAI accepts array for Vision API; avoid `any` to satisfy lint.
          content:
            msg.content as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart[],
        };
      }
      return {
        role: "user",
        content: typeof msg.content === "string" ? msg.content : String(msg.content),
      };
    }
    // assistant role
    return {
      role: "assistant",
      content: typeof msg.content === "string" ? msg.content : String(msg.content),
    };
  });
}

/**
 * Executes a tool call
 * @param toolCall - The tool call to execute
 * @param diskId - Optional disk ID for Acontext disk tools
 * @param acontextSessionId - Optional Acontext session ID for session-related tools
 * @param userId - Optional user ID for experience search tool
 * @param sessionId - Optional session ID for todo tool
 */
async function executeToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  diskId?: string,
  acontextSessionId?: string,
  userId?: string,
  sessionId?: string,
  toolContext?: { characterId?: string }
): Promise<unknown> {
  if (toolCall.type !== "function" || !toolCall.function) {
    throw new Error(`Unsupported tool call type: ${toolCall.type}`);
  }

  const { name, arguments: argsJson } = toolCall.function;

  // Experience search tool has been removed; browser_use_task has been removed

  if (isTodoToolName(name)) {
    if (!sessionId) {
      throw new Error("Session ID is required for todo tool");
    }
    const args = JSON.parse(argsJson || "{}");
    console.log("[openai-client] executeToolCall: calling runTodo with action:", args.action);
    const result = await runTodo(args, sessionId);
    console.log("[openai-client] executeToolCall: runTodo returned:", JSON.stringify(result, null, 2).substring(0, 500));
    return result;
  }

  if (isAcontextDiskToolName(name)) {
    const args = JSON.parse(argsJson || "{}");
    return executeAcontextDiskTool(name, args, diskId);
  }

  if (isImageGenerateToolName(name)) {
    const args = JSON.parse(argsJson || "{}");
    return runImageGenerate(args, diskId, toolContext);
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Performs chat completion with optional function calling support
 * Implements a loop mechanism that continues processing tool calls until a final response is received
 * @param diskId - Optional disk ID for Acontext disk tools
 * @param acontextSessionId - Optional Acontext session ID for session-related tools
 * @param userId - Optional user ID for experience search tool
 * @param sessionId - Optional session ID for todo tool
 * @param maxIterations - Maximum number of tool call iterations to prevent infinite loops (default: 10)
 */
export async function chatCompletion(
  client: OpenAI,
  messages: ChatMessage[],
  config: LLMConfig,
  tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [],
  diskId?: string,
  acontextSessionId?: string,
  userId?: string,
  sessionId?: string,
  toolContext?: { characterId?: string },
  maxIterations: number = 10
): Promise<{
  message: string;
  toolCalls?: ToolInvocation[];
}> {
  const openAIMessages = messagesToOpenAIFormat(messages);
  const allToolCalls: ToolInvocation[] = [];
  let currentMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = openAIMessages;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[chatCompletion] Iteration ${iteration}/${maxIterations}`);

    const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: config.model || "gpt-4.1",
      messages: currentMessages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 1000,
    };

    // Add tools if enabled
    if (tools.length > 0) {
      completionParams.tools = tools;
      completionParams.tool_choice = "auto";
    }

    const completion = await client.chat.completions.create(completionParams);
    const assistantMessage = completion.choices[0]?.message;

    if (!assistantMessage) {
      throw new Error("No response from OpenAI");
    }

    // If there are no tool calls, return the final message
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      console.log(`[chatCompletion] Final response received after ${iteration} iteration(s)`);
      return {
        message: assistantMessage.content || "",
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      };
    }

    // Handle tool calls - execute them and continue the loop
    console.log(`[chatCompletion] Processing ${assistantMessage.tool_calls.length} tool call(s)`);
    const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

    // Execute all tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const isFunctionCall = toolCall.type === "function" && !!toolCall.function;
      const fnName = isFunctionCall ? toolCall.function.name : "unknown";
      const fnArgs = isFunctionCall
        ? JSON.parse(toolCall.function.arguments || "{}")
        : {};

      try {
        if (!isFunctionCall) {
          allToolCalls.push({
            id: toolCall.id,
            name: fnName,
            arguments: fnArgs,
            error: `Unsupported tool call type: ${toolCall.type}`,
            invokedAt: new Date(),
          });
          // Add to toolResults so we generate a tool message (required by OpenAI)
          toolResults.push({
            id: toolCall.id,
            type: "function",
            function: {
              name: fnName,
              arguments: JSON.stringify(fnArgs),
            },
          });
          continue;
        }

        const { name, arguments: argsJson } = toolCall.function;

        const result = await executeToolCall(
          toolCall,
          diskId,
          acontextSessionId,
          userId,
          sessionId,
          toolContext
        );
        allToolCalls.push({
          id: toolCall.id,
          name,
          arguments: JSON.parse(argsJson || "{}"),
          result,
          invokedAt: new Date(),
        });

        toolResults.push({
          id: toolCall.id,
          type: "function",
          function: {
            name,
            arguments: argsJson,
          },
        });
      } catch (error) {
        allToolCalls.push({
          id: toolCall.id,
          name: fnName,
          arguments: fnArgs,
          error: error instanceof Error ? error.message : String(error),
          invokedAt: new Date(),
        });
        // Add to toolResults so we generate a tool message (required by OpenAI)
        toolResults.push({
          id: toolCall.id,
          type: "function",
          function: {
            name: fnName,
            arguments: isFunctionCall ? toolCall.function.arguments : JSON.stringify(fnArgs),
          },
        });
      }
    }

    // Add assistant message and tool results to conversation for next iteration
    currentMessages = [
      ...currentMessages,
      assistantMessage,
      ...toolResults.map((toolCall) => {
        const toolCallInvocation = allToolCalls.find((tc) => tc.id === toolCall.id);
        // If tool call failed, use error as content; otherwise use result
        const toolCallResult = toolCallInvocation?.error
          ? { error: toolCallInvocation.error }
          : toolCallInvocation?.result ?? {};
        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: safeToolResultToMessageContent(
            toolCall.type === "function" && toolCall.function
              ? toolCall.function.name
              : "unknown",
            toolCall.id,
            toolCallResult
          ),
        };
      }),
    ];

    // Continue loop to process next response
    console.log(`[chatCompletion] Tool calls executed, continuing loop...`);
  }

  // If we've reached max iterations, return the last assistant message if available
  console.warn(`[chatCompletion] Reached maximum iterations (${maxIterations}), returning accumulated tool calls`);
  return {
    message: "Maximum tool call iterations reached. Please try again with a more specific request.",
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  };
}

/**
 * Performs chat completion with streaming support for Browser Use tasks
 * Implements a loop mechanism that continues processing tool calls until a final response is received
 * Returns an async generator that yields stream events
 * @param diskId - Optional disk ID for Acontext disk tools
 * @param acontextSessionId - Optional Acontext session ID for session-related tools
 * @param userId - Optional user ID for experience search tool
 * @param sessionId - Optional session ID for todo tool
 * @param maxIterations - Maximum number of tool call iterations to prevent infinite loops (default: 10)
 */
export async function* chatCompletionStream(
  client: OpenAI,
  messages: ChatMessage[],
  config: LLMConfig,
  tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [],
  diskId?: string,
  acontextSessionId?: string,
  userId?: string,
  sessionId?: string,
  toolContext?: { characterId?: string },
  maxIterations: number = 10
): AsyncGenerator<
  | { type: "message"; content: string }
  | { type: "tool_call_start"; toolCall: ToolInvocation }
  | { type: "tool_call_step"; toolCallId: string; step: unknown }
  | { type: "tool_call_complete"; toolCall: ToolInvocation }
  | { type: "tool_call_error"; toolCall: ToolInvocation }
  | { type: "final_message"; message: string; toolCalls?: ToolInvocation[] },
  void,
  unknown
> {
  const openAIMessages = messagesToOpenAIFormat(messages);
  const allToolCalls: ToolInvocation[] = [];
  let currentMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = openAIMessages;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[chatCompletionStream] Iteration ${iteration}/${maxIterations}`);

    const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: config.model || "gpt-4.1",
      messages: currentMessages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 1000,
      stream: true, // Enable streaming for all responses
    };

    // Add tools if enabled
    if (tools.length > 0) {
      completionParams.tools = tools;
      completionParams.tool_choice = "auto";
    }

    const stream = await client.chat.completions.create(completionParams);

    console.log("[Stream] Starting stream processing...");

    let assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessage = {
      role: "assistant",
      content: "",
      refusal: null,
    };
    let accumulatedContent = "";
    let toolCallsAccumulator: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }> = [];
    let chunkCount = 0;

    // Process streaming response
    for await (const chunk of stream) {
      chunkCount++;
      const delta = chunk.choices[0]?.delta;
      
      if (!delta) {
        console.log(`[Stream] Chunk ${chunkCount}: No delta content`);
        continue;
      }

      // Accumulate content
      if (delta.content) {
        accumulatedContent += delta.content;
        console.log(`[Stream] Chunk ${chunkCount} - Content: "${delta.content}" (Total length: ${accumulatedContent.length})`);
        // Yield message chunks for streaming display
        yield { type: "message", content: delta.content };
        console.log(`[Stream] Chunk ${chunkCount} - Yielded message chunk`);
      }

      // Accumulate tool calls
      if (delta.tool_calls) {
        console.log(`[Stream] Chunk ${chunkCount} - Tool calls detected:`, JSON.stringify(delta.tool_calls, null, 2));
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index ?? 0;
          if (!toolCallsAccumulator[index]) {
            toolCallsAccumulator[index] = {
              id: toolCallDelta.id || "",
              type: "function",
              function: {
                name: toolCallDelta.function?.name || "",
                arguments: toolCallDelta.function?.arguments || "",
              },
            };
            console.log(`[Stream] Chunk ${chunkCount} - New tool call [${index}]: ${toolCallDelta.function?.name || "unknown"}`);
          } else {
            // Append to existing tool call
            const newArgs = toolCallDelta.function?.arguments || "";
            toolCallsAccumulator[index].function.arguments += newArgs;
            console.log(`[Stream] Chunk ${chunkCount} - Appending to tool call [${index}]: "${newArgs}"`);
          }
        }
      }
    }

    console.log(`[Stream] Stream completed. Total chunks: ${chunkCount}, Final content length: ${accumulatedContent.length}`);

    // Build final assistant message
    assistantMessage.content = accumulatedContent;
    if (toolCallsAccumulator.length > 0) {
      console.log(`[Stream] Building final message with ${toolCallsAccumulator.length} tool call(s)`);
      assistantMessage.tool_calls = toolCallsAccumulator
        .filter((tc) => tc.id && tc.function.name)
        .map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      console.log(`[Stream] Final tool calls:`, assistantMessage.tool_calls.map(tc => {
        if (tc.type === "function" && "function" in tc) {
          return { id: tc.id, name: tc.function.name };
        }
        return { id: tc.id, name: "unknown" };
      }));
    } else {
      console.log(`[Stream] Final message content: "${accumulatedContent.substring(0, 100)}${accumulatedContent.length > 100 ? '...' : ''}"`);
    }

    if (!assistantMessage.content && !assistantMessage.tool_calls?.length) {
      throw new Error("No response from OpenAI");
    }

    // If there are no tool calls, return the final message
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      console.log(`[chatCompletionStream] Final response received after ${iteration} iteration(s)`);
      yield {
        type: "final_message",
        message: assistantMessage.content || "",
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      };
      return;
    }

    // Handle tool calls - execute them and continue the loop
    console.log(`[chatCompletionStream] Processing ${assistantMessage.tool_calls.length} tool call(s)`);
    const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

    // Execute all tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const isFunctionCall = toolCall.type === "function" && !!toolCall.function;
      const fnName = isFunctionCall ? toolCall.function.name : "unknown";
      const fnArgs = isFunctionCall
        ? JSON.parse(toolCall.function.arguments || "{}")
        : {};

      try {
        if (!isFunctionCall) {
          const errorToolCall: ToolInvocation = {
            id: toolCall.id,
            name: fnName,
            arguments: fnArgs,
            error: `Unsupported tool call type: ${toolCall.type}`,
            invokedAt: new Date(),
          };
          allToolCalls.push(errorToolCall);
          yield { type: "tool_call_error", toolCall: errorToolCall };
          // Add to toolResults so we generate a tool message (required by OpenAI)
          toolResults.push({
            id: toolCall.id,
            type: "function",
            function: {
              name: fnName,
              arguments: JSON.stringify(fnArgs),
            },
          });
          continue;
        }

        const { name, arguments: argsJson } = toolCall.function;

        // Tool call (browser_use_task streaming removed)
        const toolCallInvocation: ToolInvocation = {
            id: toolCall.id,
            name,
            arguments: JSON.parse(argsJson || "{}"),
            invokedAt: new Date(),
          };

          yield { type: "tool_call_start", toolCall: toolCallInvocation };

          const result = await executeToolCall(
            toolCall,
            diskId,
            acontextSessionId,
            userId,
            sessionId,
            toolContext
          );
          toolCallInvocation.result = result;
          allToolCalls.push(toolCallInvocation);

          yield { type: "tool_call_complete", toolCall: toolCallInvocation };

          toolResults.push({
            id: toolCall.id,
            type: "function",
            function: {
              name,
              arguments: argsJson,
            },
          });
      } catch (error) {
        const errorToolCall: ToolInvocation = {
          id: toolCall.id,
          name: fnName,
          arguments: fnArgs,
          error: error instanceof Error ? error.message : String(error),
          invokedAt: new Date(),
        };
        allToolCalls.push(errorToolCall);
        yield { type: "tool_call_error", toolCall: errorToolCall };
        // Add to toolResults so we generate a tool message (required by OpenAI)
        // Only add if not already added (e.g. browser_use_task inner catch already added it)
        if (!toolResults.some((tr) => tr.id === toolCall.id)) {
          toolResults.push({
            id: toolCall.id,
            type: "function",
            function: {
              name: fnName,
              arguments: isFunctionCall ? toolCall.function.arguments : JSON.stringify(fnArgs),
            },
          });
        }
      }
    }

    // Add assistant message and tool results to conversation for next iteration
    currentMessages = [
      ...currentMessages,
      assistantMessage,
      ...toolResults.map((toolCall) => {
        const toolCallInvocation = allToolCalls.find((tc) => tc.id === toolCall.id);
        // If tool call failed, use error as content; otherwise use result
        const toolCallResult = toolCallInvocation?.error
          ? { error: toolCallInvocation.error }
          : toolCallInvocation?.result ?? {};
        console.log(`[openai-client] chatCompletionStream: sending tool result for ${toolCall.id}:`, JSON.stringify(toolCallResult, null, 2).substring(0, 500));
        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: safeToolResultToMessageContent(
            toolCall.type === "function" && toolCall.function
              ? toolCall.function.name
              : "unknown",
            toolCall.id,
            toolCallResult
          ),
        };
      }),
    ];

    // Continue loop to process next response
    console.log(`[chatCompletionStream] Tool calls executed, continuing loop...`);
  }

  // If we've reached max iterations, return accumulated tool calls
  console.warn(`[chatCompletionStream] Reached maximum iterations (${maxIterations})`);
  yield {
    type: "final_message",
    message: "Maximum tool call iterations reached. Please try again with a more specific request.",
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  };
}

