import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Tag } from "lucide-react";

interface Template {
  id: string;
  tag: string;
  checklist_items: string[];
}

export function TaskTemplateManager() {
  const { profile, roles } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newItem, setNewItem] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase
      .from("task_templates")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("tag")
      .then(({ data }) => {
        setTemplates(
          (data || []).map((t) => ({
            id: t.id,
            tag: t.tag,
            checklist_items: (t.checklist_items as string[]) || [],
          }))
        );
      });
  }, [profile?.company_id]);

  const handleAddTemplate = async () => {
    if (!newTag.trim() || !profile?.company_id) return;
    const { data, error } = await supabase
      .from("task_templates")
      .insert({ tag: newTag.trim(), company_id: profile.company_id, checklist_items: [] })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setTemplates((prev) => [...prev, { id: data.id, tag: data.tag, checklist_items: [] }]);
    setNewTag("");
    toast({ title: `Template "${data.tag}" created` });
  };

  const handleAddItem = async (templateId: string) => {
    if (!newItem.trim()) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const updated = [...template.checklist_items, newItem.trim()];
    await supabase
      .from("task_templates")
      .update({ checklist_items: updated })
      .eq("id", templateId);

    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, checklist_items: updated } : t))
    );
    setNewItem("");
  };

  const handleRemoveItem = async (templateId: string, idx: number) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const updated = template.checklist_items.filter((_, i) => i !== idx);
    await supabase
      .from("task_templates")
      .update({ checklist_items: updated })
      .eq("id", templateId);

    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, checklist_items: updated } : t))
    );
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Only admins can manage task templates.
        </CardContent>
      </Card>
    );
  }

  const DEFAULT_TEMPLATES: Record<string, string[]> = {
    "Demolition": ["Hazmat survey complete", "Disconnect utilities", "Dust control barriers", "Debris removal plan", "Permit obtained"],
    "Concrete": ["Rebar inspected", "Forms set & inspected", "Concrete mix approved", "Pour schedule confirmed", "Cure time met", "Break tests scheduled"],
    "Structural": ["Steel delivery confirmed", "Crane scheduled", "Anchor bolt survey", "Torque inspection", "Fireproofing plan"],
    "Roofing": ["Substrate inspected", "Materials on-site", "Weather window confirmed", "Membrane/flashing installed", "Drainage test", "Final inspection"],
    "MEP": ["Submittals approved", "Equipment delivered", "Rough-in complete", "Inspections scheduled", "Test & balance", "Commissioning plan"],
    "Electrical": ["Panel schedule approved", "Gear delivered", "Rough-in inspection", "Wire pull complete", "Terminations", "Energize plan"],
    "Plumbing": ["Underground inspected", "Fixtures delivered", "Pressure test", "Final connections", "Backflow test"],
    "HVAC": ["AHU delivered", "Ductwork inspected", "Refrigerant charge", "Controls programmed", "TAB scheduled"],
    "Finishes": ["Substrate prep complete", "Materials approved/on-site", "Mock-up approved", "Installation complete", "Protection in place"],
    "Sitework": ["Survey stakes set", "Erosion control", "Utility locate complete", "Compaction tests", "Grade verified"],
    "Exterior": ["Framing inspection", "Sheathing & WRB", "Brick/stone delivery", "Flashings installed", "Caulking/sealants"],
    "Interior": ["Framing inspection", "MEP rough-in clear", "Insulation inspection", "Drywall hung & finished", "Prime walls"],
  };

  const handleSeedDefaults = async () => {
    if (!profile?.company_id) return;
    const existingTags = new Set(templates.map(t => t.tag));
    const newTemplates = Object.entries(DEFAULT_TEMPLATES)
      .filter(([tag]) => !existingTags.has(tag))
      .map(([tag, items]) => ({
        tag,
        company_id: profile.company_id!,
        checklist_items: items,
      }));

    if (newTemplates.length === 0) {
      toast({ title: "All default templates already exist" });
      return;
    }

    const { data, error } = await supabase.from("task_templates").insert(newTemplates).select();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setTemplates(prev => [
      ...prev,
      ...(data || []).map(t => ({ id: t.id, tag: t.tag, checklist_items: (t.checklist_items as string[]) || [] })),
    ]);
    toast({ title: `Added ${newTemplates.length} default templates` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4" /> Task Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Define checklist items for task tags. When a look-ahead task matches a tag, these items appear automatically.
        </p>

        {/* Seed defaults */}
        {templates.length === 0 && (
          <Button variant="outline" size="sm" onClick={handleSeedDefaults} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Load Default Construction Templates
          </Button>
        )}

        {/* Add new template */}
        <div className="flex gap-2">
          <Input
            placeholder="New tag (e.g. Roofing, MEP)"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTemplate()}
          />
          <Button size="sm" onClick={handleAddTemplate}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {/* Template list */}
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="border rounded-lg p-3">
              <button
                className="w-full text-left text-sm font-medium flex items-center gap-2"
                onClick={() => setSelectedTemplate(selectedTemplate === t.id ? null : t.id)}
              >
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {t.tag}
                </span>
                <span className="text-muted-foreground text-xs">{t.checklist_items.length} items</span>
              </button>

              {selectedTemplate === t.id && (
                <div className="mt-2 space-y-2">
                  {t.checklist_items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm pl-2">
                      <span>• {item}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveItem(t.id, i)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add checklist item..."
                      value={newItem}
                      onChange={(e) => setNewItem(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddItem(t.id)}
                      className="h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" className="h-8" onClick={() => handleAddItem(t.id)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No templates yet. Add a tag to get started.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
