"use client";

import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";

function normalizeSandboxUrl(url: string): string {
  const trimmed = url.trim();
  // Acontext sometimes persists local app links using a "sandbox:" prefix.
  // Browsers/markdown sanitizers may treat non-http(s) protocols as unsafe and block them.
  // Convert "sandbox:/api/..." -> "/api/..."
  if (trimmed.startsWith("sandbox:/")) {
    return trimmed.replace(/^sandbox:/, "");
  }
  return trimmed;
}

interface StreamdownMessageProps {
  /**
   * Markdown content to render
   */
  content: string;
  /**
   * Optional disk id for resolving artifact paths to stable URLs.
   * When provided, bracketed artifact paths like [ppt_slides/foo.jpg] will be
   * rewritten into renderable markdown images via /api/acontext/artifacts/public-url.
   */
  acontextDiskId?: string;
  /**
   * Whether the content is currently streaming (for caret indicators)
   */
  isStreaming?: boolean;
}

function buildStableArtifactUrl(artifactPath: string, diskId?: string): string {
  const base = `/api/acontext/artifacts/public-url?filePath=${encodeURIComponent(
    artifactPath
  )}`;
  return diskId ? `${base}&diskId=${encodeURIComponent(diskId)}` : base;
}

function rewriteArtifactPathMentionsToImages(input: string, diskId?: string): string {
  let output = input;

  // 1) Explicit disk marker: disk::artifactPath
  //
  // Example:
  //   Image link: disk::ppt_slides/image_x.jpg
  //
  // Highest priority, because this is an explicit contract with the model.
  const diskPattern =
    /disk::\s*([A-Za-z0-9/_-]+\.(?:png|jpg|jpeg|webp|gif))/gi;

  output = output.replace(diskPattern, (_m, p1: string) => {
    const artifactPath = String(p1).trim();
    const stable = buildStableArtifactUrl(artifactPath, diskId);
    return `[Open image](${stable})\n\n![Slide image](${stable})`;
  });

  // 2) Bracketed artifact paths → markdown image + open link
  //
  // Example:
  //   Image link: [ppt_slides/image_x.jpg]
  // =>
  //   [Open image](/api/...public-url?filePath=...&diskId=...)
  //   ![Slide image](/api/...public-url?filePath=...&diskId=...)
  //
  // Only rewrite when the bracket content looks like a disk artifact path (not a URL),
  // and avoid touching real markdown links like [text](url) via (?!\().
  const bracketPattern =
    /\[([A-Za-z0-9/_-]+\.(?:png|jpg|jpeg|webp|gif))\](?!\()/gi;

  output = output.replace(bracketPattern, (_m, p1: string) => {
    const artifactPath = String(p1).trim();
    const stable = buildStableArtifactUrl(artifactPath, diskId);
    return `[Open image](${stable})\n\n![Slide image](${stable})`;
  });

  // 3) Bare artifact paths in "图片链接:" / "Image link:" 行内文本
  //
  // Example:
  //   图片链接: ppt_slides/image_x.jpg
  //   Image link: ppt_slides/image_x.jpg
  //
  // Rewritten similarly为可点击链接 + 图片。
  const barePattern =
    /(图片链接|Image link)\s*:\s*([A-Za-z0-9/_-]+\.(?:png|jpg|jpeg|webp|gif))/gi;

  output = output.replace(barePattern, (_m, label: string, p2: string) => {
    const artifactPath = String(p2).trim();
    const stable = buildStableArtifactUrl(artifactPath, diskId);
    return `${label}: [Open image](${stable})\n\n![Slide image](${stable})`;
  });

  return output;
}

/**
 * Streamdown wrapper component for rendering chat message markdown
 * Replaces react-markdown with better streaming support and CJK handling
 */
export function StreamdownMessage({
  content,
  acontextDiskId,
  isStreaming = false,
}: StreamdownMessageProps) {
  const rewritten = rewriteArtifactPathMentionsToImages(content, acontextDiskId);
  return (
    <div className="markdown-content">
      <Streamdown
        plugins={{ code, cjk }}
        isAnimating={isStreaming}
        components={{
          // Customize link rendering - open in new tab with safe attributes
          a: ({ href, children, ...props }) => {
            const hrefStr = href ? normalizeSandboxUrl(href) : "";
            return (
              <a
                {...props}
                href={hrefStr}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors break-all"
              >
                {children}
              </a>
            );
          },
          // Customize image rendering - keep existing styling
          img: ({ src, alt, ...props }) => {
            const srcStr = typeof src === "string" ? normalizeSandboxUrl(src) : "";
            return (
            <img
              {...props}
              src={srcStr}
              alt={alt}
              className="max-w-full h-auto rounded-lg border border-border my-2"
              style={{ maxHeight: "400px" }}
            />
            );
          },
          // Customize code block rendering
          code: (props: React.ComponentProps<"code"> & { inline?: boolean }) => {
            const { inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            return !inline && match ? (
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto my-2">
                <code className={className} {...rest}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...rest}>
                {children}
              </code>
            );
          },
          // Customize list rendering
          // Lists: keep items略微分开，但不要额外上下外边距
          ul: ({ children, ...props }) => (
            <ul className="list-disc list-inside space-y-0.5 ml-4" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal list-inside space-y-0.5 ml-4" {...props}>
              {children}
            </ol>
          ),
          // Customize heading rendering
          h1: ({ children, ...props }) => (
            <h1 className="text-xl font-bold mt-4 mb-2" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-lg font-semibold mt-3 mb-2" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-base font-semibold mt-2 mb-1" {...props}>
              {children}
            </h3>
          ),
          // Customize paragraph rendering
          p: ({ children, ...props }) => (
            <p className="my-2" {...props}>
              {children}
            </p>
          ),
          // Customize blockquote rendering
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 italic my-2 text-muted-foreground" {...props}>
              {children}
            </blockquote>
          ),
          // Customize table rendering
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse border border-border rounded-lg" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th className="border border-border px-4 py-2 bg-muted font-semibold text-left" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-border px-4 py-2" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {rewritten}
      </Streamdown>
    </div>
  );
}
