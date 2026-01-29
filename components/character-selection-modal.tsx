"use client";

import { useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCharacter, type CharacterId } from "@/contexts/character-context";

interface CharacterSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (characterId: CharacterId) => void;
  onCancel?: () => void;
}

/**
 * Character selection modal for new sessions
 * Reuses the same grid layout and card style as the homepage CharacterGrid
 */
export function CharacterSelectionModal({
  open,
  onOpenChange,
  onSelect,
  onCancel,
}: CharacterSelectionModalProps) {
  const { characters } = useCharacter();
  const [selectedId, setSelectedId] = useState<CharacterId | null>(null);

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId);
      setSelectedId(null);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setSelectedId(null);
    if (onCancel) {
      onCancel();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1600px] w-[98vw] max-h-[95vh] overflow-y-auto p-10 sm:p-12">
        <DialogHeader>
          <DialogTitle className="text-3xl sm:text-4xl font-bold text-center mb-2">
            Choose Your AI Designer
          </DialogTitle>
          <DialogDescription className="text-center text-lg sm:text-xl">
            Select a character for this new session
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8 lg:gap-10 mt-10 mb-4">
          {characters.map((char) => {
            const isSelected = char.id === selectedId;
            return (
              <button
                key={char.id}
                onClick={() => setSelectedId(char.id)}
                className={`group relative rounded-xl overflow-hidden border-3 transition-all duration-300 ${
                  isSelected
                    ? "border-primary shadow-xl scale-105"
                    : "border-border hover:border-primary/50 hover:shadow-lg"
                }`}
              >
                <div className="aspect-[3/4] relative bg-card/80 backdrop-blur-sm">
                  <Image
                    src={char.avatarPath}
                    alt={char.name}
                    fill
                    className="object-cover object-[center_5%] [filter:drop-shadow(0_0_1px_rgba(0,0,0,0.85))_drop-shadow(0_0_10px_rgba(0,0,0,0.25))]"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    quality={95}
                  />
                  {/* Light dark overlay to hide transparent-edge seams on dark backgrounds */}
                  <div className="pointer-events-none absolute inset-0 bg-black/10" />
                  {isSelected && (
                    <div className="pointer-events-none absolute inset-0 bg-primary/10" />
                  )}
                </div>
                <div className="p-5 sm:p-6">
                  <h3 className="font-semibold text-lg sm:text-xl mb-3">{char.name}</h3>
                  <p className="text-base sm:text-lg text-muted-foreground leading-relaxed min-h-[3rem]">{char.tagline}</p>
                  {isSelected && (
                    <Badge variant="default" className="mt-4 text-base px-4 py-1.5">
                      Selected
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-4 mt-8 pt-6 border-t">
          <Button variant="outline" onClick={handleCancel} size="lg" className="text-base px-6">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId} size="lg" className="text-base px-6">
            Create Session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
