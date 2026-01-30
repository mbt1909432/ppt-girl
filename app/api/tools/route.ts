import { NextResponse } from "next/server";
import { getAcontextDiskToolSchemas } from "@/lib/acontext-disk-tools";
// Experience search tool has been removed
import { getTodoToolSchema } from "@/lib/acontext-todo-tool";
import { getImageGenerateToolSchema } from "@/lib/acontext-image-generate-tool";

type ToolParameter = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
};

type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameter[];
};

export async function GET() {
  // Default to enabled; opt-out only when explicitly set to "false"
  const toolsEnabled = process.env.CHATBOT_ENABLE_TOOLS !== "false";
  const tools: ToolDefinition[] = [];

  if (toolsEnabled) {
    const schemas = [
      getTodoToolSchema,
      getImageGenerateToolSchema,
      ...getAcontextDiskToolSchemas(),
    ];

    schemas.forEach((schema) => {
      if (!schema || !("function" in schema) || !schema.function) return;

      const fn = schema.function;
      const requiredList = (fn.parameters as any)?.required ?? [];
      const properties = (fn.parameters as any)?.properties ?? {};

      const parameters: ToolParameter[] = Object.entries(properties).map(
        ([name, value]) => {
          const v = value as { type?: string; description?: string };
          return {
            name,
            type: v.type ?? "unknown",
            description: v.description,
            required: requiredList.includes(name),
          };
        }
      );

      tools.push({
        name: fn.name,
        description: fn.description ?? "",
        parameters,
      });
    });
  }

  return NextResponse.json({ tools });
}


