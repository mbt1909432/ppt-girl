"use client";

import { useState, useEffect } from "react";

/**
 * Returns true when the given media query matches (e.g. min-width breakpoints).
 * SSR-safe: defaults to false until mounted.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

const QUERY_MD = "(min-width: 768px)";
const QUERY_LG = "(min-width: 1024px)";

export function useBreakpoints(): { isMd: boolean; isLg: boolean } {
  const isMd = useMediaQuery(QUERY_MD);
  const isLg = useMediaQuery(QUERY_LG);
  return { isMd, isLg };
}
