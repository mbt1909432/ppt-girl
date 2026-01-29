"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCharacter } from "@/contexts/character-context";
import GlowFilter from "./glow-filter";

export function ParallaxCharacter() {
  const { character } = useCharacter();
  const [scrollY, setScrollY] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(character.avatarPath);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [currentCharacterId, setCurrentCharacterId] = useState(character.id);
  const [prevCharacterId, setPrevCharacterId] = useState<typeof character.id | null>(null);
  const [prevGlow, setPrevGlow] = useState<typeof character.glow | null>(null);

  const latestGlowRef = useRef(character.glow);

  // Keep a ref of the last-rendered glow so we can snapshot "previous" glow during transitions
  useEffect(() => {
    latestGlowRef.current = character.glow;
  }, [character.glow]);

  // Handle character switching animation
  useEffect(() => {
    if (character.avatarPath !== currentSrc) {
      // Save old avatar
      setPrevSrc(currentSrc);
      setPrevCharacterId(currentCharacterId);
      setPrevGlow(latestGlowRef.current);
      // Update to new avatar, initially transparent
      setCurrentSrc(character.avatarPath);
      setShowNew(false);
      setCurrentCharacterId(character.id);
      // Use double requestAnimationFrame to ensure DOM update before triggering animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShowNew(true);
        });
      });
      // Clean up after animation completes
      const timer = setTimeout(() => {
        setPrevSrc(null);
        setPrevCharacterId(null);
        setPrevGlow(null);
        setShowNew(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [character.avatarPath, character.id, currentSrc, currentCharacterId]);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY || window.pageYOffset || document.documentElement.scrollTop);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Horizontal parallax only; vertical movement removed per request
  const parallaxOffsetY = 0;
  const parallaxOffsetX = scrollY * 0.3; // Positive value: moves right when scrolling down

  const hasPrev = prevSrc !== null;

  const currentFilterId = `character-glow-${currentCharacterId}`;
  const prevFilterId = prevCharacterId ? `character-glow-${prevCharacterId}` : null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      {/* Current character glow */}
      <GlowFilter id={currentFilterId} settings={character.glow} />

      {/* Outgoing character glow during crossfade */}
      {hasPrev && prevFilterId && prevGlow && (
        <GlowFilter id={prevFilterId} settings={prevGlow} />
      )}
      {/* Adjust vertical position: modify the following parameters to control vertical positioning
          Vertical alignment: items-end (bottom) | items-center (center) | items-start (top)
          Bottom spacing: lg:pb-0 (bottom aligned) | lg:pb-10 (move up) | lg:pb-20 (more down)
          Top spacing: lg:pt-20 (position from top)
          Horizontal position: lg:pl-[800px] (adjust left margin to place character on the right side of text) */}
      <div className="absolute inset-0 flex items-end justify-center lg:justify-start lg:items-start lg:pl-[800px] lg:pt-[00px]">
        <div 
          className="relative w-full max-w-[280px] sm:max-w-[320px] md:max-w-[360px] lg:max-w-[360px] xl:max-w-[580px] opacity-70 dark:opacity-75 lg:opacity-100 dark:lg:opacity-100"
          style={{
            transform: `translate(${parallaxOffsetX}px, ${parallaxOffsetY}px)`,
            willChange: 'transform',
          }}
        >
          {/* Old avatar - fade out */}
          {hasPrev && (
            <div className="absolute inset-0">
              <Image
                key={`prev-${prevSrc}`}
                src={prevSrc!}
                alt={character.name}
                width={800}
                height={800}
                className="w-full h-auto object-contain rounded-3xl shadow-[0_40px_120px_rgba(0,0,0,0.0)] transition-all duration-400 ease-in-out"
                style={{
                  width: "100%",
                  height: "auto",
                  opacity: 0,
                  transform: "scale(0.95)",
                  filter: prevFilterId ? `url(#${prevFilterId})` : undefined,
                }}
                priority
              />
            </div>
          )}
          {/* New avatar - fade in */}
          <Image
            key={currentSrc}
            src={currentSrc}
            alt={character.name}
            width={800}
            height={800}
            className="w-full h-auto object-contain rounded-3xl shadow-[0_40px_120px_rgba(0,0,0,0.0)] transition-all duration-400 ease-in-out"
            style={{
              width: "100%",
              height: "auto",
              opacity: hasPrev ? (showNew ? 1 : 0) : 1,
              transform: hasPrev ? (showNew ? "scale(1)" : "scale(0.95)") : "scale(1)",
              filter: `url(#${currentFilterId})`,
              // Performance hint: GPU acceleration for filter animations
              willChange: "filter, opacity, transform",
            }}
            priority
          />
        </div>
      </div>
      {/* Gradient overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent lg:bg-gradient-to-l lg:from-transparent lg:via-background/40 lg:to-background dark:from-[#0b0b0f]/60 dark:via-[#0b0b0f]/70 dark:to-transparent" />
    </div>
  );
}

