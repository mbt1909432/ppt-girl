import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAcontextClient } from "@/lib/acontext-client";

type SkillItem = {
  title: string;
  summary: string;
  createdAt: string;
};

type SkillsResponse =
  | {
      learnedCount: number;
      skills: SkillItem[];
    }
  | {
      learnedCount: 0;
      skills: [];
      disabledReason: string;
    };

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Authentication required",
        },
        { status: 401 }
      );
    }

    const client = getAcontextClient();
    if (!client) {
      const body: SkillsResponse = {
        learnedCount: 0,
        skills: [],
        disabledReason: "Acontext is not configured.",
      };
      return NextResponse.json(body);
    }

    // Space functionality has been removed - return empty skills list
    const body: SkillsResponse = {
      learnedCount: 0,
      skills: [],
      disabledReason: "Skill learning feature has been disabled. Space functionality is no longer available.",
    };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error(
      "[Acontext Skills] Unexpected error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}


