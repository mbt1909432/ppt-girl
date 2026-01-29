"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Bump this value to bust browser/CDN/Next Image caches when slide binaries change.
const SLIDES_VERSION = "2026-01-20";

// Preset messages and corresponding responses
const PRESET_MESSAGES = [
  {
    id: 1,
    text: "Help me generate a PPT presentation about Large Language Models (LLMs)",
    response: "Perfect! I'll create a comprehensive presentation about Large Language Models for you. Here's the 6-slide outline I've prepared:\n\n1. **What is an LLM?** - Definition of LLM, basic concept and purpose\n2. **Key Applications of LLMs** - Text generation, Q&A systems, translation, and summarization\n3. **How Do LLMs Work?** - Overview of architecture (e.g., transformers), training process, and data used\n4. **Advantages and Challenges** - Strengths of LLMs and main challenges (bias, cost, data requirements)\n5. **Future of LLMs** - Current trends, potential future developments, and impact on society\n6. **Advantages and Challenges (Detailed)** - Enhanced efficiency, scalability, creative content generation, and challenges like bias, hallucinations, security risks\n\nI've generated all 6 slides with a futuristic cyberpunk-style design. Let me show them to you!",
    slides: [1, 2, 3, 4, 5, 6], // Corresponding slide IDs
    // Define trigger points: text positions where each slide should appear
    slideTriggers: [
      "1. **What is an LLM?** - Definition of LLM, basic concept and purpose",
      "2. **Key Applications of LLMs** - Text generation, Q&A systems, translation, and summarization",
      "3. **How Do LLMs Work?** - Overview of architecture (e.g., transformers), training process, and data used",
      "4. **Advantages and Challenges** - Strengths of LLMs and main challenges (bias, cost, data requirements)",
      "5. **Future of LLMs** - Current trends, potential future developments, and impact on society",
      "6. **Advantages and Challenges (Detailed)** - Enhanced efficiency, scalability, creative content generation, and challenges like bias, hallucinations, security risks",
    ],
  },
];

