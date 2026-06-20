import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskTemplateManager } from "@/components/project/TaskTemplateManager";
import { UserManagement } from "@/components/settings/UserManagement";
import { NotificationsAdmin } from "@/components/settings/NotificationsAdmin";
import { useTheme } from "@/contexts/ThemeContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Users, Palette, Tag, Bell } from "lucide-react";

export default function Settings() {
  const { profile, roles, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = roles.includes("admin");

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5">
            <SettingsIcon className="h-3.5 w-3.5" /> General
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
          )}
          <TabsTrigger value="appearance" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" /> Appearance
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="templates" className="gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Templates
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="notifications" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Notifications
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general">
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
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{user?.email || "—"}</p>
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
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
        )}

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="dark-mode">Dark Mode</Label>
                <Switch
                  id="dark-mode"
                  checked={theme === "dark"}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="templates">
            <TaskTemplateManager />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="notifications">
            <NotificationsAdmin />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
