import { NextRequest, NextResponse } from "next/server";

import { getAcontextClient } from "@/lib/acontext-client";

/**
 * GET /api/acontext/artifacts/public-url
 *
 * Resolve a fresh presigned public URL for an artifact on Acontext Disk,
 * and redirect to it (302). This avoids long-lived storage of expiring URLs.
 *
 * Query parameters:
 * - filePath (required): Full artifact path (e.g. "/generated/2026-01-28/image.png" or "generated/...")
 * - diskId (optional): Specific disk ID. Strongly recommended in multi-disk scenarios.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawFilePath = searchParams.get("filePath");
    const diskId = searchParams.get("diskId") || undefined;

    if (!rawFilePath) {
      return NextResponse.json(
        { success: false, error: "filePath parameter is required" },
        { status: 400 }
      );
    }

    const acontext = getAcontextClient();
    if (!acontext) {
      return NextResponse.json(
        { success: false, error: "Acontext is not configured" },
        { status: 500 }
      );
    }

    // Normalize filePath:
    // - accept "generated/..." or "/generated/..."
    // - reject directory paths
    const filePathNormalized = rawFilePath.startsWith("/")
      ? rawFilePath
      : `/${rawFilePath}`;
    if (filePathNormalized.endsWith("/")) {
      return NextResponse.json(
        { success: false, error: "filePath is a directory, not a file" },
        { status: 400 }
      );
    }

    // Resolve disk id if not provided (best-effort; prefer passing diskId).
    let targetDiskId = diskId;
    if (!targetDiskId) {
      const disks = await acontext.disks.list();
      if (disks?.items?.length) {
        targetDiskId = disks.items[0].id;
      } else {
        return NextResponse.json(
          { success: false, error: "No Acontext disks found" },
          { status: 404 }
        );
      }
    }

    // Parse "/dir/file.png" -> { filePath: "/dir", filename: "file.png" }
    const parts = filePathNormalized.split("/").filter(Boolean);
    if (parts.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid filePath" },
        { status: 400 }
      );
    }
    const filename = parts[parts.length - 1];
    const dir = parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "/";

    const result = await acontext.disks.artifacts.get(targetDiskId, {
      filePath: dir,
      filename,
      withContent: false,
      withPublicUrl: true,
    });

    const publicUrl = result?.public_url;
    if (!publicUrl) {
      return NextResponse.json(
        { success: false, error: "publicUrl not available for this artifact" },
        { status: 404 }
      );
    }

    // 302 redirect to the fresh presigned URL
    return NextResponse.redirect(publicUrl, 302);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

