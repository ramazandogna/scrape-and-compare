"use client";

import { useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

export function TagInput({
  value,
  onChange,
  placeholder = "Yazıp Enter'a basın...",
  maxTags = 50,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const normalizeTag = useCallback((raw: string): string => {
    return raw.trim().toLowerCase().replaceAll(".", "");
  }, []);

  const addTagsFromInput = useCallback(() => {
    const chunks = inputValue
      .split(",")
      .map((part) => normalizeTag(part))
      .filter(Boolean);

    if (chunks.length === 0) {
      setInputValue("");
      return;
    }

    let next = [...value];
    for (const tag of chunks) {
      if (next.length >= maxTags) break;
      if (next.includes(tag)) continue;
      next = [...next, tag];
    }

    if (next.length !== value.length) {
      onChange(next);
    }
    setInputValue("");
  }, [inputValue, maxTags, normalizeTag, onChange, value]);

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onChange(value.filter((t) => t !== tagToRemove));
    },
    [value, onChange]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault(); // prevent form submit
      addTagsFromInput();
    }
    // Backspace removes the last tag (when input is empty)
    if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]!);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
            aria-label={`${tag} etiketini kaldır`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={addTagsFromInput}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        className="h-6 min-w-[120px] flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
