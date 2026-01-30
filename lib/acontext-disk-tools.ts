import OpenAI from "openai";
import { DISK_TOOLS } from "@acontext/acontext";
import { getAcontextClient } from "@/lib/acontext-client";

type DiskToolContext = ReturnType<typeof DISK_TOOLS.formatContext> | null;

/**
 * Acontext SDK disk tool names (from @acontext/acontext DISK_TOOLS).
 * Includes grep_disk and glob_disk for content search and path pattern matching.
 */
const DISK_TOOL_NAMES = [
  "write_file_disk",
  "read_file_disk",
  "replace_string_disk",
  "list_disk",
  "download_file_disk",
  "grep_disk",
  "glob_disk",
] as const;

/**
 * Guard to check whether a tool name belongs to the Acontext filesystem suite.
 */
export function isAcontextDiskToolName(name: string): boolean {
  return DISK_TOOL_NAMES.includes(name as (typeof DISK_TOOL_NAMES)[number]);
}

/**
 * Return OpenAI-compatible tool schemas for the filesystem helpers.
 * If Acontext is not configured, returns an empty array so the caller can skip.
 */
export function getAcontextDiskToolSchemas(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const client = getAcontextClient();
  if (!client) return [];

  try {
    return DISK_TOOLS.toOpenAIToolSchema() as unknown as OpenAI.Chat.Completions.ChatCompletionTool[];
  } catch (error) {
    console.warn(
      "[Acontext] Failed to build disk tool schema:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

/**
 * Ensure we have a disk to operate on and return the formatted tool context.
 * If diskId is provided, uses that disk. Otherwise, uses the first existing disk or creates one when none exist.
 */
async function getDiskToolContext(diskId?: string): Promise<DiskToolContext> {
  const client = getAcontextClient();
  if (!client) return null;

  try {
    let targetDiskId: string | undefined = diskId;

    // If no diskId provided, fall back to first disk or create one
    if (!targetDiskId) {
      const disks = await client.disks.list();
      if (disks?.items?.length) {
        targetDiskId = disks.items[0].id;
        console.warn(
          "[Acontext] No diskId provided, using first available disk:",
          targetDiskId
        );
      } else {
        const disk = await client.disks.create();
        targetDiskId = disk.id;
        console.warn(
          "[Acontext] No diskId provided and no disks exist, created new disk:",
          targetDiskId
        );
      }
    }

    if (!targetDiskId) {
      console.warn("[Acontext] No disk ID available for filesystem tools");
      return null;
    }

    return DISK_TOOLS.formatContext(client, targetDiskId);
  } catch (error) {
    console.error(
      "[Acontext] Failed to prepare disk tool context:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Execute one of the filesystem tools by name with the provided arguments.
 * Throws if the tool is unknown or Acontext is not configured.
 * @param name - Tool name (e.g., "write_file_disk", "read_file_disk", "grep_disk", "glob_disk")
 * @param args - Tool arguments
 * @param diskId - Optional disk ID. If not provided, will use first available disk or create one.
 */
export async function executeAcontextDiskTool(
  name: string,
  args: Record<string, unknown>,
  diskId?: string
): Promise<unknown> {
  if (!isAcontextDiskToolName(name)) {
    throw new Error(`Unknown Acontext disk tool: ${name}`);
  }

  const ctx = await getDiskToolContext(diskId);
  if (!ctx) {
    throw new Error("Acontext filesystem tools are not configured");
  }

  try {
    // Log tool execution for debugging
    console.debug(`[Acontext] Executing disk tool: ${name}`, {
      args,
      diskId: ctx.diskId,
    });

    const result = await DISK_TOOLS.executeTool(ctx, name, args);
    
    console.debug(`[Acontext] Disk tool executed successfully: ${name}`);
    return result;
  } catch (error) {
    // Enhanced error handling for better diagnostics
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails: Record<string, unknown> = {
      tool: name,
      args,
      diskId: ctx.diskId,
      errorMessage,
    };

    // For download_file_disk errors, handle file not found gracefully
    if (name === "download_file_disk") {
      const filename = args.filename as string | undefined;
      const filePath = (args.file_path as string | undefined) || "/";
      
      errorDetails.filename = filename;
      errorDetails.filePath = filePath;

      // Try to list artifacts to check if file exists
      try {
        const client = getAcontextClient();
        if (client && ctx.diskId) {
          const artifacts = await client.disks.artifacts.list(ctx.diskId, {
            path: filePath,
          });
          const availableFiles = artifacts?.artifacts?.map(
            (a: any) => a.filename || a.path
          ) || [];
          errorDetails.availableFiles = availableFiles;
          
          // If file doesn't exist, return a friendly message instead of throwing
          if (filename && !availableFiles.includes(filename)) {
            const friendlyMessage = `File "${filename}" not found in path "${filePath}". ${availableFiles.length > 0 ? `Available files: ${availableFiles.join(", ")}` : "No files available in this path."}`;
            
            console.warn(`[Acontext] File not found, returning friendly message: ${friendlyMessage}`);
            
            // Return a friendly result instead of throwing an error
            return friendlyMessage;
          }
        }
      } catch (listError) {
        // Ignore errors from listing, just log them
        console.debug("[Acontext] Failed to list artifacts for error diagnosis:", listError);
      }

      // If it's a database error and we couldn't verify file existence,
      // assume it's a file not found error and return friendly message
      if (errorMessage.toLowerCase().includes("database error")) {
        const friendlyMessage = `File "${filename || "unknown"}" not found in path "${filePath}". The file may not exist. Try using list_disk to see available files.`;
        
        console.warn(`[Acontext] Database error for download_file_disk, returning friendly message: ${friendlyMessage}`);
        
        // Return a friendly result instead of throwing an error
        return friendlyMessage;
      }
    }

    console.error(`[Acontext] Disk tool execution failed: ${name}`, errorDetails);

    // For other errors, still throw
    throw error;
  }
}

