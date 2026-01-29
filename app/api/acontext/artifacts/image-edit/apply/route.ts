import { NextRequest, NextResponse } from "next/server";
import { applyImageEditPreview } from "@/lib/acontext-image-edit";

type ApplyRequestBody = {
  originalArtifactPath?: string;
  previewArtifactPath?: string;
  diskId?: string;
  deletePreviewAfterApply?: boolean;
};

/**
 * POST /api/acontext/artifacts/image-edit/apply
 * Applies a preview image by overwriting the original artifact.
 *
 * Body:
 * - originalArtifactPath: string (required)
 * - previewArtifactPath: string (required)
 * - diskId: string (optional)
 * - deletePreviewAfterApply: boolean (optional, default true)
 */
export async function POST(request: NextRequest) {
  try {
    const startedAt = Date.now();
    const body = (await request.json()) as ApplyRequestBody;
    const originalArtifactPath =
      typeof body.originalArtifactPath === "string" ? body.originalArtifactPath : "";
    const previewArtifactPath =
      typeof body.previewArtifactPath === "string" ? body.previewArtifactPath : "";
    const diskId = typeof body.diskId === "string" ? body.diskId : undefined;
    const deletePreviewAfterApply =
      typeof body.deletePreviewAfterApply === "boolean" ? body.deletePreviewAfterApply : undefined;

    console.log("[API] image-edit apply: request", {
      originalArtifactPath,
      previewArtifactPath,
      diskId: diskId ?? "(auto)",
      deletePreviewAfterApply: deletePreviewAfterApply ?? true,
    });

    if (!originalArtifactPath.trim()) {
      return NextResponse.json({ success: false, error: "originalArtifactPath is required" }, { status: 400 });
    }
    if (!previewArtifactPath.trim()) {
      return NextResponse.json({ success: false, error: "previewArtifactPath is required" }, { status: 400 });
    }

    const result = await applyImageEditPreview({
      originalArtifactPath,
      previewArtifactPath,
      diskId,
      deletePreviewAfterApply,
    });

    console.log("[API] image-edit apply: success", {
      elapsedMs: Date.now() - startedAt,
      finalArtifactPath: result.finalArtifactPath,
      hasPublicUrl: !!result.publicUrl,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] image-edit apply failed", error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

