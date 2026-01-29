/**
 * React hook for streaming Browser Use task updates via Server-Sent Events
 */

import { useState, useEffect, useRef, useCallback } from "react";

export type BrowserUseStreamEvent =
  | { type: "start"; task: string }
  | { type: "task_created"; taskId?: string }
  | { type: "step"; taskId?: string; step: unknown }
  | { type: "complete"; taskId?: string; output: unknown; raw: unknown }
  | { type: "error"; error: string };

export interface UseBrowserUseStreamOptions {
  onEvent?: (event: BrowserUseStreamEvent) => void;
  onComplete?: (result: { taskId?: string; output: unknown; raw: unknown }) => void;
  onError?: (error: string) => void;
}

export interface UseBrowserUseStreamReturn {
  isStreaming: boolean;
  currentStep: unknown | null;
  taskId: string | null;
  error: string | null;
  startStream: (task: string) => void;
  stopStream: () => void;
}

/**
 * Hook for streaming Browser Use task updates
 */
export function useBrowserUseStream(
  options: UseBrowserUseStreamOptions = {}
): UseBrowserUseStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStep, setCurrentStep] = useState<unknown | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { onEvent, onComplete, onError } = options;

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setCurrentStep(null);
    setError(null);
  }, []);

  const startStream = useCallback(
    (task: string) => {
      // Stop any existing stream
      stopStream();

      setIsStreaming(true);
      setError(null);
      setCurrentStep(null);
      setTaskId(null);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Use fetch with ReadableStream for SSE
      fetch("/api/browser-use/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task }),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Failed to start stream");
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              setIsStreaming(false);
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            let eventType = "message";
            let data = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data = line.slice(5).trim();
              } else if (line === "") {
                // Empty line indicates end of event
                if (data) {
                  try {
                    const parsed = JSON.parse(data);
                    const event: BrowserUseStreamEvent = {
                      type: eventType as BrowserUseStreamEvent["type"],
                      ...parsed,
                    };

                    // Update state based on event type
                    if (event.type === "task_created") {
                      setTaskId(event.taskId || null);
                    } else if (event.type === "step") {
                      setCurrentStep(event.step);
                      setTaskId(event.taskId || null);
                    } else if (event.type === "complete") {
                      setIsStreaming(false);
                      setTaskId(event.taskId || null);
                      onComplete?.({
                        taskId: event.taskId,
                        output: event.output,
                        raw: event.raw,
                      });
                    } else if (event.type === "error") {
                      setIsStreaming(false);
                      setError(event.error);
                      onError?.(event.error);
                    }

                    onEvent?.(event);
                  } catch (e) {
                    console.error("Failed to parse SSE data:", e);
                  }
                }
                eventType = "message";
                data = "";
              }
            }
          }
        })
        .catch((err) => {
          if (err.name === "AbortError") {
            // Stream was intentionally stopped
            return;
          }
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          setIsStreaming(false);
          onError?.(errorMessage);
        });
    },
    [stopStream, onEvent, onComplete, onError]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return {
    isStreaming,
    currentStep,
    taskId,
    error,
    startStream,
    stopStream,
  };
}

