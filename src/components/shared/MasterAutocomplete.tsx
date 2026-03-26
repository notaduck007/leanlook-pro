import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export interface AutocompleteItem {
  id: string;
  primaryText: string;
  secondaryText?: string;
}

interface MasterAutocompleteProps {
  value: string | null;
  items: AutocompleteItem[];
  onChange: (primaryText: string, itemId: string | null) => void;
  onAddNew?: (name: string) => Promise<AutocompleteItem | null>;
  addNewToastLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MasterAutocomplete({
  value,
  items,
  onChange,
  onAddNew,
  addNewToastLabel = "record",
  placeholder = "Select...",
  className,
  disabled,
}: MasterAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value || "");
  const [results, setResults] = useState<AutocompleteItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => { setInputValue(value || ""); }, [value]);

  const updateDropdownPos = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 220) });
    }
  }, []);

  const search = useCallback((query: string) => {
    if (!query.trim()) {
      setResults(items.slice(0, 8));
      return;
    }
    const q = query.toLowerCase();
    const startsWithMatches: AutocompleteItem[] = [];
    const containsMatches: AutocompleteItem[] = [];
    for (const item of items) {
      const name = item.primaryText.toLowerCase();
      if (name.startsWith(q)) startsWithMatches.push(item);
      else if (name.includes(q)) containsMatches.push(item);
    }
    setResults([...startsWithMatches, ...containsMatches].slice(0, 8));
  }, [items]);

  const handleInputChange = (val: string) => {
    setInputValue(val);
    setHighlightIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 200);
    if (!isOpen) {
      updateDropdownPos();
      setIsOpen(true);
    }
  };

  const selectItem = (item: AutocompleteItem) => {
    setInputValue(item.primaryText);
    onChange(item.primaryText, item.id);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const addNew = async () => {
    if (!inputValue.trim() || !onAddNew) return;
    const newItem = await onAddNew(inputValue.trim());
    if (newItem) {
      onChange(newItem.primaryText, newItem.id);
      setInputValue(newItem.primaryText);
      setIsOpen(false);
      toast({ title: `${newItem.primaryText} added to ${addNewToastLabel}.` });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        updateDropdownPos();
        setIsOpen(true);
        search(inputValue);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && results[highlightIndex]) {
          selectItem(results[highlightIndex]);
        } else if (results.length === 0 && inputValue.trim() && onAddNew) {
          addNew();
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
      }
    }, 200);
  };

  const handleFocus = () => {
    updateDropdownPos();
    search(inputValue);
    setIsOpen(true);
  };

  const noMatch = isOpen && results.length === 0 && inputValue.trim().length > 0;
  const showDropdown = isOpen && (results.length > 0 || noMatch);

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          className={cn(
            "w-full text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 pr-6",
            className
          )}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-activedescendant={highlightIndex >= 0 ? `ac-option-${highlightIndex}` : undefined}
        />
        {noMatch && onAddNew && (
          <button
            type="button"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-primary hover:bg-primary/10 rounded"
            onMouseDown={(e) => { e.preventDefault(); addNew(); }}
            title="Add new entry"
            tabIndex={-1}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] max-h-48 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 slide-in-from-top-1 duration-150"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
          role="listbox"
        >
          {results.map((item, i) => (
            <div
              key={item.id}
              id={`ac-option-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              className={cn(
                "flex items-center justify-between px-2 py-1.5 cursor-pointer text-xs hover:bg-accent",
                i === highlightIndex && "bg-accent"
              )}
              onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              <span className="font-medium truncate">{item.primaryText}</span>
              {item.secondaryText && (
                <span className="text-muted-foreground text-[10px] ml-2 shrink-0">{item.secondaryText}</span>
              )}
            </div>
          ))}
          {noMatch && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No match found — press Enter or click{" "}
              <Plus className="inline h-3 w-3" /> to add.
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
