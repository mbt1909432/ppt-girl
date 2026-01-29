"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCharacter } from "@/contexts/character-context";
import Image from "next/image";
import { useEffect, useState } from "react";
import { User } from "lucide-react";

const CharacterSwitcher = () => {
  const { character, characterId, setCharacter, characters } = useCharacter();
  const [mounted, setMounted] = useState(false);
  const avatarObjectClass =
    "object-cover object-[center_5%] [filter:drop-shadow(0_0_1px_rgba(0,0,0,0.85))]";

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <User size={16} className="text-muted-foreground" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Image
            src={character.avatarPath}
            alt={character.name}
            width={20}
            height={20}
            className={`h-5 w-5 rounded-full border border-primary/30 ${avatarObjectClass}`}
            priority
          />
          <span className="hidden sm:inline text-sm text-muted-foreground">
            {character.name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="end">
        <DropdownMenuRadioGroup
          value={characterId}
          onValueChange={(value) => setCharacter(value as typeof characterId)}
        >
          {characters.map((char) => (
            <DropdownMenuRadioItem
              key={char.id}
              className="flex items-center gap-3 py-2"
              value={char.id}
            >
              <Image
                src={char.avatarPath}
                alt={char.name}
                width={32}
                height={32}
                className={`h-8 w-8 rounded-full border border-primary/30 ${avatarObjectClass}`}
              />
              <span>{char.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { CharacterSwitcher };

