import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Subcontractor {
  id: string;
  company_name: string;
  trade: string;
  status: string;
}

interface SubContractorAutocompleteProps {
  value: string | null;
  subcontractorId?: string | null;
  onChange: (companyName: string, subcontractorId: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SubContractorAutocomplete({
  value,
  subcontractorId,
  onChange,
  placeholder = "Select trade...",
  className,
  disabled,
}: SubContractorAutocompleteProps) {
  const { profile } = useAuth();
  const [inputValue, setInputValue] = useState(value || "");
  const [results, setResults] = useState<Subcontractor[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [allSubs, setAllSubs] = useState<Subcontractor[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load all subcontractors on mount for client-side filtering
  useEffect(() => {
    if (!profile?.company_id) return;
    const load = async () => {
      const { data } = await supabase
        .from("subcontractors")
        .select("id, company_name, trade, status")
        .eq("company_id", profile.company_id!)
        .eq("status", "active")
        .order("company_name");
      if (data) setAllSubs(data as Subcontractor[]);
    };
    load();

    // Realtime subscription
    const channel = supabase
      .channel("subcontractors-autocomplete")
      .on("postgres_changes", { event: "*", schema: "public", table: "subcontractors" }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.company_id]);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  const search = useCallback((query: string) => {
    if (!query.trim()) {
      setResults(allSubs.slice(0, 8));
      return;
    }
    const q = query.toLowerCase();
    const startsWithMatches: Subcontractor[] = [];
    const containsMatches: Subcontractor[] = [];
    for (const sub of allSubs) {
      const name = sub.company_name.toLowerCase();
      if (name.startsWith(q)) startsWithMatches.push(sub);
      else if (name.includes(q)) containsMatches.push(sub);
    }
    setResults([...startsWithMatches, ...containsMatches].slice(0, 8));
  }, [allSubs]);

  const handleInputChange = (val: string) => {
    setInputValue(val);
    setHighlightIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 200);
    if (!isOpen) setIsOpen(true);
  };

  const selectSub = (sub: Subcontractor) => {
    setInputValue(sub.company_name);
    onChange(sub.company_name, sub.id);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const addNewSub = async () => {
    if (!inputValue.trim() || !profile?.company_id) return;
    const { data, error } = await supabase
      .from("subcontractors")
      .insert({
        company_id: profile.company_id,
        company_name: inputValue.trim(),
        trade: "General",
        contact_name: "TBD",
        phone: "",
        status: "active" as const,
      })
      .select("id, company_name, trade, status")
      .single();

    if (error) {
      toast({ title: "Error adding subcontractor", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      const sub = data as Subcontractor;
      onChange(sub.company_name, sub.id);
      setInputValue(sub.company_name);
      setIsOpen(false);
      toast({ title: `${sub.company_name} added to Sub Contractor database.` });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
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
          selectSub(results[highlightIndex]);
        } else if (results.length === 0 && inputValue.trim()) {
          addNewSub();
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay close to allow click on dropdown
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        // If no sub selected and text doesn't match, clear
        if (inputValue && !subcontractorId) {
          const match = allSubs.find(
            (s) => s.company_name.toLowerCase() === inputValue.toLowerCase()
          );
          if (!match) {
            // Leave input but don't set ID
          }
        }
      }
    }, 150);
  };

  const handleFocus = () => {
    search(inputValue);
    setIsOpen(true);
  };

  const noMatch = isOpen && results.length === 0 && inputValue.trim().length > 0;

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
          aria-activedescendant={highlightIndex >= 0 ? `sub-option-${highlightIndex}` : undefined}
        />
        {noMatch && (
          <button
            type="button"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-primary hover:bg-primary/10 rounded"
            onClick={addNewSub}
            title="Add as new subcontractor"
            tabIndex={-1}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {isOpen && (results.length > 0 || noMatch) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 mt-1 w-56 max-h-48 overflow-auto rounded-md border bg-popover shadow-md animate-in fade-in-0 slide-in-from-top-1 duration-150"
          role="listbox"
        >
          {results.map((sub, i) => (
            <div
              key={sub.id}
              id={`sub-option-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              className={cn(
                "flex items-center justify-between px-2 py-1.5 cursor-pointer text-xs hover:bg-accent",
                i === highlightIndex && "bg-accent"
              )}
              onMouseDown={(e) => { e.preventDefault(); selectSub(sub); }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              <span className="font-medium truncate">{sub.company_name}</span>
              <span className="text-muted-foreground text-[10px] ml-2 shrink-0">{sub.trade}</span>
            </div>
          ))}
          {noMatch && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No match found — press Enter or click{" "}
              <Plus className="inline h-3 w-3" /> to add.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
