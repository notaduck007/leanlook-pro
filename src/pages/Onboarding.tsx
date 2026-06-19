import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Users } from "lucide-react";

type Mode = "choose" | "create" | "join";

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const { error } = await supabase.rpc("onboard_company" as any, {
      _company_name: companyName,
      _slug: slug,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    await refreshProfile();
    toast({ title: "Company created!", description: `Welcome to ${companyName}` });
    window.location.href = "/";
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const slug = companyCode.toLowerCase().trim();

    const { error } = await supabase.rpc("join_company" as any, {
      _slug: slug,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    await refreshProfile();
    toast({ title: "Joined company!", description: "You're all set." });
    window.location.href = "/";
  };

  if (mode === "choose") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">Welcome to LeanLook</CardTitle>
              <CardDescription>Get started by creating or joining a company</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full h-16 text-base justify-start gap-3"
              variant="outline"
              onClick={() => setMode("create")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Create a new company</div>
                <div className="text-xs text-muted-foreground">Set up your organization from scratch</div>
              </div>
            </Button>
            <Button
              className="w-full h-16 text-base justify-start gap-3"
              variant="outline"
              onClick={() => setMode("join")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                <Users className="h-5 w-5 text-accent-foreground" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Join an existing company</div>
                <div className="text-xs text-muted-foreground">Enter a company code to join your team</div>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            {mode === "create" ? (
              <Plus className="h-8 w-8 text-primary-foreground" />
            ) : (
              <Users className="h-8 w-8 text-primary-foreground" />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">
              {mode === "create" ? "Create Your Company" : "Join a Company"}
            </CardTitle>
            <CardDescription>
              {mode === "create"
                ? "Set up your company to get started with LeanLook"
                : "Enter the company code provided by your admin"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {mode === "create" ? (
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
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <Input
                placeholder="Company code (e.g. acme-construction)"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Ask your company admin for the company code. It's the unique identifier for your organization.
              </p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Joining..." : "Join Company"}
              </Button>
            </form>
          )}
          <div className="mt-4 text-center">
            <button
              onClick={() => { setMode("choose"); setLoading(false); }}
              className="text-sm text-primary hover:underline font-medium"
            >
              ← Back
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
