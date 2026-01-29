import { NextRequest, NextResponse } from "next/server";
import { createImageEditPreview } from "@/lib/acontext-image-edit";

type PreviewRequestBody = {
  artifactPath?: string;
  prompt?: string;
  diskId?: string;
};

/**
 * POST /api/acontext/artifacts/image-edit/preview
 * Creates an edited preview image from an existing artifact and a natural-language prompt.
 *
 * Body:
 * - artifactPath: string (required)
 * - prompt: string (required)
 * - diskId: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const startedAt = Date.now();
    const body = (await request.json()) as PreviewRequestBody;
    const artifactPath = typeof body.artifactPath === "string" ? body.artifactPath : "";
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const diskId = typeof body.diskId === "string" ? body.diskId : undefined;

    console.log("[API] image-edit preview: request", {
      artifactPath,
      diskId: diskId ?? "(auto)",
      promptLength: prompt.length,
    });

    if (!artifactPath.trim()) {
      return NextResponse.json({ success: false, error: "artifactPath is required" }, { status: 400 });
    }
    if (!prompt.trim()) {
      return NextResponse.json({ success: false, error: "prompt is required" }, { status: 400 });
    }

    const result = await createImageEditPreview({ artifactPath, prompt, diskId });
    console.log("[API] image-edit preview: success", {
      elapsedMs: Date.now() - startedAt,
      previewArtifactPath: result.previewArtifactPath,
      hasPublicUrl: !!result.publicUrl,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] image-edit preview failed", error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

