"use client";

/**
 * ChatbotPanel component - Provides chatbot UI in protected pages
 */

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { createPortal, flushSync } from "react-dom";
import { StreamdownMessage } from "@/components/markdown/streamdown-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, X, Send, Loader2, Plus, ChevronDown, Wrench, Trash2, Paperclip, File, FolderOpen, AlertTriangle, FileText, ExternalLink, Download, Heart, ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen, LayoutList, Images, Pencil } from "lucide-react";
import type { ChatMessage, ChatResponse, ToolInvocation, ChatSession } from "@/types/chat";
import { useCharacter, type CharacterId } from "@/contexts/character-context";
import { useBreakpoints } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * AnimatedAvatar - Avatar component with transition animation
 * Smoothly transitions from old avatar to new avatar when src changes (cross-fade + slight scale)
 */
function AnimatedAvatar({
  src,
  alt,
  className = "",
  sizes,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (src !== currentSrc) {
      setPrevSrc(currentSrc);
      setCurrentSrc(src);
      setShowNew(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowNew(true);
        });
      });
      const timer = setTimeout(() => {
        setPrevSrc(null);
        setShowNew(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [src, currentSrc]);

  const hasPrev = prevSrc !== null;

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Previous avatar - fade out */}
      {hasPrev && (
        <Image
          key={`prev-${prevSrc}`}
          src={prevSrc!}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover transition-all duration-400 ease-in-out"
          style={{
            opacity: 0,
            transform: "scale(0.95)",
          }}
          priority={priority}
        />
      )}
      {/* New avatar - fade in */}
      <Image
        key={currentSrc}
        src={currentSrc}
        alt={alt}
        fill
        sizes={sizes}
        className="object-cover transition-all duration-400 ease-in-out"
        style={{
          opacity: hasPrev ? (showNew ? 1 : 0) : 1,
          transform: hasPrev ? (showNew ? "scale(1)" : "scale(0.95)") : "scale(1)",
        }}
        priority={priority}
      />
    </div>
  );
}

interface ChatbotPanelProps {
  className?: string;
  /**
   * When true, renders a full-page chat experience instead of a floating widget.
   */
  fullPage?: boolean;
  /**
   * Optional custom system prompt/persona to send to the backend.
   * If omitted, the default Aria Context prompt on the server is used.
   */
  systemPrompt?: string;
  /**
   * Optional assistant display name (used in the chat UI).
   * Defaults to "Acontext Worker".
   */
  assistantName?: string;
  /**
   * Optional assistant avatar image src (Next.js Image src).
   * Defaults to the Acontext logo.
   */
  assistantAvatarSrc?: string;
  /**
   * Optional session ID to load on mount (e.g. from /protected/[id] URL).
   * When set, messages for this session are fetched and the session is selected.
   */
  initialSessionId?: string;
}

type AvailableTool = {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description?: string;
    required: boolean;
  }[];
};

/**
 * Decode Unicode escape sequences in a string
 * Converts \u0041 to A, etc.
 */
function decodeUnicode(str: string): string {
  try {
    // First try to decode if it's a JSON string with Unicode escapes
    if (str.includes("\\u")) {
      // Replace Unicode escape sequences
      return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
    }
    return str;
  } catch {
    return str;
  }
}

/**
 * Normalize message content (string or vision payload) into displayable text
 */
function normalizeMessageContent(
  content: ChatMessage["content"]
): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((item) => {
      if (item.type === "text") return item.text;
      return "[image]";
    })
    .join("\n");
}


/**
 * Render message content with support for images and markdown
 * Handles both string content and Vision API format (array with text and images)
 */
function renderMessageContent(
  content: ChatMessage["content"],
  acontextDiskId?: string
): React.ReactNode {
  // If content is an array (Vision API format), render images and text
  if (Array.isArray(content)) {
    const parts: React.ReactNode[] = [];
    let key = 0;

    for (const item of content) {
      if (item.type === "text") {
        // Render text with markdown
        parts.push(
          <div key={`text-${key++}`} className="mb-2">
            <StreamdownMessage content={item.text} acontextDiskId={acontextDiskId} />
          </div>
        );
      } else if (item.type === "image_url") {
        // Render image
        parts.push(
          <div key={`image-${key++}`} className="mb-2">
            <img
              src={item.image_url.url}
              alt="Uploaded image"
              className="max-w-full h-auto rounded-lg border border-border"
              style={{ maxHeight: "400px" }}
            />
          </div>
        );
      }
    }

    return parts.length > 0 ? <>{parts}</> : null;
  }

  // If content is a string, render with markdown
  return <StreamdownMessage content={content} acontextDiskId={acontextDiskId} />;
}

/**
 * Convert URLs and Markdown links in text to clickable links
 * Handles both Markdown format [text](url) and plain URLs
 */
function renderLinks(text: string): React.ReactNode {
  // First, handle Markdown links: [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match;

  // Process Markdown links first
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      parts.push(...renderPlainUrls(beforeText, key));
      key += beforeText.length;
    }

    // Add the clickable link
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={`link-${key++}`}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
      >
        {linkText}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (which may contain plain URLs)
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    parts.push(...renderPlainUrls(remainingText, key));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/**
 * Convert plain URLs in text to clickable links
 */
