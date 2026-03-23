import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const companyId = crypto.randomUUID();

    const { error: companyError } = await supabase
      .from("companies")
      .insert({ id: companyId, name: companyName, slug });

    if (companyError) {
      toast({ title: "Error", description: companyError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Update profile with company_id
    await supabase
      .from("profiles")
      .update({ company_id: companyId })
      .eq("user_id", user.id);

    // Grant admin role
    await supabase.from("user_roles").upsert({
      user_id: user.id,
      role: "admin" as any,
    });

    await refreshProfile();
    toast({ title: "Company created!", description: `Welcome to ${companyName}` });
    navigate("/");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Set Up Your Company</CardTitle>
            <CardDescription>Create your company to get started with LeanLook</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              placeholder="Company name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create Company"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
