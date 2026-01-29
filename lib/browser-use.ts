import { BrowserUseClient } from "browser-use-sdk";

export type BrowserUseToolArgs = {
  /**
   * Natural language task description for Browser Use Cloud.
   * Example: "Search for the top 10 Hacker News posts and return the title and url."
   */
  task: string;
  /**
   * Optional URL to open before starting the task.
   * Maps to Browser Use Cloud Task `startUrl`.
   */
  startUrl?: string;
  /**
   * Optional maximum number of browser actions (steps) before stopping.
   * Maps to Browser Use Cloud Task `maxSteps`.
   */
  maxSteps?: number;
  /**
   * Optional domain allow‑list. When provided, the browser will be restricted
   * to these domains. Maps to Browser Use Cloud Task `allowedDomains`.
   */
  allowedDomains?: string[];
  /**
   * Optional JSON schema string that asks Browser Use Cloud to return
   * structured output instead of free‑form text.
   * Maps to Browser Use Cloud Task `structuredOutput`.
   */
  structuredOutput?: string;
};

/**
 * Extracts the 'done' action from browser-use step actions if present.
 * The 'done' action contains the final result that should be returned as the tool call result.
 */
function extractDoneAction(step: unknown): { done?: { text?: string; success?: boolean; files_to_display?: string[] } } | null {
  console.log("[browser-use] extractDoneAction: checking step", JSON.stringify(step, null, 2).substring(0, 500));
  
  if (!step || typeof step !== "object") {
    console.log("[browser-use] extractDoneAction: step is not an object");
    return null;
  }

  const stepObj = step as { actions?: unknown[]; number?: number };
  if (!Array.isArray(stepObj.actions)) {
    console.log("[browser-use] extractDoneAction: step.actions is not an array", stepObj.actions);
    return null;
  }

  console.log(`[browser-use] extractDoneAction: step ${stepObj.number}, actions count: ${stepObj.actions.length}`);

  // Look for done action in the actions array
  for (let i = 0; i < stepObj.actions.length; i++) {
    const action = stepObj.actions[i];
    let parsedAction: unknown = action;

    console.log(`[browser-use] extractDoneAction: processing action ${i}, type: ${typeof action}`);

    if (typeof action === "string") {
      console.log(`[browser-use] extractDoneAction: action string (first 200 chars): ${action.substring(0, 200)}`);
      // First, try to parse as JSON directly
      try {
        parsedAction = JSON.parse(action);
        console.log("[browser-use] extractDoneAction: JSON.parse succeeded");
      } catch (parseError) {
        console.log("[browser-use] extractDoneAction: JSON.parse failed, trying regex extraction", parseError);
        // If direct JSON.parse fails (e.g. because of strange escaping),
        // try to extract the "done": {...} fragment using regex and parse it
        const doneMatch = action.match(/"done"\s*:\s*(\{[\s\S]*\})/);
        if (doneMatch) {
          console.log("[browser-use] extractDoneAction: found done match via regex");
          const doneJson = `{"done": ${doneMatch[1]}}`;
          try {
            parsedAction = JSON.parse(doneJson);
            console.log("[browser-use] extractDoneAction: regex extraction and parse succeeded");
          } catch (regexError) {
            console.log("[browser-use] extractDoneAction: regex extraction parse failed", regexError);
            // still invalid -> skip
            continue;
          }
        } else {
          console.log("[browser-use] extractDoneAction: no done match found in regex");
          continue;
        }
      }
    }

    // Check if this is a done action
    if (parsedAction && typeof parsedAction === "object" && "done" in parsedAction) {
      const doneResult = parsedAction as { done?: { text?: string; success?: boolean; files_to_display?: string[] } };
      console.log(`[browser-use] extractDoneAction: FOUND done action! text: ${doneResult.done?.text?.substring(0, 100)}, success: ${doneResult.done?.success}`);
      return doneResult;
    } else {
      console.log("[browser-use] extractDoneAction: parsed action does not contain 'done' field");
    }
  }

  console.log("[browser-use] extractDoneAction: no done action found in step");
  return null;
}

