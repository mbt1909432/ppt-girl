import { NextRequest, NextResponse } from "next/server";

import { listAcontextArtifacts } from "@/lib/acontext-integration";

/**
 * GET /api/acontext/artifacts
 * List all artifacts from Acontext Disk
 * 
 * Query parameters:
 * - diskId (optional): Specific disk ID to list artifacts from
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const diskId = searchParams.get("diskId") || undefined;

    const artifacts = await listAcontextArtifacts(diskId);

    if (artifacts === null) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to list artifacts. Acontext may not be configured.",
          artifacts: [],
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      artifacts,
      count: artifacts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    
    console.error("[API] Failed to list artifacts:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        artifacts: [],
      },
      { status: 500 }
    );
  }
}

