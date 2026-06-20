import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

export default function NewProject() {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetCompletionDate, setTargetCompletionDate] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.company_id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        company_id: profile.company_id,
        project_number: projectNumber.trim() || null,
        client: client.trim() || null,
        location: location.trim() || null,
        start_date: startDate || null,
        target_completion_date: targetCompletionDate || null,
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Project created!" });
      navigate(`/projects/${data.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="projectName">
                Project name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="projectName"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="projectNumber">Project number</Label>
                <Input
                  id="projectNumber"
                  placeholder="e.g. 2026-014"
                  value={projectNumber}
                  onChange={(e) => setProjectNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="client">Client / Owner</Label>
                <Input
                  id="client"
                  placeholder="e.g. Conroe ISD"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Location / Address</Label>
              <Input
                id="location"
                placeholder="Street, city, state"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="targetCompletionDate">Target completion</Label>
                <Input
                  id="targetCompletionDate"
                  type="date"
                  value={targetCompletionDate}
                  onChange={(e) => setTargetCompletionDate(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