/**
 * Tool schema for the Browser Use Cloud task runner.
 */
export const getBrowserUseToolSchema = {
  type: "function" as const,
  function: {
    name: "browser_use_task",
    description:
      "Spin up a browser in the cloud to search/operate on real websites when real-time information or multi-step web actions are needed.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "Plain language description of the web task to perform. Keep it concise and specific.",
        },
        startUrl: {
          type: "string",
          description:
            "Optional URL to open before starting the task. Use this when the task is clearly tied to a specific site.",
        },
        maxSteps: {
          type: "integer",
          description:
            "Optional maximum number of browser actions (steps) the agent may take. Use to prevent overly long or wandering sessions.",
          minimum: 1,
        },
        allowedDomains: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Optional allow-list of domains the browser may visit. Use this to keep the task focused and safe.",
        },
        structuredOutput: {
          type: "string",
          description:
            "Optional JSON Schema string that describes the desired structured output format. Use this for table-like or strongly typed results.",
        },
      },
      required: ["task"],
    },
  },
};

/**
 * Execute a Browser Use Cloud task and return the structured result.
 */
export async function runBrowserUseTask(
  args: BrowserUseToolArgs
): Promise<unknown> {
  const apiKey = process.env.BROWSER_USE_API_KEY;

  if (!apiKey) {
    throw new Error("BROWSER_USE_API_KEY is not configured");
  }

  if (!args?.task || typeof args.task !== "string") {
    throw new Error("Task must be a non-empty string");
  }

  const trimmedTask = args.task.trim();
  if (!trimmedTask) {
    throw new Error("Task must be a non-empty string");
  }

  const taskPayload: {
    task: string;
    startUrl?: string;
    maxSteps?: number;
    allowedDomains?: string[];
    structuredOutput?: string;
  } = {
    task: trimmedTask,
  };

  if (args.startUrl && typeof args.startUrl === "string" && args.startUrl.trim()) {
    taskPayload.startUrl = args.startUrl.trim();
  }

  if (typeof args.maxSteps === "number" && Number.isFinite(args.maxSteps) && args.maxSteps > 0) {
    taskPayload.maxSteps = Math.floor(args.maxSteps);
  }

  if (Array.isArray(args.allowedDomains) && args.allowedDomains.length > 0) {
    taskPayload.allowedDomains = args.allowedDomains.filter(
      (d) => typeof d === "string" && d.trim().length > 0
    );
  }

  if (args.structuredOutput && typeof args.structuredOutput === "string") {
    const trimmedSchema = args.structuredOutput.trim();
    if (trimmedSchema.length > 0) {
      taskPayload.structuredOutput = trimmedSchema;
    }
  }

  const client = new BrowserUseClient({ apiKey });

  // The SDK returns a task object with a complete() method.
  const task = await client.tasks.createTask(taskPayload);
  
  // Collect steps to find done action
  let doneAction: { done?: { text?: string; success?: boolean; files_to_display?: string[] } } | null = null;
  let stepCount = 0;
  for await (const step of task.stream()) {
    stepCount++;
    console.log(`[browser-use] runBrowserUseTask: processing step ${stepCount}`);
    const done = extractDoneAction(step);
    if (done) {
      console.log(`[browser-use] runBrowserUseTask: found done action in step ${stepCount}`);
      doneAction = done;
    }
  }
  
  console.log(`[browser-use] runBrowserUseTask: stream finished, stepCount: ${stepCount}, doneAction:`, doneAction ? "found" : "null");
  
  const result = await task.complete();
  console.log(`[browser-use] runBrowserUseTask: task.complete() returned`, JSON.stringify(result, null, 2).substring(0, 500));

  // If we found a done action, use it as the output; otherwise use the result
  const output = doneAction?.done
    ? {
        text: doneAction.done.text,
        success: doneAction.done.success,
        files_to_display: doneAction.done.files_to_display,
      }
    : (result as { output?: unknown }).output ?? result;

  console.log(`[browser-use] runBrowserUseTask: final output:`, JSON.stringify(output, null, 2).substring(0, 500));

  // Return a concise payload (tool call content will be stringified later).
  return {
    taskId: (task as { id?: string }).id,
    output,
    raw: result,
  };
}

