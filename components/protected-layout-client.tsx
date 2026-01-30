"use client";

import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Client-only layout shell for /protected routes.
 * Nav + children; receives no params to avoid serializing Promise.
 */
export function ProtectedLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top navigation */}
      <nav className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm">
        <div className="flex h-16 w-full items-center justify-between px-4 sm:px-6 lg:px-12">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="group flex items-center gap-2 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]">
              <img src="/icon.svg" alt="" className="h-6 w-6 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 sm:h-7 sm:w-7" />
              <span className="text-base font-semibold tracking-tight transition-colors duration-200 group-hover:text-primary sm:text-lg">
                PPT Girl
              </span>
            </Link>
            <Link href="/" className="hidden sm:block">
              <Button variant="ghost" size="sm" className="text-xs">
                ← Back to Home
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeSwitcher />
            <AuthButton />
          </div>
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
    </main>
  );
}
