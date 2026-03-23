import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const { profile, roles } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Display Name</p>
            <p className="font-medium">{profile?.display_name || "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Roles</p>
            <div className="flex gap-2 mt-1">
              {roles.map((role) => (
                <Badge key={role} variant="secondary" className="capitalize">{role}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
