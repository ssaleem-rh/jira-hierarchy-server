"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className,
  debounceMs = 200,
}: SearchBarProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function handleChange(v: string) {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), debounceMs);
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {local && (
        <button
          onClick={() => handleChange("")}
          className="absolute right-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