/**
 * Stream Browser Use Cloud task updates.
 * Returns an async generator that yields task steps.
 */
export async function* streamBrowserUseTask(
  args: BrowserUseToolArgs
): AsyncGenerator<unknown, unknown, unknown> {
  const apiKey = process.env.BROWSER_USE_API_KEY;

  if (!apiKey) {
    throw new Error("BROWSER_USE_API_KEY is not configured");
  }

  if (!args?.task || typeof args.task !== "string") {
    throw new Error("Task must be a non-empty string");
  }

  const trimmedTask = args.task.trim();
  if (!trimmedTask) {
    throw new Error("Task must be a non-empty string");
  }

  const taskPayload: {
    task: string;
    startUrl?: string;
    maxSteps?: number;
    allowedDomains?: string[];
    structuredOutput?: string;
  } = {
    task: trimmedTask,
  };

  if (args.startUrl && typeof args.startUrl === "string" && args.startUrl.trim()) {
    taskPayload.startUrl = args.startUrl.trim();
  }

  if (typeof args.maxSteps === "number" && Number.isFinite(args.maxSteps) && args.maxSteps > 0) {
    taskPayload.maxSteps = Math.floor(args.maxSteps);
  }

  if (Array.isArray(args.allowedDomains) && args.allowedDomains.length > 0) {
    taskPayload.allowedDomains = args.allowedDomains.filter(
      (d) => typeof d === "string" && d.trim().length > 0
    );
  }

  if (args.structuredOutput && typeof args.structuredOutput === "string") {
    const trimmedSchema = args.structuredOutput.trim();
    if (trimmedSchema.length > 0) {
      taskPayload.structuredOutput = trimmedSchema;
    }
  }

  const client = new BrowserUseClient({ apiKey });
  const task = await client.tasks.createTask(taskPayload);

  let doneAction: { done?: { text?: string; success?: boolean; files_to_display?: string[] } } | null = null;
  let stepCount = 0;

  // Stream task steps
  for await (const step of task.stream()) {
    stepCount++;
    console.log(`[browser-use] streamBrowserUseTask: processing step ${stepCount}`);
    // Check if this step contains a done action
    const done = extractDoneAction(step);
    if (done) {
      console.log(`[browser-use] streamBrowserUseTask: found done action in step ${stepCount}`);
      doneAction = done;
    }

    yield {
      type: "step",
      taskId: (task as { id?: string }).id,
      step,
    };
  }

  console.log(`[browser-use] streamBrowserUseTask: stream finished, stepCount: ${stepCount}, doneAction:`, doneAction ? "found" : "null");

  // Wait for completion and yield final result
  const result = await task.complete();
  console.log(`[browser-use] streamBrowserUseTask: task.complete() returned`, JSON.stringify(result, null, 2).substring(0, 500));
  
  // If we found a done action, use it as the output; otherwise use the result
  const output = doneAction?.done 
    ? {
        text: doneAction.done.text,
        success: doneAction.done.success,
        files_to_display: doneAction.done.files_to_display,
      }
    : (result as { output?: unknown }).output ?? result;

  console.log(`[browser-use] streamBrowserUseTask: final output:`, JSON.stringify(output, null, 2).substring(0, 500));

  // Yield complete event to ensure the caller receives it and doesn't trigger a second task
  yield {
    type: "complete",
    taskId: (task as { id?: string }).id,
    output,
    raw: result,
  };
  return;
}


