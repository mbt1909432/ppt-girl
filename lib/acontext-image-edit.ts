import { GoogleGenAI } from "@google/genai";
import { getAcontextClient } from "@/lib/acontext-client";
import { getAcontextArtifactContent, uploadFileToAcontext, deleteAcontextArtifact } from "@/lib/acontext-integration";

export type ImageEditPreviewArgs = {
  /**
   * Path of the original image artifact in Acontext Disk.
   * Accepts values with or without a leading slash.
   * Example: "generated/2026-01-28/image_abc.jpg"
   */
  artifactPath: string;
  /**
   * Natural language instruction describing the desired edits.
   */
  prompt: string;
  /**
   * Optional disk ID override.
   */
  diskId?: string;
};

export type ImageEditPreviewResult = {
  previewArtifactPath: string;
  publicUrl: string;
  mimeType: string;
};

export type ImageEditApplyArgs = {
  /**
   * Path of the original image artifact to overwrite.
   */
  originalArtifactPath: string;
  /**
   * Path of the preview artifact to apply.
   */
  previewArtifactPath: string;
  /**
   * Optional disk ID override.
   */
  diskId?: string;
  /**
   * When true, deletes the preview artifact after apply succeeds.
   * Default: true.
   */
  deletePreviewAfterApply?: boolean;
};

export type ImageEditApplyResult = {
  finalArtifactPath: string;
  publicUrl: string;
  mimeType: string;
};

function normalizeArtifactPath(p: string): string {
  const trimmed = (p ?? "").trim();
  return trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
}

function splitPathAndFilename(filePath: string): { filePathDir: string; filename: string } {
  const parts = filePath.split("/").filter((x) => x.length > 0);
  if (parts.length === 0) {
    throw new Error("Invalid artifactPath: missing filename");
  }
  const filename = parts[parts.length - 1];
  const filePathDir = parts.length > 1 ? "/" + parts.slice(0, -1).join("/") : "/";
  return { filePathDir, filename };
}

async function getPresignedPublicUrl(
  diskId: string,
  artifactPath: string
): Promise<{ publicUrl: string; mimeType?: string }> {
  const acontext = getAcontextClient();
  if (!acontext) {
    throw new Error("Acontext is not configured");
  }

  const normalized = normalizeArtifactPath(artifactPath);
  const { filePathDir, filename } = splitPathAndFilename(normalized);

  const result = await acontext.disks.artifacts.get(diskId, {
    filePath: filePathDir,
    filename,
    withContent: false,
    withPublicUrl: true,
  });

  const publicUrl = result?.public_url;
  if (!publicUrl) {
    throw new Error("Failed to obtain presigned public URL for artifact");
  }

  const artifact = result?.artifact as unknown as
    | {
        meta?: { __artifact_info__?: Record<string, unknown> };
        mimeType?: string;
        contentType?: string;
      }
    | undefined;
  const artifactInfo = (artifact?.meta?.__artifact_info__ ?? {}) as Record<string, unknown>;
  const mimeType: string | undefined =
    (typeof artifactInfo.content_type === "string" ? artifactInfo.content_type : undefined) ||
    (typeof artifactInfo.contentType === "string" ? artifactInfo.contentType : undefined) ||
    (typeof artifactInfo.mimeType === "string" ? artifactInfo.mimeType : undefined) ||
    artifact?.mimeType ||
    artifact?.contentType;

  return { publicUrl, mimeType };
}

async function resolveDiskId(diskId?: string): Promise<string> {
  const acontext = getAcontextClient();
  if (!acontext) {
    throw new Error("Acontext is not configured");
  }

  if (diskId) return diskId;

  const disks = await acontext.disks.list();
  if (disks?.items?.length) return disks.items[0].id;

  const newDisk = await acontext.disks.create();
  return newDisk.id;
}

/**
 * Generate an edited preview image from an existing artifact and a natural-language prompt.
 * This is NOT a chat tool; it is intended to be called by server API routes.
 */
