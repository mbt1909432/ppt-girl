"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";

import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ParallaxCharacter } from "@/components/parallax-character";
import { InteractiveDemoGallery } from "@/components/interactive-demo-gallery";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hasEnvVars } from "@/lib/utils";
import { useCharacter } from "@/contexts/character-context";

const GITHUB_OPEN_SOURCE_URL = "https://github.com/mbt1909432/ppt-girl";

// Character Grid Component
function CharacterGrid() {
  const { characters, characterId, setCharacter } = useCharacter();

  return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
      {characters.map((char) => {
        const isActive = char.id === characterId;
        return (
          <button
            key={char.id}
            onClick={() => setCharacter(char.id)}
            className={`group relative rounded-lg overflow-hidden border-2 transition-all duration-300 ${
              isActive
                ? "border-primary shadow-lg scale-105"
                : "border-border hover:border-primary/50 hover:shadow-md"
            }`}
          >
            <div className="aspect-square relative">
              <Image
                src={char.avatarPath}
                alt={char.name}
                fill
                className="object-cover object-[center_5%] [filter:drop-shadow(0_0_1px_rgba(0,0,0,0.85))_drop-shadow(0_0_10px_rgba(0,0,0,0.25))]"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
              {isActive && (
                <div className="pointer-events-none absolute inset-0 bg-primary/10" />
              )}
            </div>
            <div className="p-3">
              <h3 className="font-semibold text-sm mb-1">{char.name}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{char.tagline}</p>
              {isActive && (
                <Badge variant="default" className="mt-2 text-xs">
                  Active
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function Home() {
  const { character } = useCharacter();
  const [showMoreCharacterInfo, setShowMoreCharacterInfo] = useState(false);
  const [isCharacterCardHovered, setIsCharacterCardHovered] = useState(false);
  const [isSmScreen, setIsSmScreen] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [circleStart, setCircleStart] = useState({ x: 0, y: 0 });

  const bestForPreview = character.bestFor?.slice(0, 2) ?? [];
  const bestForRemaining = character.bestFor?.slice(2) ?? [];
  const hasMoreDetails =
    !!character.description || bestForRemaining.length > 0 || (character.prompts?.length ?? 0) > 0;

  // Reset details toggle when switching character
  useEffect(() => {
    setShowMoreCharacterInfo(false);
  }, [character.id]);

  // Track sm breakpoint for base positioning of the draggable circle
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    setIsSmScreen(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsSmScreen(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const baseCircleTranslate = useMemo(
    () => ({
      x: 0,
      y: isSmScreen ? -40 : -16, // matches sm:-translate-y-10 and -translate-y-4
    }),
    [isSmScreen]
  );

  const circleTransform = `translate(${baseCircleTranslate.x + dragOffset.x}px, ${
    baseCircleTranslate.y + dragOffset.y
  }px)`;

  const startDragging = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
    setCircleStart(dragOffset);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - dragStart.x;
      const deltaY = event.clientY - dragStart.y;
      setDragOffset({ x: circleStart.x + deltaX, y: circleStart.y + deltaY });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [circleStart.x, circleStart.y, dragStart.x, dragStart.y, isDragging]);

  const avatarObjectClass = "object-cover object-[center_5%]";
  return (
    <main className="relative min-h-screen bg-background text-foreground dark:bg-[#0b0b0f] dark:text-neutral-50">
      {/* Background Character - Fixed Position with Parallax */}
      <ParallaxCharacter />

      {/* Content Layer */}
      <div className="relative z-10 w-full">
        {/* Top navigation */}
        <nav className="relative border-b bg-card/50 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-12">
            <div className="flex items-center gap-3">
              <Link href="/" className="group flex items-center gap-2 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]">
                <img src="/icon.svg" alt="" className="h-7 w-7 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 sm:h-8 sm:w-8" />
                <span className="text-base font-semibold tracking-tight transition-colors duration-200 group-hover:text-primary sm:text-xl">
                  PPT Girl
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <ThemeSwitcher />
              <AuthButton />
            </div>
          </div>
        </nav>

        {/* Main Hero Section */}
        <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6 sm:py-16 lg:px-12 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] lg:items-center">
              {/* Left: main copy + CTA */}
              <div className="max-w-3xl space-y-8 sm:space-y-10 lg:space-y-12">
                {/* Tag */}
                <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
                  <Badge variant="secondary" className="text-sm sm:text-base">
                    PPT Girl · AI Slide Generator
                  </Badge>
                </div>

                {/* Main headline */}
                <div className="space-y-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
                  <h1 className="text-5xl font-bold leading-tight sm:text-6xl md:text-7xl lg:text-8xl">
                    <span className="block text-primary">Chat to Create</span>
                    <span className="block">Beautiful PPT Slides</span>
                  </h1>

                  <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl lg:text-2xl">
                    Turn any text into professional presentations in minutes. Choose your AI designer, chat about your topic, and get stunning 16:9 slide visuals ready for your deck.
                  </p>
                </div>

                {/* CTA section - moved up for better visibility */}
                <div className="space-y-4 animate-slide-up" style={{ animationDelay: "0.35s" }}>
                  {hasEnvVars ? (
                    <Link href="/protected" className="inline-block group">
                      <Button
                        size="lg"
                        className="text-lg px-8 py-7 h-auto font-semibold transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                      >
                        Start Creating Slides
                        <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">→</span>
                      </Button>
                    </Link>
                  ) : (
                    <div className="w-full max-w-md">
                      <EnvVarWarning />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button asChild variant="outline" className="h-10">
                      <Link
                        href={GITHUB_OPEN_SOURCE_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Source on GitHub
                      </Link>
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      This project is open-source — feel free to fork and contribute.
                    </span>
                  </div>

                  {/* Feature tags */}
                  <div className="flex flex-wrap gap-3 pt-2">
                    {["8 AI Designers", "Smart Outline", "16:9 Ready"].map((tag, index) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-sm transition-all duration-300 hover:bg-primary/10 hover:border-primary/50 dark:bg-neutral-900/60 dark:border-neutral-800"
                        style={{ animationDelay: `${0.5 + index * 0.1}s` }}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Character info card */}
              <div
                className="animate-slide-up lg:flex lg:justify-end"
                style={{ animationDelay: "0.45s" }}
              >
                <div
                  className="relative lg:mr-4 flex justify-end"
                  onMouseEnter={() => setIsCharacterCardHovered(true)}
                  onMouseLeave={() => setIsCharacterCardHovered(false)}
                  style={{ transform: circleTransform }}
                >
                  {/* Collapsed circle trigger */}
                  <div
                    className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-2 border-primary/50 shadow-lg ring-1 ring-primary/20 overflow-hidden bg-card/70 backdrop-blur-md dark:bg-neutral-900/70 dark:border-neutral-800 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={startDragging}
                    aria-label="Drag character avatar"
                  >
                    <Image
                      src={character.avatarPath}
                      alt={character.name}
                      width={72}
                      height={72}
                      className={`h-full w-full ${avatarObjectClass}`}
                      priority
                    />
                  </div>

                  {/* Hover card */}
                  <div
                    className={`absolute right-6 top-8 sm:right-8 sm:top-10 z-20 transition-all duration-300 ease-out origin-top-right ${
                      isCharacterCardHovered
                        ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                        : "opacity-0 translate-y-2 scale-95 pointer-events-none"
                    }`}
                  >
                    <Card className="max-w-xl w-[360px] sm:w-[420px] bg-card/70 backdrop-blur-md border-border/60 shadow-2xl dark:bg-neutral-900/80 dark:border-neutral-800 max-h-[70vh] overflow-auto">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-xl sm:text-2xl">
                              {character.name}
                            </CardTitle>
                            <p className="text-sm sm:text-base text-muted-foreground">
                              {character.title}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs sm:text-sm">
                            Current character
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm sm:text-base font-semibold text-foreground">
                          {character.tagline}
                        </p>

                        {bestForPreview.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Best for
                            </p>
                            <ul className="space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                              {bestForPreview.map((item) => (
                                <li key={item} className="flex items-start gap-2">
                                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-primary/70" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {hasMoreDetails && (
                          <div className="space-y-3 border-t border-border/60 pt-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                More about {character.name}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={() => setShowMoreCharacterInfo((prev) => !prev)}
                              >
                                {showMoreCharacterInfo ? "Show less" : "Show more"}
                              </Button>
                            </div>

                            {showMoreCharacterInfo && (
                              <div className="space-y-4">
                                {character.description && (
                                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                    {character.description}
                                  </p>
                                )}

                                {bestForRemaining.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Also great for
                                    </p>
                                    <ul className="space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                                      {bestForRemaining.map((item) => (
                                        <li key={item} className="flex items-start gap-2">
                                          <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-primary/50" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {character.prompts?.length > 0 && (
                                  <div className="space-y-2 pt-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Try asking
                                    </p>
                                    <ul className="space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                                      {character.prompts.map((prompt) => (
                                        <li key={prompt} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                                          {prompt}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow Section */}
        <div className="relative py-12 sm:py-16 lg:py-20 border-t">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-12">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
                <p className="text-muted-foreground text-lg">Create professional slides in three simple steps</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    1
                  </div>
                  <h3 className="text-xl font-semibold">Paste Your Content</h3>
                  <p className="text-muted-foreground">
                    Share your text, notes, or topic. PPT Girl analyzes and proposes a slide-by-slide outline.
                  </p>
                </div>
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    2
                  </div>
                  <h3 className="text-xl font-semibold">Review & Confirm</h3>
                  <p className="text-muted-foreground">
                    Review the proposed outline with titles and bullet points. Approve when ready.
                  </p>
                </div>
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    3
                  </div>
                  <h3 className="text-xl font-semibold">Get Your Slides</h3>
                  <p className="text-muted-foreground">
                    PPT Girl generates beautiful 16:9 slide images with consistent style, ready for your presentation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Character Selection Section */}
        <div className="relative py-12 sm:py-16 lg:py-20 bg-muted/30">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-12">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">Choose Your AI Designer</h2>
                <p className="text-muted-foreground text-lg">8 unique characters, each with their own visual style and expertise</p>
              </div>
              <CharacterGrid />
            </div>
          </div>
        </div>

        {/* Acontext Advantages Section */}
        <div className="relative py-12 sm:py-16 lg:py-20">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-12">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">Powered by Acontext</h2>
                <p className="text-muted-foreground text-lg">Intelligent memory and context awareness for better results</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">🧠 Persistent Memory</h3>
                    <p className="text-sm text-muted-foreground">
                      PPT Girl remembers your previous slides, preferences, and presentation structure across sessions.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">🎨 Style Consistency</h3>
                    <p className="text-sm text-muted-foreground">
                      Semantic search ensures all slides maintain visual consistency and match your preferred style.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">📈 Learning Over Time</h3>
                  <p className="text-sm text-muted-foreground">
                    The more presentations you create, the better PPT Girl understands your style and preferences.
                  </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">💾 Automatic Storage</h3>
                    <p className="text-sm text-muted-foreground">
                      All generated slides are automatically stored in Acontext Disk with shareable URLs for easy access.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Demo Section */}
        <div className="relative w-full py-12 sm:py-16 lg:py-20 border-t">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-12">
            <div className="max-w-7xl mx-auto w-full">
              <InteractiveDemoGallery />
            </div>
          </div>
        </div>

        {/* Footer */}
                <footer className="relative border-t bg-card/50 backdrop-blur-sm py-6 sm:py-8">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-12">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                © 2026 PPT Girl Slide Generator
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <Link
                  href={GITHUB_OPEN_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  GitHub (Open Source)
                </Link>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

