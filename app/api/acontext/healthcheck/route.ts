import { NextResponse } from "next/server";

import { getAcontextClient } from "@/lib/acontext-client";

const TIMEOUT_MS = 5000;

export async function GET() {
  const client = getAcontextClient();

  if (!client) {
    return NextResponse.json({
      ok: false,
    });
  }

  try {
    await Promise.race([
      client.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Ping timeout")), TIMEOUT_MS)
      ),
    ]);

    return NextResponse.json({
      ok: true,
    });
  } catch {
    return NextResponse.json({
      ok: false,
    });
  }
}