export async function createImageEditPreview(
  args: ImageEditPreviewArgs
): Promise<ImageEditPreviewResult> {
  const artifactPath = normalizeArtifactPath(args.artifactPath);
  const prompt = (args.prompt ?? "").trim();
  if (!artifactPath) throw new Error("artifactPath is required");
  if (!prompt) throw new Error("prompt must be a non-empty string");

  const startedAt = Date.now();
  const original = await getAcontextArtifactContent(artifactPath, args.diskId);
  if (!original) {
    throw new Error("Failed to read original image from Acontext Disk");
  }

  const apiKey = process.env.IMAGE_GEN_API_KEY;
  const baseUrl = process.env.IMAGE_GEN_BASE_URL;
  const model = process.env.IMAGE_GEN_DEFAULT_MODEL;
  if (!apiKey) throw new Error("IMAGE_GEN_API_KEY is not configured");
  if (!model) throw new Error("IMAGE_GEN_DEFAULT_MODEL is not configured");

  const ai = new GoogleGenAI(baseUrl ? { apiKey, httpOptions: { baseUrl } } : { apiKey });

  const inputBase64 = original.content.toString("base64");
  const enhancedPrompt =
    `Edit the provided image according to the instructions. ` +
    `Preserve the main subject unless the instruction explicitly says to change it. ` +
    `Keep composition consistent; avoid adding extra text unless requested.\n\n` +
    prompt;

  const timeoutMs =
    (process.env.IMAGE_GEN_TIMEOUT_MS && Number.parseInt(process.env.IMAGE_GEN_TIMEOUT_MS, 10)) || 120_000;

  console.log("[image-edit] generateContent start", {
    artifactPath,
    diskId: args.diskId ?? "(auto)",
    model,
    baseUrl: baseUrl || "(default)",
    promptLength: prompt.length,
    originalBytes: original.content.length,
    originalMimeType: original.mimeType,
    timeoutMs,
  });

  const requestParams = {
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: original.mimeType || "image/png",
            data: inputBase64,
          },
        },
        { text: enhancedPrompt },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      },
    },
  };

  let response: { candidates?: Array<{ content?: { parts?: unknown[] } }> };
  try {
    const sdkPromise = ai.models.generateContent(
      requestParams as unknown as Parameters<typeof ai.models.generateContent>[0]
    );
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Image edit generateContent timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    response = (await Promise.race([sdkPromise, timeoutPromise])) as unknown as {
      candidates?: Array<{ content?: { parts?: unknown[] } }>;
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[image-edit] generateContent failed", {
      artifactPath,
      model,
      baseUrl: baseUrl || "(default)",
      elapsedMs: Date.now() - startedAt,
      error: errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Image edit API call failed: ${errorMessage}`);
  }

  console.log("[image-edit] generateContent done", {
    artifactPath,
    elapsedMs: Date.now() - startedAt,
    hasCandidates: Array.isArray(response?.candidates) && response.candidates.length > 0,
  });

  const parts: unknown[] =
    response?.candidates?.[0]?.content?.parts && Array.isArray(response.candidates[0].content.parts)
      ? response.candidates[0].content.parts
      : [];

  const images: Array<{ mimeType: string; data: string }> = [];
  for (const p of parts) {
    const part = p as { inlineData?: { data?: unknown; mimeType?: unknown } };
    if (part?.inlineData?.data && typeof part.inlineData.data === "string") {
      images.push({
        mimeType: typeof part.inlineData.mimeType === "string" ? part.inlineData.mimeType : original.mimeType,
        data: part.inlineData.data,
      });
    }
  }

  if (images.length === 0) {
    throw new Error("Image edit failed: upstream did not return an image");
  }

  const out = images[0];
  const outBuf = Buffer.from(out.data, "base64");
  const extGuess =
    out.mimeType.includes("png") ? "png" : out.mimeType.includes("webp") ? "webp" : "jpg";

  const ts = Date.now();
  const { filePathDir, filename } = splitPathAndFilename(artifactPath);
  const baseName = filename.replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
  const previewFilename = `${baseName}__edit_${ts}.${extGuess}`;
  const previewPath = `${filePathDir.replace(/^\/+/, "")}/_preview/${previewFilename}`.replace(/\/{2,}/g, "/");

  const previewArtifactPath = await uploadFileToAcontext(previewPath, outBuf, out.mimeType, args.diskId);
  if (!previewArtifactPath) {
    throw new Error("Image edit failed: preview upload to Acontext Disk failed");
  }

  const targetDiskId = await resolveDiskId(args.diskId);
  const { publicUrl } = await getPresignedPublicUrl(targetDiskId, previewArtifactPath);

  return {
    previewArtifactPath,
    publicUrl,
    mimeType: out.mimeType,
  };
}

/**
 * Apply a previously generated preview image by overwriting the original artifact.
 */
export async function applyImageEditPreview(
  args: ImageEditApplyArgs
): Promise<ImageEditApplyResult> {
  const originalArtifactPath = normalizeArtifactPath(args.originalArtifactPath);
  const previewArtifactPath = normalizeArtifactPath(args.previewArtifactPath);
  if (!originalArtifactPath) throw new Error("originalArtifactPath is required");
  if (!previewArtifactPath) throw new Error("previewArtifactPath is required");

  const preview = await getAcontextArtifactContent(previewArtifactPath, args.diskId);
  if (!preview) {
    throw new Error("Failed to read preview image from Acontext Disk");
  }

  // Overwrite original via upsert to the same path.
  const finalArtifactPath = await uploadFileToAcontext(
    originalArtifactPath,
    preview.content,
    preview.mimeType,
    args.diskId
  );
  if (!finalArtifactPath) {
    throw new Error("Failed to apply preview: overwrite upload failed");
  }

  const targetDiskId = await resolveDiskId(args.diskId);
  const { publicUrl } = await getPresignedPublicUrl(targetDiskId, finalArtifactPath);

  const deletePreviewAfterApply = args.deletePreviewAfterApply ?? true;
  if (deletePreviewAfterApply) {
    await deleteAcontextArtifact(previewArtifactPath, args.diskId);
  }

  return {
    finalArtifactPath,
    publicUrl,
    mimeType: preview.mimeType,
  };
}