function renderPlainUrls(text: string, startKey: number = 0): React.ReactNode[] {
  // URL regex: matches http://, https://, or www. URLs
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = startKey;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{text.substring(lastIndex, match.index)}</span>
      );
    }

    // Add the clickable URL
    let url = match[0];
    // Add https:// if it's a www. URL
    if (url.startsWith("www.")) {
      url = "https://" + url;
    }
    parts.push(
      <a
        key={`url-${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors break-all"
      >
        {match[0]}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.substring(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : [<span key={startKey}>{text}</span>];
}

/**
 * Highlight keywords in text
 * Highlights common important keywords like: number, memory, evaluationPreviousGoal, nextGoal, url, actions, etc.
 */
function highlightKeywords(text: string): React.ReactNode {
  const keywords = [
    "number",
    "memory",
    "evaluationPreviousGoal",
    "nextGoal",
    "url",
    "screenshotUrl",
    "actions",
    "STEP",
    "Verdict",
    "Success",
    "Failure",
    "Error",
    "timeout",
    "done",
    "text",
    "success",
  ];

  // Split text by keywords while preserving the keywords
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Create a regex pattern that matches any keyword (case-insensitive)
  // Match keywords that are JSON keys (followed by ":") or standalone words
  const escapedKeywords = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `("(${escapedKeywords.join("|")})"\\s*:)|(\\b(${escapedKeywords.join("|")})\\b)`,
    "gi"
  );

  let match;
  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{text.substring(lastIndex, match.index)}</span>
      );
    }

    // Add the highlighted keyword
    parts.push(
      <span key={key++} className="font-semibold text-primary">
        {match[0]}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.substring(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/**
 * Format and display step content with Unicode decoding and keyword highlighting
 */
function formatStepContent(step: unknown): React.ReactNode {
  let content: string;
  
  if (typeof step === "string") {
    content = step;
  } else {
    content = JSON.stringify(step, null, 2);
  }

  // Decode Unicode escape sequences
  const decoded = decodeUnicode(content);
  
  // Highlight keywords
  return highlightKeywords(decoded);
}

type ImageGenerateResultSummary = {
  artifactPath?: string;
  publicUrl?: string;
  message?: string;
  thumbnailPath?: string;
};

function getToolDebugModeFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "1";
  } catch {
    return false;
  }
}

function useToolDebugMode(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = getToolDebugModeFromLocation();
    if (fromQuery) {
      setEnabled(true);
      return;
    }
    try {
      const v = window.localStorage.getItem("acontext_tool_debug");
      setEnabled(v === "true");
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const setAndPersist = (next: boolean) => {
    setEnabled(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("acontext_tool_debug", next ? "true" : "false");
    } catch {
      // Ignore storage access errors
    }
  };

  return [enabled, setAndPersist];
}

function safeParseJsonObject(input: unknown): unknown {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return input;
}

function getImageGenerateSummary(result: unknown): ImageGenerateResultSummary | null {
  const parsed = safeParseJsonObject(result);
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const artifactPath = typeof obj.artifactPath === "string" ? obj.artifactPath : undefined;
  const stableUrl = typeof obj.stableUrl === "string" ? obj.stableUrl : undefined;
  const publicUrl = stableUrl || (typeof obj.publicUrl === "string" ? obj.publicUrl : undefined);
  const message = typeof obj.message === "string" ? obj.message : undefined;
  const thumbnailPath = typeof obj.thumbnailPath === "string" ? obj.thumbnailPath : undefined;
  if (!artifactPath && !publicUrl && !message && !thumbnailPath) return null;
  return { artifactPath, publicUrl, message, thumbnailPath };
}

function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function getToolLabel(toolName: string): string {
  switch (toolName) {
    case "image_generate":
      return "Generate slide image";
    case "grep_disk":
      return "Search files (regex)";
    case "glob_disk":
      return "Find files (glob)";
    default:
      if (toolName.startsWith("acontext_disk_") || toolName.endsWith("_disk")) return "File operation";
      if (toolName.startsWith("todo_")) return "Task management";
      return `Tool: ${toolName}`;
  }
}

function extractKeyParameters(toolName: string, arguments_: Record<string, unknown>): Array<{ label: string; value: React.ReactNode }> {
  const fields: Array<{ label: string; value: React.ReactNode }> = [];

  if (toolName === "image_generate") {
    if (typeof arguments_.prompt === "string") {
      fields.push({ label: "Prompt", value: <ExpandableText text={arguments_.prompt} max={200} /> });
    }
    if (typeof arguments_.size === "string") {
      fields.push({ label: "Size", value: arguments_.size });
    }
    if (typeof arguments_.output_dir === "string") {
      fields.push({ label: "Output", value: <span className="font-mono">{arguments_.output_dir}</span> });
    }
  } else if (toolName.startsWith("todo_")) {
    if (typeof arguments_.description === "string") {
      fields.push({ label: "Description", value: <ExpandableText text={arguments_.description} max={200} /> });
    }
    if (typeof arguments_.title === "string") {
      fields.push({ label: "Title", value: arguments_.title });
    }
  } else if (toolName.startsWith("acontext_disk_") || toolName.endsWith("_disk")) {
    if (typeof arguments_.query === "string") {
      fields.push({ label: "Query", value: <ExpandableText text={arguments_.query} max={200} /> });
    }
    if (typeof arguments_.file_path === "string") {
      fields.push({ label: "Path", value: <span className="font-mono">{arguments_.file_path}</span> });
    }
    if (typeof arguments_.filename === "string") {
      fields.push({ label: "Filename", value: <span className="font-mono">{arguments_.filename}</span> });
    }
    if (typeof arguments_.limit === "number" || typeof arguments_.limit === "string") {
      fields.push({ label: "Limit", value: String(arguments_.limit) });
    }
  }

  // For unknown tools, show first few non-empty string/number fields
  if (fields.length === 0) {
    const entries = Object.entries(arguments_ || {});
    for (const [key, val] of entries.slice(0, 3)) {
      if (typeof val === "string" && val.length > 0) {
        fields.push({ label: key, value: <ExpandableText text={val} max={150} /> });
      } else if (typeof val === "number" || typeof val === "boolean") {
        fields.push({ label: key, value: String(val) });
      }
    }
  }

  return fields;
}

function StatusBadge({ status }: { status: "running" | "done" | "failed" }) {
  if (status === "failed") {
    return (
      <span className="text-[11px] font-medium text-destructive px-1.5 py-0.5 rounded bg-destructive/10">
        Failed
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/10">
        Done
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium text-muted-foreground px-1.5 py-0.5 rounded bg-muted/40">
      Running…
    </span>
  );
}

function FieldRow({
  label,
  value,
  actions,
}: {
  label: string;
  value: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="text-[11px] text-foreground break-all">{value}</div>
      {actions}
    </div>
  );
}

function ExpandableText({ text, max = 220 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= max) return <span className="text-foreground">{text}</span>;
  return (
    <span className="text-foreground">
      {open ? text : clipText(text, max)}{" "}
      <button
        type="button"
        className="text-primary underline underline-offset-2"
        onClick={() => setOpen(!open)}
      >
        {open ? "Show less" : "Show more"}
      </button>
    </span>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-7 px-2 text-[11px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Ignore clipboard failures (permissions, unsupported browsers)
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * Tool Calls Display Component - Shows tool invocation details
 * Supports streaming display for Browser Use tasks
 */
function ToolCallsDisplay({ toolCalls, isFullPage = false }: { toolCalls: ToolInvocation[]; isFullPage?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [debugMode, setDebugMode] = useToolDebugMode();

  if (isFullPage) {
    return (
      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <Wrench className="h-4 w-4 text-primary flex-shrink-0 rounded-full bg-primary/10 p-1" />
            <span className="text-xs font-medium text-foreground">
              Tools Invoked: <span className="text-primary font-semibold">{toolCalls.length}</span>
            </span>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <div className="space-y-3 pt-1 animate-fade-in">
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => setDebugMode(!debugMode)}
              >
                Developer mode: {debugMode ? "On" : "Off"}
              </button>
            </div>
            {toolCalls.map((toolCall, idx) => {
              const status: "running" | "done" | "failed" =
                toolCall.error ? "failed" : toolCall.result != null ? "done" : "running";
              const label = getToolLabel(toolCall.name);

              return (
                <Card key={toolCall.id || idx} className="rounded-lg border border-border/80 bg-card shadow-sm">
                  <CardContent className="p-4 space-y-2.5">
                    {/* Tool Name */}
                    <div className="flex items-center gap-2 border-l-2 border-primary pl-2.5">
                      <span className="text-sm font-medium text-foreground">
                        {label}
                      </span>
                      <div className="ml-auto">
                        <StatusBadge status={status} />
                      </div>
                    </div>

                    {/* Parameters (user-friendly, no JSON) */}
                    {(() => {
                      const keyParams = extractKeyParameters(toolCall.name, toolCall.arguments || {});
                      if (keyParams.length === 0) return null;
                      return (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
                          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                            Parameters:
                          </div>
                          <div className="space-y-1.5">
                            {keyParams.map((param, pIdx) => (
                              <FieldRow key={pIdx} label={param.label} value={param.value} />
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* User-friendly Result (no JSON) */}
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Result:
                      </div>

                      {toolCall.error ? (
                        <div className="text-xs text-destructive">
                          <ExpandableText text={toolCall.error} max={260} />
                        </div>
                      ) : toolCall.name === "image_generate" && toolCall.result != null ? (
                        (() => {
                          const summary = getImageGenerateSummary(toolCall.result);
                          return (
                            <div className="space-y-2">
                              <div className="text-xs text-foreground">
                                {summary?.message ? <ExpandableText text={summary.message} /> : "Image generated."}
                              </div>
                              {summary?.artifactPath && (
                                <FieldRow
                                  label="File"
                                  value={<span className="font-mono">{summary.artifactPath}</span>}
                                  actions={<CopyButton value={summary.artifactPath} label="Copy path" />}
                                />
                              )}
                              {summary?.thumbnailPath && (
                                <FieldRow
                                  label="Thumbnail"
                                  value={<span className="font-mono">{summary.thumbnailPath}</span>}
                                  actions={<CopyButton value={summary.thumbnailPath} label="Copy path" />}
                                />
                              )}
                              {/* Intentionally hide URLs (presigned URLs expire; stable URLs are not user-facing here). */}
                              {!summary && (
                                <div className="text-xs text-muted-foreground">
                                  Completed successfully.
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : typeof toolCall.result === "string" ? (
                        <div className="text-xs text-foreground">
                          <ExpandableText text={toolCall.result} max={320} />
                        </div>
                      ) : toolCall.result != null ? (
                        <div className="text-xs text-muted-foreground">
                          Completed successfully.
                        </div>
                      ) : toolCall.steps && toolCall.steps.length > 0 ? (
                        <div className="text-xs text-foreground">
                          Running… <span className="text-muted-foreground">({toolCall.steps.length} updates)</span>
                        </div>
                      ) : (
                        <div className="text-xs text-foreground">Running…</div>
                      )}
                    </div>

                    {/* Parameters (collapsed by default) */}
                    {debugMode && toolCall.name !== "image_generate" && (
                      <details className="rounded-lg border border-border/80 bg-muted/30 p-2.5">
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                          Parameters (debug)
                        </summary>
                        <pre className="mt-2 text-xs font-mono overflow-x-auto break-words whitespace-pre-wrap">
                          {JSON.stringify(toolCall.arguments, null, 2)}
                        </pre>
                      </details>
                    )}

                    {/* Streaming Steps History (for Browser Use tasks) */}
                    {debugMode && toolCall.steps && toolCall.steps.length > 0 && toolCall.result === undefined && !toolCall.error && (
                      <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5">
                        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                          Steps (debug) ({toolCall.steps.length}):
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {toolCall.steps.map((step, stepIdx) => (
                            <div
                              key={stepIdx}
                              className="rounded-md border border-border/60 bg-background/50 p-2"
                            >
                              <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                Step {stepIdx + 1}:
                              </div>
                              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
                                {formatStepContent(step)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Fallback: Show single step if steps array is not available */}
                    {debugMode && (!toolCall.steps || toolCall.steps.length === 0) && toolCall.step !== undefined && toolCall.result === undefined && !toolCall.error && (
                      <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5">
                        <div className="mb-1 text-xs text-muted-foreground">
                          Step (debug):
                        </div>
                        <pre className="text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                          {formatStepContent(toolCall.step)}
                        </pre>
                      </div>
                    )}

                    {/* Raw output (collapsed by default) */}
                    {debugMode && (toolCall.result !== undefined || toolCall.error || (toolCall.steps && toolCall.steps.length > 0)) && (
                      <details className="rounded-lg border border-border/80 bg-muted/30 p-2.5">
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                          Raw (debug)
                        </summary>
                        <pre className="mt-2 text-xs font-mono overflow-x-auto break-words whitespace-pre-wrap">
                          {JSON.stringify(
                            {
                              id: toolCall.id,
                              name: toolCall.name,
                              arguments: toolCall.arguments,
                              result: toolCall.result,
                              error: toolCall.error,
                              steps: toolCall.steps,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    )}

                    {/* Invocation Time */}
                    {toolCall.invokedAt && (
                      <div className="text-right pt-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(toolCall.invokedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Compact mode for floating widget
  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-primary/10"
      >
        <span>
          Used <span className="text-primary font-semibold">{toolCalls.length}</span> tool(s)
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="space-y-2 pt-1 text-xs animate-fade-in">
          <div className="flex items-center justify-end">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => setDebugMode(!debugMode)}
            >
              Developer mode: {debugMode ? "On" : "Off"}
            </button>
          </div>
          {toolCalls.map((toolCall, idx) => {
            const status: "running" | "done" | "failed" =
              toolCall.error ? "failed" : toolCall.result != null ? "done" : "running";
            const label = getToolLabel(toolCall.name);

            return (
                <div key={toolCall.id || idx} className="rounded-lg border border-border/80 bg-card p-2.5 space-y-2 shadow-sm">
                <div className="flex items-center gap-2 border-l-2 border-primary pl-2">
                  <div className="font-semibold text-foreground">{label}</div>
                  <div className="ml-auto">
                    <StatusBadge status={status} />
                  </div>
                </div>

                {/* Parameters (user-friendly, no JSON) */}
                {(() => {
                  const keyParams = extractKeyParameters(toolCall.name, toolCall.arguments || {});
                  if (keyParams.length === 0) return null;
                  return (
                    <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                      <div className="text-[11px] font-medium text-muted-foreground mb-1">Parameters:</div>
                      <div className="space-y-1">
                        {keyParams.map((param, pIdx) => (
                          <div key={pIdx} className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-medium text-muted-foreground">{param.label}</span>
                            <div className="text-[10px] text-foreground break-all">{param.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Summary */}
                <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                  <div className="text-[11px] font-medium text-muted-foreground mb-1">Result:</div>
                  {toolCall.error ? (
                    <div className="text-[11px] text-destructive">
                      <ExpandableText text={toolCall.error} max={240} />
                    </div>
                  ) : toolCall.name === "image_generate" && toolCall.result != null ? (
                    (() => {
                      const summary = getImageGenerateSummary(toolCall.result);
                      return (
                        <div className="space-y-1 text-[11px]">
                          <div>{summary?.message ? <ExpandableText text={summary.message} max={240} /> : "Image generated."}</div>
                          {summary?.artifactPath && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground">File</span>
                              <span className="font-mono break-all">{summary.artifactPath}</span>
                            </div>
                          )}
                          {/* Intentionally hide URLs (presigned URLs expire; stable URLs are not user-facing here). */}
                          {!summary && <div className="text-muted-foreground">Completed successfully.</div>}
                        </div>
                      );
                    })()
                  ) : typeof toolCall.result === "string" ? (
                    <div className="text-[11px]">
                      <ExpandableText text={toolCall.result} max={260} />
                    </div>
                  ) : toolCall.result != null ? (
                    <div className="text-[11px] text-muted-foreground">Completed successfully.</div>
                  ) : toolCall.steps && toolCall.steps.length > 0 ? (
                    <div className="text-[11px]">
                      Running… <span className="text-muted-foreground">({toolCall.steps.length} updates)</span>
                    </div>
                  ) : (
                    <div className="text-[11px]">Running…</div>
                  )}
                </div>

                {/* Parameters (collapsed) */}
                {debugMode && toolCall.name !== "image_generate" && (
                  <details className="rounded-md border border-border/70 bg-muted/30 p-2">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
                      Parameters (debug)
                    </summary>
                    <pre className="mt-2 text-[10px] overflow-x-auto break-words whitespace-pre-wrap">
                      {JSON.stringify(toolCall.arguments, null, 2)}
                    </pre>
                  </details>
                )}
                {/* Streaming Steps History (for Browser Use tasks) */}
                {toolCall.steps && toolCall.steps.length > 0 && toolCall.result === undefined && !toolCall.error && (
                  <div>
                    <div className="text-muted-foreground font-medium">Steps ({toolCall.steps.length}):</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {toolCall.steps.map((step, stepIdx) => (
                        <div key={stepIdx} className="rounded-md border border-border/60 bg-muted/30 p-1.5">
                          <div className="text-[9px] font-medium text-muted-foreground mb-0.5">
                            Step {stepIdx + 1}:
                          </div>
                          <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap break-words">
                            {formatStepContent(step)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Fallback: Show single step if steps array is not available */}
                {(!toolCall.steps || toolCall.steps.length === 0) && toolCall.step !== undefined && toolCall.result === undefined && !toolCall.error && (
                  <div>
                    <div className="text-muted-foreground font-medium">Step:</div>
                    <pre className="text-[10px] overflow-x-auto max-h-32 overflow-y-auto">
                      {formatStepContent(toolCall.step)}
                    </pre>
                  </div>
                )}
                {/* Raw (collapsed) */}
                {debugMode && (toolCall.result !== undefined || toolCall.error || (toolCall.steps && toolCall.steps.length > 0)) && (
                  <details className="rounded-md border border-border/70 bg-muted/30 p-2">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
                      Raw (debug)
                    </summary>
                    <pre className="mt-2 text-[10px] overflow-x-auto break-words whitespace-pre-wrap">
                      {JSON.stringify(
                        {
                          id: toolCall.id,
                          name: toolCall.name,
                          arguments: toolCall.arguments,
                          result: toolCall.result,
                          error: toolCall.error,
                          steps: toolCall.steps,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChatbotPanel({
  className,
  fullPage = false,
  systemPrompt,
  assistantName = "PPT Girl",
  assistantAvatarSrc,
  initialSessionId,
}: ChatbotPanelProps) {
  const { character, characterId, characters } = useCharacter();
  const [isOpen, setIsOpen] = useState(fullPage);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [acontextDiskId, setAcontextDiskId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [files, setFiles] = useState<Array<{
    id?: string;
    path?: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    createdAt?: string;
  }>>([]);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filePreviews, setFilePreviews] = useState<Map<string, {
    content: string; // base64 for images, text for text files, or URL if isUrl is true
    mimeType: string;
    isLoading: boolean;
    error?: string;
    isUrl?: boolean; // true if content is a URL (publicUrl) instead of base64/text
    publicUrl?: string; // public URL for direct access to the file
  }>>(new Map());
  const [filePublicUrls, setFilePublicUrls] = useState<Map<string, string>>(new Map()); // Store stable URL for each file
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]); // Track selected files for batch download (array to maintain order)
  const [isBatchDownloading, setIsBatchDownloading] = useState(false); // Track batch download progress
  // Track in-flight preview loads to avoid duplicate /artifacts/content requests
  const previewLoadPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const [editingFileKey, setEditingFileKey] = useState<string | null>(null);
  const [editPromptByFileKey, setEditPromptByFileKey] = useState<Map<string, string>>(new Map());
  const [editPreviewByFileKey, setEditPreviewByFileKey] = useState<
    Map<string, { previewArtifactPath: string; publicUrl: string; mimeType: string }>
  >(new Map());
  const [isEditPreviewingByFileKey, setIsEditPreviewingByFileKey] = useState<Map<string, boolean>>(
    new Map()
  );
  const [isEditApplyingByFileKey, setIsEditApplyingByFileKey] = useState<Map<string, boolean>>(
    new Map()
  );
  const [editErrorByFileKey, setEditErrorByFileKey] = useState<Map<string, string>>(new Map());
  const [attachments, setAttachments] = useState<Array<{
    filename: string;
    content: string; // base64 for images/files, text content for text files
    mimeType: string;
    isTextFile?: boolean; // true if this is a text file with content read as text
  }>>([]);
  const [tokenCounts, setTokenCounts] = useState<{ total_tokens: number } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  // Character selection for new sessions
  const [showCharacterSelectModal, setShowCharacterSelectModal] = useState(false);
  const [selectedCharacterForNewSession, setSelectedCharacterForNewSession] = useState<CharacterId | null>(null);
  const [sessionCharacterId, setSessionCharacterId] = useState<CharacterId | null>(null); // Locked character for current session
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null); // Track which session is being loaded
  const [hasAttemptedSessionRestore, setHasAttemptedSessionRestore] = useState(false); // Track if session restore has been attempted
  
  // Get effective character: use sessionCharacterId if set, otherwise use global character
  const effectiveCharacter = sessionCharacterId 
    ? characters.find((c) => c.id === sessionCharacterId) || character
    : character;
  
  // Use Context avatar if prop is not provided, otherwise use prop (for backward compatibility)
  // Use effectiveCharacter's avatar for display
  const avatarSrc = assistantAvatarSrc || effectiveCharacter.chatbotAvatarPath;
  // Use character's systemPrompt if prop is not provided, otherwise use prop
  const effectiveSystemPrompt = systemPrompt || effectiveCharacter.systemPrompt;

  const { isMd, isLg } = useBreakpoints();
  const SIDEBAR_STORAGE_KEY = "chatbot-sidebars";
  const LAST_SESSION_STORAGE_KEY = "chatbot-last-session-id";
  const didRestoreLastSessionRef = useRef(false);

  const getFileKey = (file: { id?: string; path?: string; filename?: string }, indexFallback?: number): string => {
    return file.id || file.path || file.filename || (indexFallback != null ? String(indexFallback) : "");
  };

  const getArtifactPathForEdit = (file: { path?: string; filename?: string }, fileKey: string): string | null => {
    // Prefer the full artifact path (as returned by listAcontextArtifacts); fallback to fileKey if it's a plausible path.
    const p = (file.path || "").trim();
    if (p) return p;
    const fk = (fileKey || "").trim();
    if (fk.includes("/")) return fk;
    return null;
  };

  const getStableArtifactUrl = (filePath?: string): string | null => {
    const p = (filePath || "").trim();
    if (!p) return null;
    const base = `/api/acontext/artifacts/public-url?filePath=${encodeURIComponent(p)}`;
    return acontextDiskId ? `${base}&diskId=${encodeURIComponent(acontextDiskId)}` : base;
  };

  const setMapFlag = (setter: React.Dispatch<React.SetStateAction<Map<string, boolean>>>, key: string, value: boolean) => {
    setter((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  };

  const setMapString = (setter: React.Dispatch<React.SetStateAction<Map<string, string>>>, key: string, value: string) => {
    setter((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  };

  const deleteMapKey = <T,>(setter: React.Dispatch<React.SetStateAction<Map<string, T>>>, key: string) => {
    setter((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const handleOpenEdit = (fileKey: string) => {
    setEditingFileKey((prev) => (prev === fileKey ? null : fileKey));
    deleteMapKey(setEditErrorByFileKey, fileKey);
  };

  const handlePreviewEdit = async (file: { path?: string; filename?: string }, fileKey: string) => {
    const artifactPath = getArtifactPathForEdit(file, fileKey);
    const prompt = (editPromptByFileKey.get(fileKey) || "").trim();
    if (!artifactPath) {
      setMapString(setEditErrorByFileKey, fileKey, "Cannot edit: missing artifact path for this file.");
      return;
    }
    if (!prompt) {
      setMapString(setEditErrorByFileKey, fileKey, "Please enter an edit instruction.");
      return;
    }

    deleteMapKey(setEditErrorByFileKey, fileKey);
    setMapFlag(setIsEditPreviewingByFileKey, fileKey, true);
    const previewStartedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = 120_000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log("[UI] image-edit preview start", { fileKey, artifactPath, promptLength: prompt.length, timeoutMs });
      const res = await fetch("/api/acontext/artifacts/image-edit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactPath, prompt, diskId: acontextDiskId }),
        signal: controller.signal,
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Preview request failed");
      }
      setEditPreviewByFileKey((prev) => {
        const next = new Map(prev);
        next.set(fileKey, {
          previewArtifactPath: data.previewArtifactPath,
          publicUrl: data.publicUrl,
          mimeType: data.mimeType,
        });
        return next;
      });
      console.log("[UI] image-edit preview success", { fileKey, elapsedMs: Date.now() - previewStartedAt });
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? `Preview timed out after ${Math.round(timeoutMs / 1000)}s.`
          : e instanceof Error
          ? e.message
          : "Preview failed";
      console.error("[UI] image-edit preview error", { fileKey, error: msg, elapsedMs: Date.now() - previewStartedAt });
      setMapString(setEditErrorByFileKey, fileKey, msg);
    } finally {
      window.clearTimeout(timeoutId);
      setMapFlag(setIsEditPreviewingByFileKey, fileKey, false);
    }
  };

  const handleDiscardEdit = (fileKey: string) => {
    deleteMapKey(setEditErrorByFileKey, fileKey);
    deleteMapKey(setEditPreviewByFileKey, fileKey);
    setEditingFileKey(null);
  };

  const handleApplyEdit = async (file: { path?: string; filename?: string }, fileKey: string) => {
    const originalArtifactPath = getArtifactPathForEdit(file, fileKey);
    const preview = editPreviewByFileKey.get(fileKey);
    if (!originalArtifactPath) {
      setMapString(setEditErrorByFileKey, fileKey, "Cannot apply: missing original artifact path.");
      return;
    }
    if (!preview?.previewArtifactPath) {
      setMapString(setEditErrorByFileKey, fileKey, "Please generate a preview before applying.");
      return;
    }

    deleteMapKey(setEditErrorByFileKey, fileKey);
    setMapFlag(setIsEditApplyingByFileKey, fileKey, true);
    const applyStartedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = 60_000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log("[UI] image-edit apply start", { fileKey, originalArtifactPath, previewArtifactPath: preview.previewArtifactPath, timeoutMs });
      const res = await fetch("/api/acontext/artifacts/image-edit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalArtifactPath,
          previewArtifactPath: preview.previewArtifactPath,
          diskId: acontextDiskId,
          deletePreviewAfterApply: true,
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Apply request failed");
      }

      // Update cached URL and preview map so sidebar refreshes immediately.
      const newUrl = data.publicUrl as string;
      setFilePublicUrls((prev) => new Map(prev).set(fileKey, newUrl));
      setFilePreviews((prev) => {
        const next = new Map(prev);
        const existing = next.get(fileKey);
        next.set(fileKey, {
          content: newUrl,
          mimeType: data.mimeType || existing?.mimeType || "image/jpeg",
          isLoading: false,
          isUrl: true,
          publicUrl: newUrl,
        });
        return next;
      });

      handleDiscardEdit(fileKey);
      console.log("[UI] image-edit apply success", { fileKey, elapsedMs: Date.now() - applyStartedAt });
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? `Apply timed out after ${Math.round(timeoutMs / 1000)}s.`
          : e instanceof Error
          ? e.message
          : "Apply failed";
      console.error("[UI] image-edit apply error", { fileKey, error: msg, elapsedMs: Date.now() - applyStartedAt });
      setMapString(setEditErrorByFileKey, fileKey, msg);
    } finally {
      window.clearTimeout(timeoutId);
      setMapFlag(setIsEditApplyingByFileKey, fileKey, false);
    }
  };

  const [leftSidebarOpen, setLeftSidebarOpenState] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpenState] = useState(true);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { left?: boolean; right?: boolean };
        if (typeof v.left === "boolean") setLeftSidebarOpenState(v.left);
        if (typeof v.right === "boolean") setRightSidebarOpenState(v.right);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistSidebars = (patch: { left?: boolean; right?: boolean }) => {
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      const v = raw ? (JSON.parse(raw) as { left?: boolean; right?: boolean }) : {};
      if (patch.left !== undefined) v.left = patch.left;
      if (patch.right !== undefined) v.right = patch.right;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };

  const setLeftSidebarOpen = (open: boolean) => {
    setLeftSidebarOpenState(open);
    persistSidebars({ left: open });
  };

  const setRightSidebarOpen = (open: boolean) => {
    setRightSidebarOpenState(open);
    persistSidebars({ right: open });
  };
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionListRef = useRef<HTMLDivElement>(null);
  // Typewriter effect refs
  const typewriterBufferRef = useRef<Map<string, string>>(new Map()); // messageId -> buffered content
  const typewriterDisplayRef = useRef<Map<string, string>>(new Map()); // messageId -> displayed content
  const typewriterTimerRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  ); // messageId -> timer
  const totalTools = availableTools.length;
  const enabledToolNames = availableTools.map((tool) => tool.name);
  const TOKEN_LIMIT_THRESHOLD = 80000;
  const TOKEN_WARNING_THRESHOLD = 70000;
  const tokenUsage = tokenCounts?.total_tokens ?? null;
  const isTokenWarning =
    tokenUsage !== null && tokenUsage >= TOKEN_WARNING_THRESHOLD;
  const isTokenCritical =
    tokenUsage !== null && tokenUsage >= TOKEN_LIMIT_THRESHOLD;

  // Auto-scroll only when message count changes (not on every streamed character)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Keep the active session item visible in the left sidebar.
  useEffect(() => {
    if (!isMd || !leftSidebarOpen) return;
    if (!sessionId) return;
    const listEl = sessionListRef.current;
    if (!listEl) return;
    const item = listEl.querySelector(`[data-session-id="${sessionId}"]`);
    if (item instanceof HTMLElement) {
      item.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }, [sessionId, leftSidebarOpen, isMd, sessions.length]);

  // Handle keyboard navigation for image lightbox
  useEffect(() => {
    if (selectedImageIndex === null) return;

    const imageFiles = files.filter(f => {
      const { isImage } = detectFileType(f.filename, f.mimeType);
      return isImage;
    });

    if (imageFiles.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedImageIndex(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedImageIndex((prev) => {
          if (prev === null) return null;
          return prev === 0 ? imageFiles.length - 1 : prev - 1;
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedImageIndex((prev) => {
          if (prev === null) return null;
          return prev === imageFiles.length - 1 ? 0 : prev + 1;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedImageIndex, files]);

  // Cleanup typewriter timers on unmount
  useEffect(() => {
    return () => {
      typewriterTimerRef.current.forEach((timer) => clearInterval(timer));
      typewriterTimerRef.current.clear();
      typewriterBufferRef.current.clear();
      typewriterDisplayRef.current.clear();
    };
  }, []);

  // Auto-refresh files list every 5 seconds when acontextDiskId is available
  // This ensures the file list stays up-to-date with the remote Acontext disk
  useEffect(() => {
    if (!acontextDiskId) return;

    // Initial load when acontextDiskId becomes available
    handleLoadFiles();

    // Set up polling interval: refresh every 5 seconds
    const intervalId = setInterval(() => {
      // Only refresh if not currently loading to avoid overlapping requests
      if (!isFilesLoading) {
        handleLoadFiles();
      }
    }, 5000); // 5 seconds

    // Cleanup interval on unmount or when acontextDiskId changes
    return () => {
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acontextDiskId]);

  // Auto-populate stable URLs and lightweight image previews when file list changes.
  useEffect(() => {
    files.forEach((file) => {
      const fileKey = file.id || file.path || file.filename || "";
      if (!fileKey || !file.path) return;

      const stableUrl = getStableArtifactUrl(file.path);
      if (!stableUrl) return;

      // Store stable URL for download / external open
      setFilePublicUrls((prev) => {
        if (prev.has(fileKey) && prev.get(fileKey) === stableUrl) return prev;
        const next = new Map(prev);
        next.set(fileKey, stableUrl);
        return next;
      });

      // Populate lightweight preview for images using stable URL (no presigned caching).
      const mimeType = file.mimeType || "";
      const { isImage } = detectFileType(file.filename, mimeType);
      if (!isImage) return;

      setFilePreviews((prev) => {
        const next = new Map(prev);
        const existing = next.get(fileKey);
        if (existing && (existing.content || existing.isLoading)) return next;
        next.set(fileKey, {
          content: stableUrl,
          mimeType: mimeType || "image/*",
          isLoading: false,
          isUrl: true,
          publicUrl: stableUrl,
        });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, acontextDiskId]);

  // Typewriter effect: gradually display buffered content
  const startTypewriter = (messageId: string, targetContent: string) => {
    // Clear existing timer for this message
    const existingTimer = typewriterTimerRef.current.get(messageId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Get current displayed content
    const currentDisplay = typewriterDisplayRef.current.get(messageId) || "";
    
    // If target is shorter than current, just update immediately
    if (targetContent.length <= currentDisplay.length) {
      typewriterDisplayRef.current.set(messageId, targetContent);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: targetContent } : msg
        )
      );
      return;
    }

    // Calculate how much new content to display
    const newContent = targetContent.slice(currentDisplay.length);
    
    // Typewriter settings: chunked updates to reduce layout thrash on long streams
    // (slightly slower but keeps surrounding UI like bottom bars stable)
    const CHARS_PER_INTERVAL = 6; // Display 6 characters at a time
    const INTERVAL_MS = 80; // Update every 80ms
    
    let displayIndex = 0;
    
    const timer = setInterval(() => {
      displayIndex += CHARS_PER_INTERVAL;
      const newDisplay = currentDisplay + newContent.slice(0, displayIndex);
      
      // Update displayed content
      typewriterDisplayRef.current.set(messageId, newDisplay);
      
      // Update UI
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: newDisplay } : msg
        )
      );

      // If we've displayed all new content, clear the timer
      if (displayIndex >= newContent.length) {
        clearInterval(timer);
        typewriterTimerRef.current.delete(messageId);
        // Ensure final content is exactly targetContent
        typewriterDisplayRef.current.set(messageId, targetContent);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, content: targetContent } : msg
          )
        );
      }
    }, INTERVAL_MS);

    typewriterTimerRef.current.set(messageId, timer);
  };

  // Fetch chat sessions (for full-page layout)
  useEffect(() => {
    if (!fullPage) return;

    async function fetchSessions() {
      try {
        setIsSessionsLoading(true);
        const res = await fetch("/api/chat-sessions");
        if (!res.ok) {
          throw new Error("Failed to load sessions");
        }
        const data = await res.json();
        setSessions(data.sessions ?? []);
      } catch (err) {
        console.error("Failed to load chat sessions", err);
      } finally {
        setIsSessionsLoading(false);
      }
    }

    fetchSessions();
  }, [fullPage]);

  // Restore last selected session (full-page only) when URL session is not provided.
  useEffect(() => {
    if (!fullPage) return;
    if (initialSessionId) return;
    if (didRestoreLastSessionRef.current) return;
    didRestoreLastSessionRef.current = true;

    try {
      const lastId = localStorage.getItem(LAST_SESSION_STORAGE_KEY);
      if (lastId && typeof lastId === "string") {
        handleLoadSessionMessages(lastId);
      }
    } catch {
      /* ignore */
    } finally {
      // Mark that session restore attempt has completed
      setHasAttemptedSessionRestore(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount when URL does not provide session
  }, [fullPage, initialSessionId]);

  // Load initial session from URL (e.g. /protected/[id]) when provided
  useEffect(() => {
    if (!fullPage || !initialSessionId) return;
    handleLoadSessionMessages(initialSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount when initialSessionId is set
  }, [fullPage, initialSessionId]);

  // Auto-show character selection grid when no session is available (full-page only)
  useEffect(() => {
    // Only for full-page mode
    if (!fullPage) return;
    // Skip if URL provides a session ID (it will be loaded by the effect above)
    if (initialSessionId) return;
    // Skip if session restore attempt hasn't completed yet
    if (!hasAttemptedSessionRestore) return;
    // Skip if sessions are still loading
    if (isSessionsLoading) return;
    // Skip if currently loading a session
    if (loadingSessionId) return;
    // Skip if there's already a session or messages
    if (sessionId || messages.length > 0) return;
    // Auto-show character selection grid when no session is available
    setShowCharacterSelectModal(true);
  }, [fullPage, initialSessionId, hasAttemptedSessionRestore, sessionId, messages.length, isSessionsLoading, loadingSessionId]);

  // Fetch available tools for display
  useEffect(() => {
    async function fetchTools() {
      try {
        const res = await fetch("/api/tools");
        if (!res.ok) {
          throw new Error("Failed to load tools");
        }
        const data = await res.json();
        const tools: AvailableTool[] = data.tools ?? [];
        setAvailableTools(tools);
        setToolsError(null);
      } catch (err) {
        setToolsError(
          err instanceof Error ? err.message : "Failed to load tools"
        );
      }
    }

    fetchTools();
  }, []);

  const handleLoadSessionMessages = async (targetSessionId: string) => {
    // Guard: block invalid session id on the client to avoid /api/chat-sessions/undefined/messages
    if (!targetSessionId) {
      setError("Failed to load messages: invalid session id");
      return;
    }

    try {
      setError(null);
      // Clear messages first to prevent showing Processing state
      setMessages([]);
      setLoadingSessionId(targetSessionId);
      setIsLoading(true);
      const res = await fetch(`/api/chat-sessions/${targetSessionId}/messages`);
      if (!res.ok) {
        // If we tried to restore a session that no longer exists or is not accessible, clear the persisted key.
        if ([401, 403, 404].includes(res.status)) {
          try {
            const lastId = localStorage.getItem(LAST_SESSION_STORAGE_KEY);
            if (lastId === targetSessionId) {
              localStorage.removeItem(LAST_SESSION_STORAGE_KEY);
            }
          } catch {
            /* ignore */
          }
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load messages");
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
      setTokenCounts(data.tokenCounts ?? null);
      setSessionId(targetSessionId);

      // Persist last selected session for restore-on-reenter UX.
      try {
        localStorage.setItem(LAST_SESSION_STORAGE_KEY, targetSessionId);
      } catch {
        /* ignore */
      }
      
      // Set locked character ID for this session
      if (data.characterId) {
        setSessionCharacterId(data.characterId as CharacterId);
      } else {
        // Old session without characterId - allow global character selection
        setSessionCharacterId(null);
      }
      
      // Clear selected files when switching sessions
      setSelectedFiles([]);
      
      // Use diskId from API response (which may have just been created)
      // Fallback to session list if not in response
      if (data.acontextDiskId) {
        setAcontextDiskId(data.acontextDiskId);
        // Update the session in the list if it exists
        const sessionIndex = sessions.findIndex((s) => s.id === targetSessionId);
        if (sessionIndex >= 0) {
          const updatedSessions = [...sessions];
          updatedSessions[sessionIndex] = {
            ...updatedSessions[sessionIndex],
            acontextDiskId: data.acontextDiskId,
            characterId: data.characterId,
          };
          setSessions(updatedSessions);
        }
      } else {
        // Extract acontextDiskId and characterId from the sessions list as fallback
        const session = sessions.find((s) => s.id === targetSessionId);
        if (session?.acontextDiskId) {
          setAcontextDiskId(session.acontextDiskId);
        } else {
          // Clear diskId if session doesn't have one
          setAcontextDiskId(undefined);
        }
        // Also set characterId from session list if not in API response
        if (!data.characterId && session?.characterId) {
          setSessionCharacterId(session.characterId as CharacterId);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load session messages";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setLoadingSessionId(null);
    }
  };

  const handleNewSession = () => {
    // Reset local state so that next send will create a brand-new session on the server
    setMessages([]);
    setSessionId(undefined);
    setAcontextDiskId(undefined);
    setTokenCounts(null);
    setError(null);
    setInput("");
    // Clear selected files when creating new session
    setSelectedFiles([]);
    // Reset character selection state
    setSessionCharacterId(null);
    setSelectedCharacterForNewSession(null);
    // Show character selection modal immediately
    setShowCharacterSelectModal(true);
  };

  const handleSelectCharacterForNewSession = (characterId: CharacterId) => {
    setSelectedCharacterForNewSession(characterId);
    // Set sessionCharacterId immediately so UI updates to show correct character
    setSessionCharacterId(characterId);
    
    // Get character info to create mock greeting message
    const selectedCharData = characters.find((c) => c.id === characterId);
    
    if (selectedCharData) {
      // Add mock greeting message from the selected character
      const mockMessage: ChatMessage = {
        id: `mock-${Date.now()}`,
        role: "assistant",
        content: `Hi! I'm ${selectedCharData.name}. ${selectedCharData.tagline}`,
        createdAt: new Date(),
      };
      setMessages([mockMessage]);
    }
  };

  const handleCancelCharacterSelection = () => {
    setSelectedCharacterForNewSession(null);
    setShowCharacterSelectModal(false);
  };

  const handleDeleteSession = async (targetSessionId: string) => {
    if (!targetSessionId || deletingSessionId) return;

    const confirmed = window.confirm("Are you sure you want to delete this session? This action cannot be undone.");
    if (!confirmed) return;

    try {
      setDeletingSessionId(targetSessionId);
      setError(null);

      const res = await fetch(`/api/chat-sessions/${targetSessionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete session");
      }

      // If we deleted the persisted last session, clear it.
      try {
        const lastId = localStorage.getItem(LAST_SESSION_STORAGE_KEY);
        if (lastId === targetSessionId) {
          localStorage.removeItem(LAST_SESSION_STORAGE_KEY);
        }
      } catch {
        /* ignore */
      }

      // Remove from local list
      setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));

      // If we deleted the active session, reset the chat view
      if (sessionId === targetSessionId) {
        setSessionId(undefined);
        setAcontextDiskId(undefined);
        setMessages([]);
        setTokenCounts(null);
        setInput("");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete session";
      setError(errorMessage);
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Text file extensions to auto-read
    const textFileExtensions = ['.txt', '.md', '.tex', '.json', '.csv', '.log', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.sh', '.bat', '.ps1', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.sql', '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte'];

    const newAttachments: Array<{
      filename: string;
      content: string;
      mimeType: string;
      isTextFile?: boolean;
    }> = [];

    for (const file of Array.from(files)) {
      try {
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        const isTextFile = textFileExtensions.includes(fileExtension) || 
                          file.type.startsWith('text/') ||
                          file.type === 'application/json' ||
                          file.type === 'application/xml';

        if (isTextFile) {
          // Read text file as text content
          const textContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve(reader.result as string);
            };
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
          });

          newAttachments.push({
            filename: file.name,
            content: textContent,
            mimeType: file.type || "text/plain",
            isTextFile: true,
          });
        } else {
          // Read non-text files as base64 (for images, etc.)
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Content = result.includes(",")
              ? result.split(",")[1]
              : result;
            resolve(base64Content);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newAttachments.push({
          filename: file.name,
          content: base64,
          mimeType: file.type || "application/octet-stream",
            isTextFile: false,
        });
        }
      } catch (error) {
        console.error("Failed to read file:", error);
        setError(`Failed to read file: ${file.name}`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLoadFiles = async () => {
    try {
      setIsFilesLoading(true);
      setFilesError(null);
      // Build URL with diskId query parameter if available
      const url = acontextDiskId
        ? `/api/acontext/artifacts?diskId=${encodeURIComponent(acontextDiskId)}`
        : "/api/acontext/artifacts";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to load files");
      }
      const data = await res.json();
      setFiles(data.artifacts || []);
    } catch (err) {
      setFilesError(
        err instanceof Error ? err.message : "Failed to load files"
      );
      setFiles([]);
    } finally {
      setIsFilesLoading(false);
    }
  };

  const handleOpenFilesModal = () => {
    setIsFilesModalOpen(true);
    if (files.length === 0) {
      handleLoadFiles();
    }
  };

  // Handle file deletion
  const [deletingFileKeys, setDeletingFileKeys] = useState<Set<string>>(new Set());
  
  const handleDeleteFile = async (file: {
    id?: string;
    path?: string;
    filename?: string;
  }) => {
    const fileKey = file.id || file.path || file.filename || "";
    if (!fileKey || !file.path) {
      console.warn("[UI] Cannot delete file: missing path", { file });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${file.filename || file.path}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeletingFileKeys(prev => new Set(prev).add(fileKey));
      setError(null);

      // Build URL with filePath and optional diskId
      const url = new URL("/api/acontext/artifacts/delete", window.location.origin);
      url.searchParams.set("filePath", file.path);
      if (acontextDiskId) {
        url.searchParams.set("diskId", acontextDiskId);
      }

      const res = await fetch(url.toString(), {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete file");
      }

      // Remove from selected files if it was selected
      setSelectedFiles(prev => prev.filter(key => key !== fileKey));

      // Remove from previews and publicUrls
      setFilePreviews(prev => {
        const next = new Map(prev);
        next.delete(fileKey);
        return next;
      });
      setFilePublicUrls(prev => {
        const next = new Map(prev);
        next.delete(fileKey);
        return next;
      });

      // Refresh files list
      await handleLoadFiles();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete file";
      setError(errorMessage);
      console.error("[UI] Failed to delete file:", err);
    } finally {
      setDeletingFileKeys(prev => {
        const next = new Set(prev);
        next.delete(fileKey);
        return next;
      });
    }
  };

  // Handle file selection toggle
  const handleToggleFileSelection = (fileKey: string) => {
    setSelectedFiles(prev => {
      if (prev.includes(fileKey)) {
        // Remove from array (maintain order of remaining items)
        return prev.filter(key => key !== fileKey);
      } else {
        // Add to end of array (maintain selection order)
        return [...prev, fileKey];
      }
    });
  };

  // Handle select all / deselect all
  const handleSelectAllImages = () => {
    const allImageKeys = files
      .filter(f => {
        const { isImage } = detectFileType(f.filename, f.mimeType);
        return isImage;
      })
      .map(f => f.id || f.path || f.filename || "")
      .filter(key => key !== "");
    
    const selectedImageKeys = selectedFiles.filter(key => 
      allImageKeys.includes(key)
    );
    
    if (selectedImageKeys.length === allImageKeys.length) {
      // All images are selected, deselect all
      setSelectedFiles(prev => prev.filter(key => !allImageKeys.includes(key)));
    } else {
      // Not all images selected, select all (add to end to maintain order)
      setSelectedFiles(prev => {
        const newKeys = allImageKeys.filter(key => !prev.includes(key));
        return [...prev, ...newKeys];
      });
    }
  };

  // Handle batch download
  const handleBatchDownload = async () => {
    if (selectedFiles.length === 0) return;

    setIsBatchDownloading(true);
    try {
      // Collect selected files with their stable URLs in selection order
      const selectedItems: Array<{ url: string; filename: string }> = [];
      
      // Process files in the order they were selected
      for (const fileKey of selectedFiles) {
        const file = files.find(f => {
          const key = f.id || f.path || f.filename || "";
          return key === fileKey;
        });
        
        if (!file) continue;
        
        const { isImage } = detectFileType(file.filename, file.mimeType);
        if (!isImage) continue; // Only download images
        
        const stableUrl =
          filePublicUrls.get(fileKey) || filePreviews.get(fileKey)?.publicUrl;
        
        if (!stableUrl) {
          console.warn("[UI] No stable URL for file", { fileKey, filename: file.filename });
          continue;
        }
        
        selectedItems.push({
          url: stableUrl,
          filename: file.filename || file.path || `file-${fileKey}`,
        });
      }

      if (selectedItems.length === 0) {
        console.warn("[UI] No valid files to download");
        return;
      }

      console.log("[UI] Batch download: Requesting PDF generation", {
        count: selectedItems.length,
      });

      // Call backend API to generate PDF
      const response = await fetch("/api/acontext/artifacts/batch-download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: selectedItems }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate PDF");
      }

      const blob = await response.blob();
      
      // Download the PDF file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "your_slides.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log("[UI] Batch download: PDF generated successfully", {
        count: selectedItems.length,
      });

      // Clear selection after download
      setSelectedFiles([]);
    } catch (error) {
      console.error("[UI] Batch download failed:", error);
      alert(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBatchDownloading(false);
    }
  };

  // Helper function to detect file type based on extension and MIME type
  const detectFileType = (filename?: string, mimeType?: string): { isImage: boolean; isText: boolean } => {
    const mime = mimeType || "";
    const name = filename || "";
    const ext = name.split('.').pop()?.toLowerCase() || "";
    
    // Image detection: check MIME type or extension
    const isImage = mime.startsWith("image/") || 
                   ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
    
    // Text detection: check MIME type or extension
    const isText = mime.startsWith("text/") ||
                   mime === "application/json" ||
                   mime === "application/javascript" ||
                   mime === "application/xml" ||
                   mime === "application/x-sh" ||
                   mime === "application/x-yaml" ||
                   mime === "application/yaml" ||
                   ["txt", "json", "js", "jsx", "ts", "tsx", "html", "css", "xml", "yaml", "yml", "md", "sh", "bash", "py", "java", "cpp", "c", "h", "go", "rs", "php", "rb", "swift", "kt"].includes(ext);
    
    return { isImage, isText };
  };

  const handleLoadFilePreview = async (file: {
    id?: string;
    path?: string;
    filename?: string;
    mimeType?: string;
  }) => {
    console.log("[UI] handleLoadFilePreview: Called with file", {
      file,
      fileId: file.id,
      filePath: file.path,
      filename: file.filename,
      mimeType: file.mimeType,
    });
    
    const fileKey = file.id || file.path || file.filename || "";
    if (!fileKey || !file.path) {
      console.warn("[UI] handleLoadFilePreview: Missing fileKey or file.path", {
        fileKey,
        filePath: file.path,
      });
      return;
    }

    // Check if already loaded or loading
    const existingPreview = filePreviews.get(fileKey);
    if (existingPreview && (existingPreview.content || existingPreview.isLoading)) {
      console.log("[UI] handleLoadFilePreview: Preview already exists or loading", {
        fileKey,
        hasContent: !!existingPreview.content,
        isLoading: existingPreview.isLoading,
      });
      return;
    }

    // If there is already an in-flight request for this file, reuse it instead of firing a new one
    const inFlight = previewLoadPromisesRef.current.get(fileKey);
    if (inFlight) {
      console.log("[UI] handleLoadFilePreview: Reusing in-flight preview load", { fileKey });
      await inFlight;
      return;
    }

    // Check if file is previewable (image or text)
    const mimeType = file.mimeType || "";
    const { isImage, isText } = detectFileType(file.filename, mimeType);

    console.log("[UI] handleLoadFilePreview: File type detection", {
      filename: file.filename,
      mimeType,
      isImage,
      isText,
      isPreviewable: isImage || isText,
    });

    if (!isImage && !isText) {
      console.log("[UI] handleLoadFilePreview: File is not previewable, skipping");
      return; // Don't preview non-image/non-text files
    }

    // Create and register a single in-flight promise for this fileKey
    const loadPromise = (async () => {
      // Set loading state
      setFilePreviews(prev => new Map(prev).set(fileKey, {
        content: "",
        mimeType: mimeType,
        isLoading: true,
      }));

      try {
        const safePath = file.path || "";
        const url = acontextDiskId
          ? `/api/acontext/artifacts/content?filePath=${encodeURIComponent(safePath)}&diskId=${encodeURIComponent(acontextDiskId)}`
          : `/api/acontext/artifacts/content?filePath=${encodeURIComponent(safePath)}`;
        
        console.log("[UI] handleLoadFilePreview: Fetching preview", {
          url,
          filePath: file.path,
          diskId: acontextDiskId,
        });
        
        const res = await fetch(url);
        
        console.log("[UI] handleLoadFilePreview: Fetch response", {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
        });
        if (!res.ok) {
          throw new Error("Failed to load file preview");
        }

        const data = await res.json();
        
        console.log("[UI] handleLoadFilePreview: API response data", {
          success: data.success,
          hasContent: !!data.content,
          hasPublicUrl: !!data.publicUrl,
          contentType: typeof data.content,
          contentLength: data.content?.length,
          reportedSize: data.size,
          mimeType: data.mimeType,
          contentPreview: data.content?.substring(0, 100),
        });
        
        if (!data.success) {
          throw new Error("Invalid response from server");
        }

        // Determine correct MIME type: use server's MIME type, or infer from extension if generic
        let finalMimeType = data.mimeType || mimeType;
        if (finalMimeType === "application/octet-stream" || !finalMimeType) {
          // Infer MIME type from file extension
          const ext = (file.filename || "").split('.').pop()?.toLowerCase() || "";
          const mimeMap: Record<string, string> = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
            bmp: "image/bmp",
            ico: "image/x-icon",
            txt: "text/plain",
            json: "application/json",
            js: "application/javascript",
            jsx: "application/javascript",
            ts: "application/typescript",
            tsx: "application/typescript",
            html: "text/html",
            css: "text/css",
            xml: "application/xml",
            yaml: "application/yaml",
            yml: "application/yaml",
            md: "text/markdown",
            sh: "application/x-sh",
          };
          if (mimeMap[ext]) {
            finalMimeType = mimeMap[ext];
          }
        }

        const { isText: detectedIsText, isImage: detectedIsImage } = detectFileType(file.filename, finalMimeType);
        
        console.log("[UI] handleLoadFilePreview: File type detection", {
          filename: file.filename,
          finalMimeType,
          detectedIsText,
          detectedIsImage,
          contentLength: data.content?.length,
          reportedSize: data.size,
          hasPublicUrl: !!data.publicUrl,
        });
        
        // For images, prefer using a stable URL (resolves to a fresh presigned URL on demand)
        if (detectedIsImage) {
          const stableUrl = getStableArtifactUrl(file.path);
          if (!stableUrl) {
            throw new Error("No stable URL available for image");
          }
          console.log("[UI] handleLoadFilePreview: Using stable URL for image", {
            stableUrl,
          });
          setFilePreviews(prev => new Map(prev).set(fileKey, {
            content: stableUrl, // Store URL as content for images
            mimeType: finalMimeType,
            isLoading: false,
            isUrl: true, // Flag to indicate this is a URL, not base64 content
            publicUrl: stableUrl, // Store stable URL for display
          }));
          return;
        }
        
        // Fallback to content if no publicUrl or not an image
        if (!data.content) {
          throw new Error("No content or publicUrl available");
        }

        // Validate content size for images
        if (detectedIsImage && data.size) {
          const minImageSize = 100; // Minimum reasonable size for an image (bytes)
          if (data.size < minImageSize) {
            console.warn("[UI] handleLoadFilePreview: Image file seems too small", {
              filename: file.filename,
              reportedSize: data.size,
              contentLength: data.content?.length,
              minImageSize,
            });
          }
        }
        
        // Handle content based on type:
        // - If isText: true, content is already a text string (no decoding needed)
        // - If isText: false or undefined, content is base64 encoded
        let content = data.content;
        
        // Check if backend returned text content directly (new format)
        const isTextContent = data.isText === true;
        
        // Only decode base64 if it's a text file and content is base64 encoded (old format or binary)
        if (detectedIsText && !detectedIsImage && !isTextContent) {
          // Backward compatibility: decode base64 for text files (old API format)
          try {
            // Decode base64 to binary string
            const binaryString = atob(data.content);
            // Convert binary string to Uint8Array (byte array)
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            // Decode UTF-8 bytes to text string
            const decoder = new TextDecoder('utf-8');
            content = decoder.decode(bytes);
            console.log("[UI] handleLoadFilePreview: Decoded base64 text content (backward compatibility)", {
              decodedLength: content.length,
              originalBase64Length: data.content.length,
            });
          } catch (e) {
            console.warn("[UI] Failed to decode text content:", e);
            content = data.content;
          }
        } else if (isTextContent) {
          // New format: content is already text, no decoding needed
          console.log("[UI] handleLoadFilePreview: Using direct text content (no base64 decoding)", {
            textLength: content.length,
          });
        } else {
          // For images and binary files, ensure content is a clean base64 string
          if (typeof content === 'string') {
            // Remove any whitespace characters
            content = content.replace(/\s/g, '');
          }
          
          // Validate base64 content length matches expected size
          if (detectedIsImage && data.size) {
            // Base64 encoding increases size by ~33%, so base64 length should be roughly 4/3 of original
            const expectedBase64Length = Math.ceil(data.size * 4 / 3);
            const actualBase64Length = content.length;
            const tolerance = 10; // Allow some tolerance
            
            if (Math.abs(actualBase64Length - expectedBase64Length) > tolerance) {
              console.warn("[UI] handleLoadFilePreview: Base64 content length mismatch", {
                filename: file.filename,
                reportedSize: data.size,
                expectedBase64Length,
                actualBase64Length,
                difference: actualBase64Length - expectedBase64Length,
              });
            }
          }
          
          console.log("[UI] handleLoadFilePreview: Keeping content as base64", {
            isImage: detectedIsImage,
            contentLength: content.length,
            reportedSize: data.size,
          });
        }

        setFilePreviews(prev => new Map(prev).set(fileKey, {
          content: content,
          mimeType: finalMimeType,
          isLoading: false,
          publicUrl: data.publicUrl, // Store publicUrl if available
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load preview";
        // Use warn (not error) to avoid Next.js dev overlay "Console Error" for expected failures
        // (e.g. missing artifact, transient network issues). Also log stack explicitly because
        // the Next.js overlay often serializes `Error` as `{}`.
        console.warn("[UI] handleLoadFilePreview: Failed to load preview", {
          fileKey,
          filePath: file.path,
          filename: file.filename,
          errorMessage,
          errorStack: err instanceof Error ? err.stack : undefined,
        });
        
        setFilePreviews(prev => new Map(prev).set(fileKey, {
          content: "",
          mimeType: mimeType,
          isLoading: false,
          error: errorMessage,
        }));
      } finally {
        previewLoadPromisesRef.current.delete(fileKey);
      }
    })();

    previewLoadPromisesRef.current.set(fileKey, loadPromise);
    await loadPromise;
  };

  const handleManualCompress = async () => {
      if (!sessionId) {
      setError("An existing session is required to compress context");
      return;
    }

    try {
      setIsCompressing(true);
      setError(null);
      const res = await fetch(`/api/chat-sessions/${sessionId}/compress`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData.message || "Failed to compress context";
        throw new Error(message);
      }

      const data = await res.json();

      // Clear any running typewriter timers to avoid stale updates
      typewriterTimerRef.current.forEach((timer) => clearInterval(timer));
      typewriterTimerRef.current.clear();
      typewriterBufferRef.current.clear();
      typewriterDisplayRef.current.clear();

      setMessages(data.messages ?? []);
      setTokenCounts(data.tokenCounts ?? null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to compress context";
      setError(errorMessage);
    } finally {
      setIsCompressing(false);
    }
  };

  // Helper function to convert text to base64
  const textToBase64 = (text: string): string => {
    // Use TextEncoder to handle Unicode properly
    const bytes = new TextEncoder().encode(text);
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    // Check if we need to select a character for new session
    if (!sessionId && !selectedCharacterForNewSession) {
      setShowCharacterSelectModal(true);
      return;
    }

    const messageContent = input.trim();
    const currentAttachments = [...attachments];
    
    // Separate text files from other attachments
    const textFiles = currentAttachments.filter(att => att.isTextFile === true);
    const otherAttachments = currentAttachments.filter(att => att.isTextFile !== true);
    
    // Build text content including text files
    let textContentParts: string[] = [];
    if (messageContent.trim()) {
      textContentParts.push(messageContent);
    }
    
    // Add text file contents to message
    for (const textFile of textFiles) {
      textContentParts.push(`\n\n--- File: ${textFile.filename} ---\n${textFile.content}`);
    }
    
    const combinedTextContent = textContentParts.length > 0 
      ? textContentParts.join('') 
      : (otherAttachments.length > 0 ? "[Attachment]" : "");
    
    // Build user message content with attachments (Vision API format for images)
    let userMessageContent: ChatMessage["content"];
    if (otherAttachments.length > 0) {
      const hasImages = otherAttachments.some((att) =>
        att.mimeType.startsWith("image/")
      );

      if (hasImages) {
        // Use Vision API format: content as array with text and images
        const contentParts: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        > = [];

        if (combinedTextContent.trim()) {
          contentParts.push({
            type: "text",
            text: combinedTextContent,
          });
        }

        for (const att of otherAttachments) {
          if (att.mimeType.startsWith("image/")) {
            const dataUrl = `data:${att.mimeType};base64,${att.content}`;
            contentParts.push({
              type: "image_url",
              image_url: { url: dataUrl },
            });
          } else {
            contentParts.push({
              type: "text",
              text: `\n[Attachment: ${att.filename} (${att.mimeType})]`,
            });
          }
        }

        userMessageContent = contentParts;
      } else {
        // No images, use regular text format
        let finalTextContent = combinedTextContent || "[Attachment]";
        for (const att of otherAttachments) {
          finalTextContent += `\n\n[Attachment: ${att.filename} (${att.mimeType})]`;
        }
        userMessageContent = finalTextContent;
      }
    } else {
      userMessageContent = combinedTextContent || "[Attachment]";
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: userMessageContent,
    };

    // Add user message to UI immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setError(null);
    setIsLoading(true);

    try {
      const enabledToolsForRequest =
        availableTools.length > 0 ? enabledToolNames : undefined;

      // Prepare attachments for API: include both text files and other attachments
      // Convert text file content to base64 for API compatibility
      const attachmentsForAPI = [
        ...textFiles.map(att => ({
          filename: att.filename,
          content: textToBase64(att.content), // Convert text to base64
          mimeType: att.mimeType,
        })),
        ...otherAttachments.map(att => ({
          filename: att.filename,
          content: att.content, // Already base64
          mimeType: att.mimeType,
        })),
      ];

      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: combinedTextContent || (attachmentsForAPI.length > 0 ? "[Attachment]" : ""),
          sessionId,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          // Optional custom system prompt/persona for specialized agents (e.g., PPT agent)
          systemPrompt: effectiveSystemPrompt || undefined,
          // Server-only context (does not affect LLM tool schema)
          // For new sessions, use selectedCharacterForNewSession; for existing sessions, use sessionCharacterId or global characterId
          characterId: sessionId ? (sessionCharacterId || characterId) : (selectedCharacterForNewSession || characterId),
          enabledToolNames: enabledToolsForRequest,
          stream: true, // Enable streaming for Browser Use tasks
          attachments: attachmentsForAPI.length > 0 ? attachmentsForAPI : undefined,
        }),
      });

      if (!response.ok) {
        // Try to parse error as JSON, fallback to text
        let errorMessage = "Failed to get response";
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          errorMessage = await response.text().catch(() => errorMessage);
        }
        throw new Error(errorMessage);
      }

      // Check if response is streaming (SSE)
      const contentType = response.headers.get("content-type");
      const isStreaming = contentType?.includes("text/event-stream");

      if (isStreaming) {
        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let currentToolCalls: ToolInvocation[] = [];
        let finalMessage = "";
        let finalSessionId = sessionId;

        // Create a placeholder assistant message that will be updated
        const assistantMessageId = `assistant-${Date.now()}`;
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          toolCalls: [],
        };

        // Initialize typewriter buffers for this message
        typewriterBufferRef.current.set(assistantMessageId, "");
        typewriterDisplayRef.current.set(assistantMessageId, "");

        setMessages((prev) => [...prev, assistantMessage]);
        // Keep isLoading true until stream finishes so input stays disabled during output

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

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

                  if (eventType === "message") {
                    // Stream message content chunks - buffer for typewriter effect
                    const content = parsed.content || "";
                    if (content) {
                      // Add to buffer
                      const currentBuffer = typewriterBufferRef.current.get(assistantMessageId) || "";
                      const newBuffer = currentBuffer + content;
                      typewriterBufferRef.current.set(assistantMessageId, newBuffer);
                      
                      // Start or update typewriter effect
                      startTypewriter(assistantMessageId, newBuffer);
                    }
                  } else if (eventType === "tool_call_start") {
                    const toolCall = parsed.toolCall as ToolInvocation;
                    currentToolCalls.push(toolCall);
                    // Update assistant message with tool calls
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, toolCalls: [...currentToolCalls] }
                          : msg
                      )
                    );
                  } else if (eventType === "tool_call_step") {
                    // Update the specific tool call with step information
                    // Accumulate steps in an array to preserve history
                    const { toolCallId, step } = parsed;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              toolCalls: msg.toolCalls?.map((tc) =>
                                tc.id === toolCallId
                                  ? {
                                      ...tc,
                                      step, // Keep current step for backward compatibility
                                      steps: [...(tc.steps || []), step], // Accumulate all steps
                                    }
                                  : tc
                              ),
                            }
                          : msg
                      )
                    );
                  } else if (eventType === "tool_call_complete") {
                    const toolCall = parsed.toolCall as ToolInvocation;
                    // Update the tool call in the list
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              toolCalls: msg.toolCalls?.map((tc) =>
                                tc.id === toolCall.id ? toolCall : tc
                              ),
                            }
                          : msg
                      )
                    );
                  } else if (eventType === "tool_call_error") {
                    const toolCall = parsed.toolCall as ToolInvocation;
                    // Update the tool call with error
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              toolCalls: msg.toolCalls?.map((tc) =>
                                tc.id === toolCall.id ? toolCall : tc
                              ),
                            }
                          : msg
                      )
                    );
                  } else if (eventType === "final_message") {
                    finalMessage = parsed.message || "";
                    finalSessionId = parsed.sessionId || sessionId;
                    // Store characterId if provided (for new sessions)
                    if (parsed.characterId) {
                      setSessionCharacterId(parsed.characterId as CharacterId);
                    }
                    // Store acontextDiskId if provided
                    if (parsed.acontextDiskId) {
                      setAcontextDiskId(parsed.acontextDiskId);
                    }
                    // Update token counts if provided
                    if (parsed.tokenCounts) {
                      setTokenCounts(parsed.tokenCounts);
                    }
                    // Update buffer with final message and ensure it's fully displayed
                    typewriterBufferRef.current.set(assistantMessageId, finalMessage);
                    // Start typewriter to display final message (or complete if already displayed)
                    startTypewriter(assistantMessageId, finalMessage);
                    // Also update tool calls immediately
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              toolCalls: parsed.toolCalls || msg.toolCalls,
                            }
                          : msg
                      )
                    );
                  } else if (eventType === "error") {
                    // Display error to user but don't interrupt the stream
                    // Backend should have already sent tool messages for failed tool calls
                    const errorMsg = parsed.error || "Stream error";
                    console.error("[ChatbotPanel] Stream error:", errorMsg);
                    setError(errorMsg);
                    // Continue processing - don't throw to allow stream to complete
                  }
                } catch (e) {
                  console.error("Failed to parse SSE data:", e);
                }
              }
              eventType = "message";
              data = "";
            }
          }
        }

        // Set session ID if this is the first message
        if (!sessionId && finalSessionId) {
          setSessionId(finalSessionId);
          // Clear selectedCharacterForNewSession since session is now created
          setSelectedCharacterForNewSession(null);

          // Refresh sessions list so that the new session appears in the sidebar
          if (fullPage) {
            (async () => {
              try {
                const res = await fetch("/api/chat-sessions");
                if (!res.ok) return;
                const data = await res.json();
                const refreshedSessions = data.sessions ?? [];
                setSessions(refreshedSessions);
                
                // Update acontextDiskId and characterId from refreshed session if available
                const refreshedSession = refreshedSessions.find((s: ChatSession) => s.id === finalSessionId);
                if (refreshedSession?.acontextDiskId) {
                  setAcontextDiskId(refreshedSession.acontextDiskId);
                }
                if (refreshedSession?.characterId) {
                  setSessionCharacterId(refreshedSession.characterId as CharacterId);
                }
              } catch (err) {
                console.error("Failed to refresh sessions", err);
              }
            })();
          }
        }
      } else {
        // Handle non-streaming response (fallback)
        const data: ChatResponse = await response.json();

        // Set session ID if this is the first message
        if (!sessionId && data.sessionId) {
          setSessionId(data.sessionId);
          // Clear selectedCharacterForNewSession since session is now created
          setSelectedCharacterForNewSession(null);
          // Set locked characterId if provided
          if (data.characterId) {
            setSessionCharacterId(data.characterId as CharacterId);
          }
        }
        
        // Store acontextDiskId if provided
        if (data.acontextDiskId) {
          setAcontextDiskId(data.acontextDiskId);
        }
        // Update token counts if provided
        if (data.tokenCounts) {
          setTokenCounts(data.tokenCounts);
        }

          // Refresh sessions list so that the new session appears in the sidebar
          if (fullPage) {
            (async () => {
              try {
                const res = await fetch("/api/chat-sessions");
                if (!res.ok) return;
              const sessionData = await res.json();
              const refreshedSessions = sessionData.sessions ?? [];
              setSessions(refreshedSessions);
              
              // Update acontextDiskId from refreshed session if available
              if (data.sessionId) {
                const refreshedSession = refreshedSessions.find((s: ChatSession) => s.id === data.sessionId);
                if (refreshedSession?.acontextDiskId) {
                  setAcontextDiskId(refreshedSession.acontextDiskId);
                }
              }
              } catch (err) {
                console.error("Failed to refresh sessions", err);
              }
            })();
        }

        // Add assistant response
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.message,
          toolCalls: data.toolCalls,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);

      // Remove the user message on error so user can retry
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Floating widget mode (used on generic pages)
  if (!fullPage) {
    if (!isOpen) {
      return (
        <div className={className}>
          <Button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg sm:bottom-6 sm:right-6"
            size="icon"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        </div>
      );
    }

    return (
      <div className={className}>
        <Card className="fixed bottom-4 left-1/2 z-50 flex h-[70vh] w-full max-w-md -translate-x-1/2 flex-col shadow-xl sm:bottom-6 sm:right-6 sm:left-auto sm:translate-x-0 sm:h-[600px] sm:w-96">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>Chatbot</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <div
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  tokenUsage === null
                    ? "border-border text-muted-foreground"
                    : isTokenCritical
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : isTokenWarning
                    ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                    : "border-primary/60 bg-primary/10 text-primary"
                }`}
              >
                {tokenUsage === null
                  ? "Tokens pending"
                  : `${tokenUsage.toLocaleString()} tokens`}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleManualCompress}
                disabled={!sessionId || isCompressing}
                className="h-8 px-3 text-xs"
              >
                {isCompressing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Compress"}
              </Button>
            </div>
            {isTokenWarning && (
              <div className={`flex items-center gap-1 text-xs ${
                isTokenCritical ? "text-destructive" : "text-yellow-600 dark:text-yellow-400"
              }`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Context approaching limit, consider compressing</span>
              </div>
            )}
            {/* Messages area */}
            <div className="scrollbar-subtle flex-1 overflow-y-auto space-y-4 pr-2">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[80%] text-sm leading-snug text-foreground relative z-10">
                      {renderMessageContent(message.content, acontextDiskId)}
                    </div>
                  ) : (
                  <div className="max-w-[80%] rounded-xl px-4 py-2.5 shadow-sm relative overflow-hidden bg-muted border-l-4 border-primary/30">
                    {message.toolCalls && message.toolCalls.length > 0 && (
                      <ToolCallsDisplay toolCalls={message.toolCalls} isFullPage={false} />
                    )}
                    <div className="chat-message-body text-sm leading-snug relative z-10">
                      {renderMessageContent(message.content, acontextDiskId)}
                    </div>
                    {index === messages.length - 1 && isLoading && (
                      <div className="text-sm flex items-center gap-2 mt-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-muted-foreground">Processing...</span>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ))}
              {isLoading && !loadingSessionId && (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant") && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-4 py-2.5 border-l-4 border-primary/30 shadow-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-muted-foreground">Processing...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error message */}
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {error}
              </div>
            )}

            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-lg border-2 border-primary/40 bg-muted px-3 py-1.5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    {attachment.isTextFile ? (
                      <FileText className="h-3 w-3 text-primary" />
                    ) : (
                    <File className="h-3 w-3 text-primary" />
                    )}
                    <span className="text-xs">
                      {attachment.filename}
                      {attachment.isTextFile && (
                        <span className="ml-1 text-muted-foreground">(read)</span>
                      )}
                    </span>
                    <button
                      onClick={() => handleRemoveAttachment(index)}
                      className="text-primary hover:text-primary/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input area */}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="*/*"
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                size="icon"
                variant="ghost"
                disabled={isLoading}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={(!input.trim() && attachments.length === 0) || isLoading}
                size="icon"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Full-page chat layout (used on /protected) - Futuristic style
  return (
    <div
      className={`relative flex h-full w-full min-h-0 overflow-hidden bg-background text-foreground ${className ?? ""}`}
    >
      {/* Left strip — always show when left sidebar not visible (md+ closed, or mobile). Click opens sidebar (md+) or drawer (mobile). */}
      {(!isMd || !leftSidebarOpen) && (
        <div
          className={cn(
            "flex h-full w-10 flex-shrink-0 flex-col items-center justify-center border-r border-border/80 bg-card transition-colors",
            "hover:bg-muted/50 hover:border-primary/30"
          )}
        >
          <button
            type="button"
            onClick={() => (isMd ? setLeftSidebarOpen(true) : setLeftDrawerOpen(true))}
            className="flex h-full w-full items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            aria-label="打开会话列表"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Session list (left sidebar) — md+ and open */}
      {isMd && leftSidebarOpen && (
        <aside className="relative flex h-full w-64 flex-shrink-0 flex-col justify-between border-r bg-card px-4 py-3">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-xs font-medium text-muted-foreground">Sessions</span>
              <button
                type="button"
                onClick={() => setLeftSidebarOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="收起会话列表"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div
              ref={sessionListRef}
              className="flex-1 space-y-4 overflow-y-auto pr-1"
            >
          <Button
            className="w-full justify-start gap-2" 
            variant="outline"
            type="button"
            onClick={handleNewSession}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Session</span>
          </Button>
          <div className="space-y-3">
            <div className="px-1 text-xs text-muted-foreground">
              Session History
            </div>
            <div className="space-y-1.5">
              {isSessionsLoading && (
                <div className="px-1 text-xs text-muted-foreground">
                  Loading sessions...
                </div>
              )}
              {!isSessionsLoading && sessions.length === 0 && (
                <div className="px-1 text-xs text-muted-foreground">
                  No sessions yet. Start a new conversation.
                </div>
              )}
              {sessions.map((s) => {
                const isActive = s.id === sessionId;
                const createdAt =
                  typeof s.createdAt === "string"
                    ? new Date(s.createdAt)
                    : s.createdAt;
                const isDeleting = deletingSessionId === s.id;
                const sessionCharacter = s.characterId 
                  ? characters.find((c) => c.id === s.characterId)
                  : null;
                return (
                  <div
                    key={s.id}
                    data-session-id={s.id}
                    className={`group flex w-full items-start gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    {/* Character avatar */}
                    {sessionCharacter ? (
                      <div className="flex-shrink-0">
                        <div className="relative w-14 h-14 rounded-full border-2 border-primary/30 overflow-hidden bg-card ring-1 ring-primary/10">
                          <Image
                            src={sessionCharacter.chatbotAvatarPath}
                            alt={sessionCharacter.name}
                            fill
                            className="object-cover object-[center_5%]"
                            sizes="56px"
                            quality={95}
                            priority={isActive}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-14 h-14 rounded-full border border-border bg-muted flex items-center justify-center">
                        <MessageCircle className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Session info */}
                    <button
                      type="button"
                      onClick={() => handleLoadSessionMessages(s.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="mb-1 line-clamp-2 text-xs font-medium text-foreground">
                        {s.title || "Untitled Session"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {createdAt instanceof Date
                          ? createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : String(createdAt)}
                      </div>
                    </button>
                    
                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(s.id);
                      }}
                      className="flex-shrink-0 mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground opacity-0 transition-all hover:border-destructive hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete session"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
            </div>
          </div>
        </aside>
      )}

      {/* Status / Session ID block - temporarily hidden per request */}
      {/* <div className="mt-4 space-y-2 rounded-lg border bg-card px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-slow" />
              <span className="font-medium">Online</span>
            </span>
          </div>
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-xs text-muted-foreground">Session ID</span>
            <span className="text-xs font-mono text-primary break-all text-right">
              {sessionId ? sessionId.slice(0, 8) + "..." : "pending..."}
            </span>
          </div>
        </div> */}

      {/* Main chat area */}
      <section className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col items-center px-4 py-2 md:px-8 md:py-3">
        <div className="flex h-full w-full max-w-8xl flex-1 flex-col gap-3 rounded-lg border bg-card px-3 pb-3 pt-2 sm:gap-4 sm:px-8 sm:pb-6 sm:pt-4 md:px-10 md:pt-5">
          {/* Top bar */}
          <div className="flex flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 border-2 border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary rounded-full shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-slow" />
                  <span className="font-medium">Active Session</span>
                </div>
                {sessionCharacterId && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground bg-muted rounded-full">
                    <span className="text-primary/80">Character:</span>
                    <span className="font-medium">{characters.find((c) => c.id === sessionCharacterId)?.name || sessionCharacterId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Controls - mobile layout */}
            <div className="flex w-full items-center gap-1 overflow-x-auto pb-1 md:hidden">
              <div
                className={`flex items-center rounded-full border px-2 py-1 text-[10px] ${
                  tokenUsage === null
                    ? "border-border bg-muted text-muted-foreground"
                    : isTokenCritical
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : isTokenWarning
                    ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                    : "border-primary/60 bg-primary/10 text-primary"
                }`}
              >
                {tokenUsage === null
                  ? "Tokens"
                  : tokenUsage.toLocaleString()}
              </div>

              {isTokenWarning && (
                <div
                  className={`flex items-center gap-1 text-[10px] ${
                    isTokenCritical
                      ? "text-destructive"
                      : "text-yellow-600 dark:text-yellow-400"
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleManualCompress}
                disabled={!sessionId || isCompressing}
                className="h-8 w-8 flex-shrink-0 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
              >
                {isCompressing ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <span className="text-[10px] text-primary">C</span>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setIsToolsModalOpen(true)}
                disabled={toolsError !== null}
                className="h-8 w-8 flex-shrink-0 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
              >
                <Wrench className="h-3 w-3 text-primary" />
              </Button>

              {!isMd && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setLeftDrawerOpen(true)}
                    className="h-8 w-8 flex-shrink-0 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
                    aria-label="打开会话列表"
                  >
                    <LayoutList className="h-3 w-3 text-primary" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setRightDrawerOpen(true)}
                    className="h-8 w-8 flex-shrink-0 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
                    aria-label="打开幻灯片列表"
                  >
                    <Images className="h-3 w-3 text-primary" />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleOpenFilesModal}
                className="h-8 w-8 flex-shrink-0 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
              >
                <FolderOpen className="h-3 w-3 text-primary" />
              </Button>
            </div>

            {/* Controls - desktop / tablet layout */}
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {!isLg && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRightDrawerOpen(true)}
                  className="text-xs h-7 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200 inline-flex items-center gap-1.5"
                  aria-label="打开幻灯片列表"
                >
                  <Images className="h-3.5 w-3.5 text-primary" />
                  <span className="text-primary">Slides</span>
                </Button>
              )}
              {/* Sample prompts (Describe monitoring scenario, Provide context) - hidden to save space */}
              {/* {messages.length === 0 && (
                <>
                  <button
                    type="button"
                    className="border-2 border-primary/30 bg-card px-2 py-1 rounded-lg text-xs transition-all duration-200 hover:bg-primary/10 hover:border-primary/50 hover:shadow-sm font-medium"
                    onClick={() =>
                      setInput("Help me track the latest releases and funding rounds of several AI companies.")
                    }
                  >
                    Describe monitoring scenario
                  </button>
                  <button
                    type="button"
                    className="border-2 border-primary/30 bg-card px-2 py-1 rounded-lg text-xs transition-all duration-200 hover:bg-primary/10 hover:border-primary/50 hover:shadow-sm font-medium"
                    onClick={() =>
                      setInput("Check this requirements document for ambiguities and summarize the risks.")
                    }
                  >
                    Provide context
                  </button>
                </>
              )} */}

              <div
                className={`rounded-full border px-2 py-1 text-xs ${
                  tokenUsage === null
                    ? "border-border bg-muted text-muted-foreground"
                    : isTokenCritical
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : isTokenWarning
                    ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                    : "border-primary/60 bg-primary/10 text-primary"
                }`}
              >
                {tokenUsage === null
                  ? "Tokens: pending"
                  : `Tokens: ${tokenUsage.toLocaleString()}`}
              </div>
              
              {isTokenWarning && (
                <div className={`flex items-center gap-1 text-xs ${
                  isTokenCritical ? "text-destructive" : "text-yellow-600 dark:text-yellow-400"
                }`}>
                  <AlertTriangle className="h-3 w-3" />
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleManualCompress}
                disabled={!sessionId || isCompressing}
                className="text-xs h-7 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
              >
                {isCompressing ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <span className="text-primary">Compress</span>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsToolsModalOpen(true)}
                disabled={toolsError !== null}
                className="text-xs h-7 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
              >
                <Wrench className="h-3 w-3 text-primary" />
                <span className="text-primary">
                  {toolsError ? "Tools Unavailable" : `Tools ${totalTools || 0}`}
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenFilesModal}
                className="text-xs h-7 border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
              >
                <FolderOpen className="h-3 w-3 text-primary" />
                <span className="text-primary">Files</span>
              </Button>
            </div>
          </div>

          {/* Messages area */}
          <div className="scrollbar-subtle flex min-h-0 min-w-0 flex-1 flex-col space-y-3 overflow-y-auto pr-1 sm:space-y-4 sm:pr-2">
            {/* Loading session indicator */}
            {loadingSessionId && (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <div className="absolute inset-0 h-12 w-12 animate-ping text-primary/20">
                      <Loader2 className="h-full w-full" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl font-semibold animate-pulse">Loading session</span>
                    <span className="flex gap-1">
                      <span className="inline-block w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="inline-block w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="inline-block w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              </div>
            )}
            {/* Character selection embedded in message area */}
            {messages.length === 0 && !sessionId && showCharacterSelectModal && !loadingSessionId && (
              <div className="flex-1 flex flex-col items-center justify-center py-6 px-4 min-h-0">
                <div className="w-full max-w-5xl">
                  <div className="text-center mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold mb-2">Choose Your AI Designer</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Select a character for this new session</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                    {characters.map((char) => {
                      const isSelected = selectedCharacterForNewSession === char.id;
                      return (
                        <button
                          key={char.id}
                          onClick={() => handleSelectCharacterForNewSession(char.id)}
                          className={`group relative rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                            isSelected
                              ? "border-primary shadow-lg scale-105"
                              : "border-border hover:border-primary/50 hover:shadow-md"
                          }`}
                        >
                          <div className="aspect-square relative bg-card/80 backdrop-blur-sm">
                            <Image
                              src={char.avatarPath}
                              alt={char.name}
                              fill
                              className="object-cover object-[center_5%] [filter:drop-shadow(0_0_1px_rgba(0,0,0,0.85))_drop-shadow(0_0_10px_rgba(0,0,0,0.25))]"
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                              quality={95}
                            />
                            <div className="pointer-events-none absolute inset-0 bg-black/10" />
                            {isSelected && (
                              <div className="pointer-events-none absolute inset-0 bg-primary/10" />
                            )}
                          </div>
                          <div className="p-2.5 sm:p-3">
                            <h3 className="font-semibold text-xs sm:text-sm mb-1">{char.name}</h3>
                            <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 leading-relaxed">{char.tagline}</p>
                            {isSelected && (
                              <Badge variant="default" className="mt-1.5 text-[10px] px-1.5 py-0.5">
                                Selected
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 sm:gap-3 animate-message-in ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {message.role === "assistant" && (
                  <div className="flex flex-col items-center gap-1 sm:gap-1.5 flex-shrink-0">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24">
                      <div className="relative w-full h-full rounded-full border-[2px] sm:border-[3px] border-primary/40 shadow-md overflow-hidden bg-card ring-1 sm:ring-2 ring-primary/10">
                        <AnimatedAvatar
                          src={avatarSrc}
                          alt={assistantName}
                          sizes="(max-width: 640px) 48px, (max-width: 768px) 64px, (max-width: 1024px) 80px, 96px"
                          priority
                        />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-primary/80 text-center leading-tight line-clamp-2 w-12 sm:w-16 md:w-20 lg:w-24">
                      {effectiveCharacter.name}
                    </span>
                  </div>
                )}
                {message.role === "user" ? (
                  <div className="max-w-[85%] sm:max-w-[80%] text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words text-foreground" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    <div className="chat-message-body text-sm leading-snug">
                      {renderMessageContent(message.content, acontextDiskId)}
                    </div>
                  </div>
                ) : (
                <div className="max-w-[85%] sm:max-w-[80%] rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed border-l-4 border-primary/30 bg-card shadow-sm relative overflow-hidden break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <ToolCallsDisplay
                      toolCalls={message.toolCalls}
                      isFullPage={true}
                    />
                  )}
                  <div className="chat-message-body text-sm leading-snug">
                    {renderMessageContent(message.content, acontextDiskId)}
                  </div>
                  {index === messages.length - 1 && isLoading && (
                    <div className="text-sm leading-relaxed flex items-center gap-2 mt-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-muted-foreground">Processing...</span>
                    </div>
                  )}
                </div>
                )}
              </div>
            ))}
            {isLoading && !loadingSessionId && (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant") && (
              <div className="flex justify-start items-start gap-2 sm:gap-3 animate-fade-in">
                <div className="flex flex-col items-center gap-1 sm:gap-1.5 flex-shrink-0">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24">
                    <div className="relative w-full h-full rounded-full border-[2px] sm:border-[3px] border-primary/40 shadow-md overflow-hidden bg-card ring-1 sm:ring-2 ring-primary/10 animate-fade-in">
                      <AnimatedAvatar
                        src={avatarSrc}
                        alt={assistantName}
                        sizes="(max-width: 640px) 48px, (max-width: 768px) 64px, (max-width: 1024px) 80px, 96px"
                        priority
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-primary/80 text-center leading-tight line-clamp-2 w-12 sm:w-16 md:w-20 lg:w-24">
                    {effectiveCharacter.name}
                  </span>
                </div>
                <div className="max-w-[85%] sm:max-w-[80%] rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed border-l-4 border-primary/30 bg-card shadow-sm relative overflow-hidden break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/60 to-primary/20 animate-pulse-slow" />
                  <div className="text-sm leading-relaxed flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-muted-foreground">Processing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="text-xs font-semibold mb-1">Error</div>
              <div>{error}</div>
            </div>
          )}

          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-lg border-2 border-primary/40 bg-card px-3 py-1.5 shadow-sm hover:shadow-md transition-shadow"
                  >
                  {attachment.isTextFile ? (
                    <FileText className="h-3 w-3 text-primary" />
                  ) : (
                  <File className="h-3 w-3 text-primary" />
                  )}
                  <span className="text-xs text-foreground">
                    {attachment.filename}
                    {attachment.isTextFile && (
                      <span className="ml-1 text-muted-foreground">(read)</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleRemoveAttachment(index)}
                    className="text-primary hover:text-primary/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="mt-2 flex items-center gap-2 sm:gap-3 rounded-xl border-2 border-primary/20 bg-card px-3 py-2 sm:px-4 sm:py-3 shadow-sm hover:border-primary/40 transition-all duration-200 focus-within:border-primary/60 focus-within:shadow-md">
            {/* Sample prompts (Monitor AI companies, Analyze requirements context) - hidden to save space */}
            {/* {messages.length === 0 && (
              <div className="hidden flex-wrap gap-2 text-xs text-muted-foreground md:flex">
                <button
                  type="button"
                  className="border-2 border-primary/30 bg-card px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-primary/10 hover:border-primary/50 hover:shadow-sm text-xs font-medium"
                  onClick={() =>
                    setInput("Help me track the latest releases and funding rounds of several AI companies.")
                  }
                >
                  Monitor AI companies
                </button>
                <button
                  type="button"
                  className="border-2 border-primary/30 bg-card px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-primary/10 hover:border-primary/50 hover:shadow-sm text-xs font-medium"
                  onClick={() =>
                    setInput("Check this requirements document for ambiguities and summarize the risks.")
                  }
                >
                  Analyze requirements context
                </button>
              </div>
            )} */}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="*/*"
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              size="icon"
              variant="ghost"
              disabled={isLoading}
              className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-all duration-200"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Send a message or describe the scenario you want to monitor..."
              disabled={isLoading}
              className="flex-1 border-0 focus-visible:ring-2 focus-visible:ring-primary/30 bg-transparent"
            />
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
              size="icon"
              className="h-10 w-10 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Files modal — rendered via Portal so overlay covers Slides sidebar */}
        {isFilesModalOpen && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setIsFilesModalOpen(false)} role="presentation">
            <div
              className="relative max-h-[82vh] w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-lg"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="files-modal-title"
            >
              <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4 sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-primary" />
                    <span id="files-modal-title" className="text-lg font-semibold">
                      Acontext Disk Files
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Files stored in Acontext Disk
                  </div>
                </div>

                <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
                  {selectedFiles.length > 0 && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleBatchDownload}
                      disabled={isBatchDownloading}
                      className="text-xs"
                    >
                      {isBatchDownloading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                          Download ({selectedFiles.length})
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLoadFiles}
                    disabled={isFilesLoading}
                    className="text-xs"
                  >
                    {isFilesLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span>Refresh</span>
                    )}
                  </Button>
                  <div className="rounded-lg border bg-muted px-3 py-1.5 text-xs">
                    {files.length} files
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsFilesModalOpen(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto px-6 py-4">
                {filesError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3.5 py-2.5">
                    <div className="text-sm text-destructive">
                      Failed to load files: {filesError}
                    </div>
                  </div>
                )}

                {isFilesLoading && files.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-3 text-sm text-muted-foreground">
                      Loading files...
                    </span>
                  </div>
                )}

                {!isFilesLoading && !filesError && files.length === 0 && (
                  <div className="py-12 text-center">
                    <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
                    <div className="text-sm text-muted-foreground">
                      No files found in Acontext Disk
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Upload files using the attachment button to see them here
                    </div>
                  </div>
                )}

                {!isFilesLoading && !filesError && files.length > 0 && (
                  <div className="mb-3 flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={files.filter(f => {
                          const { isImage } = detectFileType(f.filename, f.mimeType);
                          if (!isImage) return false;
                          const key = f.id || f.path || f.filename || "";
                          return selectedFiles.includes(key);
                        }).length === files.filter(f => {
                          const { isImage } = detectFileType(f.filename, f.mimeType);
                          return isImage;
                        }).length && files.filter(f => {
                          const { isImage } = detectFileType(f.filename, f.mimeType);
                          return isImage;
                        }).length > 0}
                        onCheckedChange={handleSelectAllImages}
                        id="select-all-images"
                      />
                      <label
                        htmlFor="select-all-images"
                        className="text-sm font-medium cursor-pointer"
                      >
                        Select all images
                      </label>
                    </div>
                    {selectedFiles.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {selectedFiles.length} selected
                      </div>
                    )}
                  </div>
                )}

                {files.map((file, index) => {
                  const fileKey = file.id || file.path || file.filename || String(index);
                  const preview = filePreviews.get(fileKey);
                  const mimeType = file.mimeType || "";
                  const { isImage, isText } = detectFileType(file.filename, mimeType);
                  const isPreviewable = isImage || isText;
                  
                  // Determine preview display type based on preview's MIME type or file type
                  const previewMimeType = preview?.mimeType || mimeType;
                  const previewIsImage = previewMimeType.startsWith("image/") || 
                                        (preview && detectFileType(file.filename, previewMimeType).isImage);
                  const previewIsText = previewMimeType.startsWith("text/") || 
                                       previewMimeType === "application/json" ||
                                       previewMimeType === "application/javascript" ||
                                       previewMimeType === "application/xml" ||
                                       previewMimeType === "application/x-sh" ||
                                       previewMimeType === "application/x-yaml" ||
                                       previewMimeType === "application/yaml" ||
                                       (preview && detectFileType(file.filename, previewMimeType).isText);

                  const isSelected = selectedFiles.includes(fileKey);
                  const selectionOrder = isSelected ? selectedFiles.indexOf(fileKey) + 1 : null;

                  return (
                  <div
                    key={fileKey}
                    className={`group rounded-xl border bg-card p-4 space-y-2.5 ${
                        isSelected ? "ring-2 ring-primary" : ""
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isImage && (
                          <>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleFileSelection(fileKey)}
                              id={`select-${fileKey}`}
                            />
                            {selectionOrder && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground flex-shrink-0">
                                {selectionOrder}
                              </span>
                            )}
                          </>
                        )}
                        <File className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {file.filename || file.path || "Unknown file"}
                        </span>
                      </div>
                        <div
                          className={cn(
                            "flex items-center gap-2",
                            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 [@media(hover:none)]:opacity-100"
                          )}
                        >
                        {(preview?.publicUrl || filePublicUrls.get(fileKey)) && (
                          <a
                            href={preview?.publicUrl || filePublicUrls.get(fileKey)}
                            download={file.filename || file.path || "download"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-md border bg-background px-2 py-1 text-xs font-medium text-primary shadow-sm hover:bg-accent hover:text-accent-foreground"
                          >
                            <Download className="mr-1 h-3 w-3" />
                            Download
                          </a>
                        )}
                          <button
                            onClick={() => handleDeleteFile(file)}
                            disabled={deletingFileKeys.has(fileKey)}
                            className="inline-flex items-center rounded-md border border-destructive/50 bg-background px-2 py-1 text-xs font-medium text-destructive shadow-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete file"
                          >
                            {deletingFileKeys.has(fileKey) ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3 w-3" />
                            )}
                            Delete
                          </button>
                        </div>
                    </div>

                      {/* Preview Section */}
                      {preview && (
                        <div className="mt-3 border-t pt-3">
                          {preview.isLoading && (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              <span className="ml-2 text-xs text-muted-foreground">
                                Loading preview...
                              </span>
                            </div>
                          )}
                          {preview.error && (
                            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2">
                              <div className="text-xs text-destructive">
                                Preview error: {preview.error}
                              </div>
                            </div>
                          )}
                          {!preview.isLoading && !preview.error && preview.content && (
                            <>
                              {previewIsImage && (() => {
                                // If content is a URL (publicUrl), use it directly
                                if (preview.isUrl) {
                                  return (
                                    <div className="rounded-lg border bg-muted overflow-hidden">
                                      <img
                                        src={preview.content}
                                        alt={file.filename || "Preview"}
                                        className="w-full h-auto max-h-64 object-contain"
                                        onError={(e) => {
                                          console.error("[UI] Failed to load image preview from URL", {
                                            fileKey,
                                            filename: file.filename,
                                            url: preview.content,
                                            mimeType: previewMimeType,
                                          });
                                          e.currentTarget.style.display = "none";
                                        }}
                                        onLoad={() => {
                                          console.debug("[UI] Image preview loaded successfully from URL", {
                                            fileKey,
                                            filename: file.filename,
                                            mimeType: previewMimeType,
                                          });
                                        }}
                                      />
                                    </div>
                                  );
                                }
                                
                                // Otherwise, treat as base64 content
                                // Clean base64 string: remove whitespace and ensure it's valid
                                let base64Content = preview.content;
                                if (typeof base64Content === 'string') {
                                  // Remove any whitespace characters (spaces, newlines, etc.)
                                  base64Content = base64Content.replace(/\s/g, '');
                                }
                                
                                // Validate base64 format
                                const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
                                const isValidBase64 = base64Regex.test(base64Content);
                                
                                if (!isValidBase64) {
                                  console.error("[UI] Invalid base64 content for image preview", {
                                    fileKey,
                                    filename: file.filename,
                                    mimeType: previewMimeType,
                                    contentLength: base64Content.length,
                                    contentPreview: base64Content.substring(0, 50),
                                  });
                                }
                                
                                const dataUrl = `data:${previewMimeType};base64,${base64Content}`;
                                
                                return (
                                  <div className="rounded-lg border bg-muted overflow-hidden">
                                    <img
                                      src={dataUrl}
                                      alt={file.filename || "Preview"}
                                      className="w-full h-auto max-h-64 object-contain"
                                      onError={(e) => {
                                        console.error("[UI] Failed to load image preview", {
                                          fileKey,
                                          filename: file.filename,
                                          mimeType: previewMimeType,
                                          contentLength: base64Content.length,
                                          isValidBase64,
                                          dataUrlPreview: dataUrl.substring(0, 100),
                                        });
                                        e.currentTarget.style.display = "none";
                                      }}
                                      onLoad={() => {
                                        console.debug("[UI] Image preview loaded successfully", {
                                          fileKey,
                                          filename: file.filename,
                                          mimeType: previewMimeType,
                                        });
                                      }}
                                    />
                                  </div>
                                );
                              })()}
                              {previewIsText && !previewIsImage && (
                                <div className="rounded-lg border bg-muted p-3 max-h-64 overflow-auto">
                                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                                    {preview.content.length > 2000
                                      ? preview.content.substring(0, 2000) + "\n\n... (truncated)"
                                      : preview.content}
                                  </pre>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {file.mimeType && (
                        <div>
                          <span className="text-xs text-muted-foreground">
                            Type
                          </span>
                          <div className="text-sm mt-1 font-mono">
                            {file.mimeType}
                          </div>
                        </div>
                      )}
                      {file.size !== undefined && (
                        <div>
                          <span className="text-xs text-muted-foreground">
                            Size
                          </span>
                          <div className="text-sm mt-1 font-mono">
                            {file.size > 1024 * 1024
                              ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                              : file.size > 1024
                              ? `${(file.size / 1024).toFixed(2)} KB`
                              : `${file.size} bytes`}
                          </div>
                        </div>
                      )}
                      {file.createdAt && (
                        <div className="col-span-2">
                          <span className="text-xs text-muted-foreground">
                            Created
                          </span>
                          <div className="text-sm mt-1">
                            {new Date(file.createdAt).toLocaleString()}
                          </div>
                        </div>
                      )}
                      {file.path && (
                        <div className="col-span-2">
                          <span className="text-xs text-muted-foreground">
                            Path
                          </span>
                          <div className="text-xs font-mono mt-1 break-all">
                            {file.path}
                          </div>
                        </div>
                      )}
                        {(preview?.publicUrl || filePublicUrls.get(fileKey)) && (
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground">
                              Public URL
                            </span>
                            <div className="mt-1">
                              <a
                                href={preview?.publicUrl || filePublicUrls.get(fileKey)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                              >
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{preview?.publicUrl || filePublicUrls.get(fileKey)}</span>
                              </a>
                    </div>
                  </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Tools modal — rendered via Portal so overlay covers Slides sidebar */}
        {isToolsModalOpen && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setIsToolsModalOpen(false)} role="presentation">
            <div
              className="relative max-h-[82vh] w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-lg"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tools-modal-title"
            >
              <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4 sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" />
                    <span id="tools-modal-title" className="text-lg font-semibold">
                      Available Tools
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Tools that the model can call in this session
                  </div>
                </div>

                <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
                  <div className="rounded-lg border bg-muted px-3 py-1.5 text-xs">
                    Registered {totalTools || 0}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsToolsModalOpen(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto px-6 py-4">
                {toolsError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3.5 py-2.5">
                    <div className="text-sm text-destructive">
                      Failed to load tools: {toolsError}
                    </div>
                  </div>
                )}

                {!toolsError && availableTools.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No tools are registered.
                  </div>
                )}

                {availableTools.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-xl border bg-card p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="text-sm font-semibold">
                          {tool.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                          Registered
                        </span>
                      </div>
                    </div>

                    <div className="text-sm leading-relaxed">
                      {tool.description || "No description"}
                    </div>

                    {tool.parameters.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="text-xs text-muted-foreground">
                          Parameters ({tool.parameters.length})
                        </div>
                        {tool.parameters.map((param) => (
                          <div
                            key={`${tool.name}-${param.name}`}
                            className="rounded-lg border bg-muted/50 px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                {param.name}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {param.type}
                                {param.required ? " • required" : ""}
                              </span>
                            </div>
                            {param.description && (
                              <div className="mt-1 text-sm leading-relaxed">
                                {param.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      </section>

      {/* Right strip — always show when right sidebar not visible (lg+ closed, or tablet/mobile). Click opens sidebar (lg+) or drawer (tablet/mobile). */}
      {(!isLg || !rightSidebarOpen) && (
        <div
          className={cn(
            "flex h-full w-10 flex-shrink-0 flex-col items-center justify-center border-l border-border/80 bg-card transition-colors",
            "hover:bg-muted/50 hover:border-primary/30"
          )}
        >
          <button
            type="button"
            onClick={() => (isLg ? setRightSidebarOpen(true) : setRightDrawerOpen(true))}
            className="flex h-full w-full items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            aria-label="打开幻灯片列表"
          >
            <PanelRightOpen className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Right side: Slides sidebar — lg+ and open */}
      {isLg && rightSidebarOpen && (
        <aside className="relative flex h-full w-64 flex-shrink-0 flex-col border-l bg-card px-4 py-3">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-sm font-semibold text-foreground">Slides</span>
              <button
                type="button"
                onClick={() => setRightSidebarOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="收起幻灯片列表"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-subtle flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="sticky top-0 bg-card pb-2 z-10 space-y-3">
            <div className="text-xs text-muted-foreground">
              {files.filter(f => {
                const { isImage } = detectFileType(f.filename, f.mimeType);
                return isImage;
              }).length} slide{files.filter(f => {
                const { isImage } = detectFileType(f.filename, f.mimeType);
                return isImage;
              }).length !== 1 ? 's' : ''}
            </div>
            {/* Select all and Download PPT buttons */}
            {files.filter(f => {
              const { isImage } = detectFileType(f.filename, f.mimeType);
              return isImage;
            }).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={files.filter(f => {
                      const { isImage } = detectFileType(f.filename, f.mimeType);
                      return isImage;
                    }).every(f => {
                      const key = f.id || f.path || f.filename || "";
                      return key === "" || selectedFiles.includes(key);
                    }) && files.filter(f => {
                      const { isImage } = detectFileType(f.filename, f.mimeType);
                      return isImage;
                    }).length > 0}
                    onCheckedChange={handleSelectAllImages}
                    id="select-all-images-sidebar"
                  />
                  <label
                    htmlFor="select-all-images-sidebar"
                    className="text-xs font-medium cursor-pointer"
                  >
                    Select all
                  </label>
                </div>
                <Button
                  onClick={handleBatchDownload}
                  disabled={isBatchDownloading || selectedFiles.length === 0}
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                >
                  {isBatchDownloading ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="mr-1 h-3 w-3" />
                      Download ({selectedFiles.length}) PPT
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {isFilesLoading && files.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="ml-2 text-xs text-muted-foreground">
                Loading slides...
              </span>
            </div>
          )}

          {filesError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2">
              <div className="text-xs text-destructive">
                Failed to load: {filesError}
              </div>
            </div>
          )}

          {!isFilesLoading && !filesError && files.filter(f => {
            const { isImage } = detectFileType(f.filename, f.mimeType);
            return isImage;
          }).length === 0 && (
            <div className="py-8 text-center">
              <File className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <div className="text-xs text-muted-foreground">
                No slides found
              </div>
            </div>
          )}

          {files
            .filter(file => {
              const { isImage } = detectFileType(file.filename, file.mimeType);
              return isImage;
            })
            .map((file, index) => {
              const fileKey = getFileKey(file, index);
              const preview = filePreviews.get(fileKey);
              const mimeType = file.mimeType || "";
              const { isImage } = detectFileType(file.filename, mimeType);
              
              if (!isImage) return null;

              const previewMimeType = preview?.mimeType || mimeType;
              const previewIsImage = previewMimeType.startsWith("image/") || 
                                    (preview && detectFileType(file.filename, previewMimeType).isImage);

              const isSelected = selectedFiles.includes(fileKey);
              const selectionOrder = isSelected ? selectedFiles.indexOf(fileKey) + 1 : null;

              return (
                <div
                  key={fileKey}
                  className={`group rounded-lg border bg-card p-2 space-y-2 ${
                    isSelected ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleFileSelection(fileKey)}
                      id={`select-sidebar-${fileKey}`}
                    />
                    {selectionOrder && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground flex-shrink-0">
                        {selectionOrder}
                    </span>
                    )}
                    <File className="h-3 w-3 text-primary flex-shrink-0" />
                  </div>

                  <div>
                    {/* Image Preview */}
                    {preview && (
                      <div className="mt-2">
                        {preview.isLoading && (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          </div>
                        )}
                        {preview.error && (
                          <div className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1">
                            <div className="text-xs text-destructive">
                              Error loading preview
                            </div>
                          </div>
                        )}
                        {!preview.isLoading && !preview.error && preview.content && previewIsImage && (
                          <>
                            {preview.isUrl ? (
                              <div className="rounded border bg-muted overflow-hidden">
                                <img
                                  src={preview.content}
                                  alt={file.filename || "Preview"}
                                  className="w-full h-auto max-h-48 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setSelectedImageIndex(index)}
                                  onError={(e) => {
                                    console.error("[UI] Failed to load image preview from URL", {
                                      fileKey,
                                      filename: file.filename,
                                      url: preview.content,
                                    });
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="rounded border bg-muted overflow-hidden">
                                <img
                                  src={`data:${previewMimeType};base64,${preview.content.replace(/\s/g, '')}`}
                                  alt={file.filename || "Preview"}
                                  className="w-full h-auto max-h-48 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setSelectedImageIndex(index)}
                                  onError={(e) => {
                                    console.error("[UI] Failed to load image preview", {
                                      fileKey,
                                      filename: file.filename,
                                    });
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Download and Delete buttons - hover to show on desktop */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 [@media(hover:none)]:opacity-100">
                      {(preview?.publicUrl || filePublicUrls.get(fileKey)) && (
                        <a
                          href={preview?.publicUrl || filePublicUrls.get(fileKey)}
                          download={file.filename || file.path || "download"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center flex-1 rounded-md border bg-background px-2 py-1 text-xs font-medium text-primary shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Download className="mr-1 h-3 w-3" />
                          Download
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteFile(file)}
                        disabled={deletingFileKeys.has(fileKey)}
                        className="inline-flex items-center justify-center rounded-md border border-destructive/50 bg-background px-2 py-1 text-xs font-medium text-destructive shadow-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Delete file"
                      >
                        {deletingFileKeys.has(fileKey) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </aside>
      )}

      {/* Sessions drawer (mobile) */}
      {leftDrawerOpen && !isMd && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="会话列表">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={() => setLeftDrawerOpen(false)}
          />
          <div
            className={cn(
              "absolute left-0 top-0 bottom-0 w-[min(280px,85vw)] bg-card shadow-xl flex flex-col",
              "animate-in slide-in-from-left-5 duration-200"
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <span className="text-sm font-semibold">Sessions</span>
              <button
                type="button"
                onClick={() => setLeftDrawerOpen(false)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-hide flex-1 overflow-y-auto space-y-4 px-4 py-3">
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                type="button"
                onClick={() => { handleNewSession(); setLeftDrawerOpen(false); }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Session</span>
              </Button>
              <div className="space-y-3">
                <div className="px-1 text-xs text-muted-foreground">Session History</div>
                <div className="space-y-1.5">
                  {isSessionsLoading && (
                    <div className="px-1 text-xs text-muted-foreground">Loading sessions...</div>
                  )}
                  {!isSessionsLoading && sessions.length === 0 && (
                    <div className="px-1 text-xs text-muted-foreground">No sessions yet. Start a new conversation.</div>
                  )}
                  {sessions.map((s) => {
                    const isActive = s.id === sessionId;
                    const createdAt = typeof s.createdAt === "string" ? new Date(s.createdAt) : s.createdAt;
                    const isDeleting = deletingSessionId === s.id;
                    const sessionCharacter = s.characterId 
                      ? characters.find((c) => c.id === s.characterId)
                      : null;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "group flex w-full items-start gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition-colors",
                          isActive ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent"
                        )}
                      >
                        {/* Character avatar */}
                        {sessionCharacter ? (
                          <div className="flex-shrink-0">
                            <div className="relative w-14 h-14 rounded-full border-2 border-primary/30 overflow-hidden bg-card ring-1 ring-primary/10">
                              <Image
                                src={sessionCharacter.chatbotAvatarPath}
                                alt={sessionCharacter.name}
                                fill
                                className="object-cover object-[center_5%]"
                                sizes="56px"
                                quality={95}
                                priority={isActive}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex-shrink-0 w-14 h-14 rounded-full border border-border bg-muted flex items-center justify-center">
                            <MessageCircle className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        
                        {/* Session info */}
                        <button
                          type="button"
                          onClick={() => { handleLoadSessionMessages(s.id); setLeftDrawerOpen(false); }}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="mb-1 line-clamp-2 text-xs font-medium text-foreground">{s.title || "Untitled Session"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {createdAt instanceof Date 
                              ? createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : String(createdAt)}
                          </div>
                        </button>
                        
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                          className="flex-shrink-0 mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground opacity-0 transition-all hover:border-destructive hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          aria-label="Delete session"
                        >
                          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slides drawer (tablet + mobile) */}
      {rightDrawerOpen && !isLg && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="幻灯片列表">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={() => setRightDrawerOpen(false)}
          />
          <div
            className={cn(
              "absolute right-0 top-0 bottom-0 w-[min(360px,90vw)] bg-card shadow-xl flex flex-col",
              "animate-in slide-in-from-right-5 duration-200"
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <span className="text-sm font-semibold flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                Slides
              </span>
              <button
                type="button"
                onClick={() => setRightDrawerOpen(false)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-subtle flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <div className="text-xs text-muted-foreground">
                {files.filter(f => { const { isImage } = detectFileType(f.filename, f.mimeType); return isImage; }).length} slide
                {files.filter(f => { const { isImage } = detectFileType(f.filename, f.mimeType); return isImage; }).length !== 1 ? "s" : ""}
              </div>
              {files.filter(f => { const { isImage } = detectFileType(f.filename, f.mimeType); return isImage; }).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={files.filter(f => { const { isImage } = detectFileType(f.filename, f.mimeType); return isImage; }).every(f => {
                        const key = f.id || f.path || f.filename || ""; return key === "" || selectedFiles.includes(key);
                      }) && files.filter(f => { const { isImage } = detectFileType(f.filename, f.mimeType); return isImage; }).length > 0}
                      onCheckedChange={handleSelectAllImages}
                      id="select-all-images-drawer"
                    />
                    <label htmlFor="select-all-images-drawer" className="text-xs font-medium cursor-pointer">Select all</label>
                  </div>
                  <Button onClick={handleBatchDownload} disabled={isBatchDownloading || selectedFiles.length === 0} size="sm" variant="outline" className="w-full text-xs">
                    {isBatchDownloading ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Generating...</> : <><Download className="mr-1 h-3 w-3" />Download ({selectedFiles.length}) PPT</>}
                  </Button>
                </div>
              )}
              {isFilesLoading && files.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="ml-2 text-xs text-muted-foreground">Loading slides...</span>
                </div>
              )}
              {filesError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2">
                  <div className="text-xs text-destructive">Failed to load: {filesError}</div>
                </div>
              )}
              {!isFilesLoading && !filesError && files.filter(f => { const { isImage } = detectFileType(f.filename, f.mimeType); return isImage; }).length === 0 && (
                <div className="py-8 text-center">
                  <File className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                  <div className="text-xs text-muted-foreground">No slides found</div>
                </div>
              )}
              <div className="space-y-2">
                {files.filter(file => { const { isImage } = detectFileType(file.filename, file.mimeType); return isImage; }).map((file, index) => {
                  const fileKey = file.id || file.path || file.filename || String(index);
                  const preview = filePreviews.get(fileKey);
                  const mimeType = file.mimeType || "";
                  const { isImage } = detectFileType(file.filename, mimeType);
                  if (!isImage) return null;
                  const previewMimeType = preview?.mimeType || mimeType;
                  const previewIsImage = previewMimeType.startsWith("image/") || (preview && detectFileType(file.filename, previewMimeType).isImage);
                  const isSelected = selectedFiles.includes(fileKey);
                  const selectionOrder = isSelected ? selectedFiles.indexOf(fileKey) + 1 : null;
                  return (
                    <div
                      key={fileKey}
                      className={cn(
                        "group rounded-lg border bg-card p-2 space-y-2",
                        isSelected && "ring-2 ring-primary"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Checkbox checked={isSelected} onCheckedChange={() => handleToggleFileSelection(fileKey)} id={`select-drawer-${fileKey}`} />
                        {selectionOrder && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground flex-shrink-0">{selectionOrder}</span>}
                        <File className="h-3 w-3 text-primary flex-shrink-0" />
                      </div>
                      {preview && !preview.isLoading && !preview.error && preview.content && previewIsImage && (
                        <div className="rounded border bg-muted overflow-hidden">
                          {preview.isUrl ? (
                            <img src={preview.content} alt={file.filename || "Preview"} className="w-full h-auto max-h-32 object-contain cursor-pointer hover:opacity-90" onClick={() => setSelectedImageIndex(index)} />
                          ) : (
                            <img src={`data:${previewMimeType};base64,${(preview.content as string).replace(/\s/g, "")}`} alt={file.filename || "Preview"} className="w-full h-auto max-h-32 object-contain cursor-pointer hover:opacity-90" onClick={() => setSelectedImageIndex(index)} />
                          )}
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex gap-2",
                          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 [@media(hover:none)]:opacity-100"
                        )}
                      >
                        {(preview?.publicUrl || filePublicUrls.get(fileKey)) && (
                          <a href={preview?.publicUrl || filePublicUrls.get(fileKey)} download={file.filename || file.path || "download"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center flex-1 rounded-md border bg-background px-2 py-1 text-xs font-medium text-primary shadow-sm hover:bg-accent"> <Download className="mr-1 h-3 w-3" />Download</a>
                        )}
                        <button onClick={() => handleDeleteFile(file)} disabled={deletingFileKeys.has(fileKey)} className="inline-flex items-center justify-center rounded-md border border-destructive/50 bg-background px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
                          {deletingFileKeys.has(fileKey) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {selectedImageIndex !== null && (() => {
        const imageFiles = files.filter(f => {
          const { isImage } = detectFileType(f.filename, f.mimeType);
          return isImage;
        });

        if (imageFiles.length === 0 || selectedImageIndex >= imageFiles.length) {
          return null;
        }

        const currentFile = imageFiles[selectedImageIndex];
        const fileKey = getFileKey(currentFile, selectedImageIndex);
        const preview = filePreviews.get(fileKey);
        const mimeType = currentFile.mimeType || "";
        const previewMimeType = preview?.mimeType || mimeType;
        const imageSrc = preview?.isUrl 
          ? preview.content 
          : preview?.content 
            ? `data:${previewMimeType};base64,${preview.content.replace(/\s/g, '')}`
            : null;

        const isEditing = editingFileKey === fileKey;
        const editPrompt = editPromptByFileKey.get(fileKey) || "";
        const editPreview = editPreviewByFileKey.get(fileKey);
        const isPreviewingEdit = isEditPreviewingByFileKey.get(fileKey) === true;
        const isApplyingEdit = isEditApplyingByFileKey.get(fileKey) === true;
        const editError = editErrorByFileKey.get(fileKey);

        if (!imageSrc) return null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 backdrop-blur-sm py-6"
            onClick={() => {
              setSelectedImageIndex(null);
              setEditingFileKey(null);
            }}
          >
            {/* Close button */}
            <button
              onClick={() => {
                setSelectedImageIndex(null);
                setEditingFileKey(null);
              }}
              className="group absolute top-4 right-4 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors shadow-md hover:shadow-lg"
              aria-label="Close lightbox"
            >
              <X className="h-6 w-6 transition-transform duration-150 group-hover:scale-110" />
            </button>

            {/* Left arrow */}
            {imageFiles.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImageIndex((prev) => {
                    if (prev === null) return null;
                    return prev === 0 ? imageFiles.length - 1 : prev - 1;
                  });
                }}
                className="group absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/60 p-3 text-white hover:bg-black/80 transition-colors shadow-md hover:shadow-lg"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-8 w-8 transition-transform duration-150 group-hover:scale-110" />
              </button>
            )}

            {/* Right arrow */}
            {imageFiles.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImageIndex((prev) => {
                    if (prev === null) return null;
                    return prev === imageFiles.length - 1 ? 0 : prev + 1;
                  });
                }}
                className="group absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/60 p-3 text-white hover:bg-black/80 transition-colors shadow-md hover:shadow-lg"
                aria-label="Next image"
              >
                <ChevronRight className="h-8 w-8 transition-transform duration-150 group-hover:scale-110" />
              </button>
            )}

            {/* Image container */}
            <div
              className="relative w-full max-w-[90vw] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image */}
              <img
                src={imageSrc}
                alt={currentFile.filename || "Image"}
                className={cn(
                  "max-w-full object-contain",
                  isEditing ? "max-h-[62vh]" : "max-h-[85vh]"
                )}
                onError={(e) => {
                  console.error("[UI] Failed to load image in lightbox", {
                    fileKey,
                    filename: currentFile.filename,
                  });
                  e.currentTarget.style.display = "none";
                }}
              />

              {/* Image info */}
              <div className="mt-4 w-full max-w-3xl text-center space-y-2">
                {imageFiles.length > 1 && (
                  <div className="text-white/70 text-xs mt-1">
                    {selectedImageIndex + 1} / {imageFiles.length}
                  </div>
                )}

                {/* Lightbox actions */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {(preview?.publicUrl || filePublicUrls.get(fileKey)) && (
                    <a
                      href={preview?.publicUrl || filePublicUrls.get(fileKey)}
                      download={currentFile.filename || currentFile.path || "download"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md border border-white/40 bg-white/5 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-white/15 transition-colors"
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Download
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(fileKey);
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-white/30 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 shadow-sm hover:bg-white/15 hover:text-white transition-colors"
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    {isEditing ? "Close edit" : "Edit"}
                  </button>
                </div>

                {isEditing && (
                  <div className="mt-3 rounded-lg border border-white/20 bg-black/40 p-3 text-left space-y-2">
                    <div className="text-xs font-semibold text-white">Edit this slide</div>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditPromptByFileKey((prev) => new Map(prev).set(fileKey, v));
                      }}
                      placeholder="Describe how to edit this image…"
                      className="w-full min-h-[80px] resize-y rounded-md border border-white/30 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    />
                    {editError && <div className="text-xs text-destructive">{editError}</div>}

                    {editPreview?.publicUrl && (
                      <div className="space-y-1">
                        <div className="text-[11px] text-white/70">Preview</div>
                        <div className="rounded border border-white/30 bg-black/40 overflow-hidden">
                          <img
                            src={editPreview.publicUrl}
                            alt="Edited preview"
                            className="w-full h-auto max-h-60 object-contain"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPreviewingEdit || isApplyingEdit}
                        onClick={() => handlePreviewEdit(currentFile, fileKey)}
                        className="text-xs"
                      >
                        {isPreviewingEdit ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Previewing…
                          </>
                        ) : (
                          "Preview"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!editPreview?.previewArtifactPath || isApplyingEdit || isPreviewingEdit}
                        onClick={() => handleApplyEdit(currentFile, fileKey)}
                        className="text-xs"
                      >
                        {isApplyingEdit ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Applying…
                          </>
                        ) : (
                          "Apply"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isPreviewingEdit || isApplyingEdit}
                        onClick={() => handleDiscardEdit(fileKey)}
                        className="text-xs text-white/80 hover:text-white"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