// All available slides
const SLIDES = [
  { id: 1, src: `/fonts/slides/slide1.jpg?v=${SLIDES_VERSION}`, alt: "What is an LLM?" },
  { id: 2, src: `/fonts/slides/slide2.jpg?v=${SLIDES_VERSION}`, alt: "Key Applications of LLMs" },
  { id: 3, src: `/fonts/slides/slide3.jpg?v=${SLIDES_VERSION}`, alt: "How Do LLMs Work?" },
  { id: 4, src: `/fonts/slides/slide4.jpg?v=${SLIDES_VERSION}`, alt: "Advantages and Challenges" },
  { id: 5, src: `/fonts/slides/slide5.jpg?v=${SLIDES_VERSION}`, alt: "Future of LLMs" },
  { id: 6, src: `/fonts/slides/slide6.jpg?v=${SLIDES_VERSION}`, alt: "Advantages and Challenges (Detailed)" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayContent?: string; // For typewriter effect
}

export function InteractiveDemoGallery() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTyping, setCurrentTyping] = useState<string | null>(null);
  const [displayedSlides, setDisplayedSlides] = useState<number[]>([]);
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typewriterTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userScrolledRef = useRef(false);
  const autoScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect if user is manually scrolling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Detect if user scrolled near bottom (within 50px)
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      
      // If user scrolled near bottom, allow auto scroll
      // Otherwise mark as user-initiated scroll
      userScrolledRef.current = !isNearBottom;

      // Clear previous timer
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }

      // If user scrolled near bottom, reset flag after 3 seconds to allow auto scroll
      if (isNearBottom) {
        autoScrollTimeoutRef.current = setTimeout(() => {
          userScrolledRef.current = false;
        }, 3000);
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, []);

  // Disable auto scroll, let user control scroll position
  // useEffect(() => {
  //   // Only try to scroll when adding new messages, not during typewriter effect
  //   if (!userScrolledRef.current && messages.length > 0) {
  //     // Delay a bit to ensure DOM update is complete
  //     const timer = setTimeout(() => {
  //       if (!userScrolledRef.current && messagesEndRef.current) {
  //         messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  //       }
  //     }, 100);
  //     return () => clearTimeout(timer);
  //   }
  // }, [messages.length]); // Only trigger when message count changes, not during typewriter effect

  // Typewriter effect with slide triggers
  const startTypewriter = (
    messageId: string,
    fullText: string,
    slideTriggers: string[],
    slides: number[]
  ) => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
    }

    let index = 0;
    const triggeredSlides = new Set<number>();
    setCurrentTyping(messageId);

    typewriterTimerRef.current = setInterval(() => {
      if (index < fullText.length) {
        const currentText = fullText.slice(0, index + 1);
        
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, displayContent: currentText }
              : msg
          )
        );

        // Check if we've reached any trigger point
        slideTriggers.forEach((trigger, triggerIndex) => {
          const slideId = slides[triggerIndex];
          if (!triggeredSlides.has(slideId) && currentText.includes(trigger)) {
            // Verify the trigger text is complete by checking if it appears as a whole
            // This ensures we don't trigger on partial matches
            const triggerPos = currentText.indexOf(trigger);
            if (triggerPos !== -1) {
              // Check if we have the complete trigger (followed by newline or next item)
              const textAfterTrigger = currentText.slice(triggerPos + trigger.length);
              const isComplete = 
                textAfterTrigger.length === 0 || 
                textAfterTrigger.startsWith('\n') ||
                textAfterTrigger.match(/^\d+\./);
              
              if (isComplete) {
                triggeredSlides.add(slideId);
                // Display the slide immediately
                setDisplayedSlides((prev) => {
                  if (!prev.includes(slideId)) {
                    return [...prev, slideId];
                  }
                  return prev;
                });
              }
            }
          }
        });

        index++;
      } else {
        if (typewriterTimerRef.current) {
          clearInterval(typewriterTimerRef.current);
          typewriterTimerRef.current = null;
        }
        setCurrentTyping(null);
      }
    }, 10); // One character per 10ms
  };

  // Display slides one by one
  const displaySlidesSequentially = (slides: number[], delay: number = 800) => {
    setDisplayedSlides([]); // Clear first
    slides.forEach((slideId, index) => {
      setTimeout(() => {
        setDisplayedSlides((prev) => [...prev, slideId]);
      }, index * delay);
    });
  };

  // Handle preset message click
  const handlePresetClick = async (preset: typeof PRESET_MESSAGES[0]) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setDisplayedSlides([]); // Clear previous slides

    // 1. Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: preset.text,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Wait a bit for user message to display
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 2. Add assistant message (initially empty, for typewriter effect)
    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: preset.response,
      displayContent: "",
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // 3. Start typewriter effect with slide triggers
    const slideTriggers = preset.slideTriggers || [];
    startTypewriter(
      assistantMessage.id,
      preset.response,
      slideTriggers,
      preset.slides
    );

    // 4. Mark processing as complete after typewriter finishes
    const typingDuration = preset.response.length * 10;
    setTimeout(() => {
      setIsProcessing(false);
    }, typingDuration + 500);
  };

  // Keyboard navigation
  useEffect(() => {
    if (selectedSlide === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedSlide(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedSlide((prev) => {
          if (prev === null) return null;
          const currentIndex = displayedSlides.indexOf(prev);
          if (currentIndex === -1) return prev;
          return currentIndex === 0
            ? displayedSlides[displayedSlides.length - 1]
            : displayedSlides[currentIndex - 1];
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedSlide((prev) => {
          if (prev === null) return null;
          const currentIndex = displayedSlides.indexOf(prev);
          if (currentIndex === -1) return prev;
          return currentIndex === displayedSlides.length - 1
            ? displayedSlides[0]
            : displayedSlides[currentIndex + 1];
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSlide, displayedSlides]);

  const currentSlide = selectedSlide
    ? SLIDES.find((s) => s.id === selectedSlide)
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full min-w-0">
      {/* Left: Chat area */}
      <Card className="backdrop-blur-sm bg-card/80 border-primary/20 shadow-xl dark:bg-neutral-900/80 dark:border-neutral-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Interactive Demo
            </CardTitle>
            <Badge variant="secondary">Demo</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col h-[600px]">
          {/* Message list */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                Click a preset message below to start
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "user" ? (
                  <div className="max-w-[90%] sm:max-w-[80%] lg:max-w-[70%] text-sm whitespace-pre-wrap text-foreground break-words">
                    {message.content}
                  </div>
                ) : (
                <div
                  className={`max-w-[90%] sm:max-w-[80%] lg:max-w-[70%] rounded-xl px-4 py-2.5 shadow-sm relative overflow-hidden bg-muted border-l-4 border-primary/30`}
                >
                  <div className="text-sm whitespace-pre-wrap relative z-10">
                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            a: ({ node, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors break-all"
                              />
                            ),
                            code: (codeProps: any) => {
                              const { inline, className, children, ...props } = codeProps;
                              const match = /language-(\\w+)/.exec(className || "");
                              return !inline && match ? (
                                <pre className="bg-muted/60 rounded-lg p-3 overflow-x-auto my-2">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code className="bg-muted/60 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                                  {children}
                                </code>
                              );
                            },
                            img: ({ node, ...props }) => (
                              <img
                                {...props}
                                className="max-w-full h-auto rounded-lg border border-border my-2"
                                style={{ maxHeight: "400px" }}
                              />
                            ),
                            ul: ({ node, ...props }) => (
                              <ul className="list-disc list-inside space-y-1 my-2 ml-4" {...props} />
                            ),
                            ol: ({ node, ...props }) => (
                              <ol className="list-decimal list-inside space-y-1 my-2 ml-4" {...props} />
                            ),
                            p: ({ node, ...props }) => <p className="my-0.5" {...props} />,
                          }}
                        >
                          {message.displayContent !== undefined ? message.displayContent : message.content}
                        </ReactMarkdown>
                    </div>
                    {currentTyping === message.id && (
                      <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                    )}
                  </div>
                </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Preset message buttons */}
          <div className="space-y-2 border-t pt-4">
            <div className="text-xs text-muted-foreground mb-2">
              Select a message to start:
            </div>
            <div className="flex flex-col gap-2">
              {PRESET_MESSAGES.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3 px-4 hover:bg-primary/10 hover:border-primary/50 transition-all whitespace-normal break-words"
                  onClick={() => handlePresetClick(preset)}
                  disabled={isProcessing}
                >
                  <span className="text-sm block min-w-0 w-full break-words">{preset.text}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: PPT Gallery */}
      <Card className="backdrop-blur-sm bg-card/80 border-primary/20 shadow-xl dark:bg-neutral-900/80 dark:border-neutral-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl sm:text-2xl">PPT Gallery</CardTitle>
            <Badge variant="secondary">
              {displayedSlides.length > 0
                ? `${displayedSlides.length} Slides`
                : "Waiting to generate"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col h-[600px] pt-0 px-4 pb-4">
          {displayedSlides.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  Select a message on the left,<br />
                  and I'll generate the corresponding slides for you
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {displayedSlides.map((slideId, index) => {
                const slide = SLIDES.find((s) => s.id === slideId);
                if (!slide) return null;
                return (
                  <div
                    key={slide.id}
                    className="relative w-full group cursor-pointer animate-slide-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                    onClick={() => setSelectedSlide(slide.id)}
                  >
                    <div className="relative aspect-video rounded-lg overflow-hidden border-2 border-primary/20 bg-muted/30 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg group-hover:scale-[1.01]">
                      <Image
                        src={slide.src}
                        alt={slide.alt}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                      <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded">
                          Click to view full size
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 text-center">
                      <span className="text-sm text-muted-foreground font-medium">
                        {slide.alt}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen slide view */}
      {selectedSlide !== null && currentSlide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={() => setSelectedSlide(null)}
        >
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
              onClick={() => setSelectedSlide(null)}
            >
              <X className="h-6 w-6" />
            </Button>

            {displayedSlides.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 z-10 text-white hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = displayedSlides.indexOf(selectedSlide);
                    const prevIndex =
                      currentIndex === 0
                        ? displayedSlides.length - 1
                        : currentIndex - 1;
                    setSelectedSlide(displayedSlides[prevIndex]);
                  }}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 z-10 text-white hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = displayedSlides.indexOf(selectedSlide);
                    const nextIndex =
                      currentIndex === displayedSlides.length - 1
                        ? 0
                        : currentIndex + 1;
                    setSelectedSlide(displayedSlides[nextIndex]);
                  }}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            <div
              className="relative max-w-[95%] max-h-[95%] w-full h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={currentSlide.src}
                alt={currentSlide.alt}
                fill
                className="object-contain"
                sizes="95vw"
                priority
              />
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm">
              {displayedSlides.indexOf(selectedSlide) + 1} / {displayedSlides.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}