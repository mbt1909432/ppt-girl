import { NextRequest, NextResponse } from "next/server";

import { deleteAcontextArtifact } from "@/lib/acontext-integration";

/**
 * DELETE /api/acontext/artifacts/delete
 * Delete an artifact from Acontext Disk
 * 
 * Query parameters:
 * - filePath (required): Path to the file in the disk
 * - diskId (optional): Specific disk ID to delete artifact from
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get("filePath");
    const diskId = searchParams.get("diskId") || undefined;

    console.log("[API] DELETE /api/acontext/artifacts/delete: Request received", {
      filePath,
      diskId,
      allParams: Object.fromEntries(searchParams.entries()),
    });

    if (!filePath) {
      console.warn("[API] DELETE /api/acontext/artifacts/delete: Missing filePath parameter");
      return NextResponse.json(
        {
          success: false,
          error: "filePath parameter is required",
        },
        { status: 400 }
      );
    }

    const success = await deleteAcontextArtifact(filePath, diskId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to delete artifact. File may not exist or Acontext may not be configured.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Artifact deleted successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    
    console.error("[API] Failed to delete artifact:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

