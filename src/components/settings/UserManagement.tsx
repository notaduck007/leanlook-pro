import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, Search, MoreHorizontal, Shield, ShieldCheck, HardHat,
  Pencil, Trash2, UserPlus, ChevronUp, ChevronDown,
} from "lucide-react";

type AppRole = "admin" | "pm" | "super";

interface CompanyUser {
  user_id: string;
  display_name: string | null;
  roles: AppRole[];
}

const ROLE_CONFIG: Record<AppRole, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: "Admin", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: ShieldCheck },
  pm: { label: "Project Manager", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Shield },
  super: { label: "Superintendent", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: HardHat },
};

type SortField = "display_name" | "roles";
type SortDir = "asc" | "desc";

export function UserManagement() {
  const { profile, roles: myRoles, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = myRoles.includes("admin");

  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("display_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Edit dialog
  const [editUser, setEditUser] = useState<CompanyUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<AppRole[]>([]);

  // Remove confirmation
  const [removeUser, setRemoveUser] = useState<CompanyUser | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);

    // Get all profiles in company
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("company_id", profile.company_id);

    if (!profiles) { setLoading(false); return; }

    // Get all roles for those users
    const userIds = profiles.map((p) => p.user_id);
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    const roleMap = new Map<string, AppRole[]>();
    (rolesData || []).forEach((r) => {
      const list = roleMap.get(r.user_id) || [];
      list.push(r.role as AppRole);
      roleMap.set(r.user_id, list);
    });

    const result: CompanyUser[] = profiles.map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      roles: roleMap.get(p.user_id) || [],
    }));

    setUsers(result);
    setLoading(false);
  }, [profile?.company_id]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Sort & filter
  const filtered = users
    .filter((u) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (u.display_name || "").toLowerCase().includes(s) ||
        u.roles.some((r) => ROLE_CONFIG[r].label.toLowerCase().includes(s))
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "display_name") {
        cmp = (a.display_name || "").localeCompare(b.display_name || "");
      } else {
        cmp = a.roles.join(",").localeCompare(b.roles.join(","));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const toggleSelect = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((u) => u.user_id)));
  };

  // --- Edit ---
  const openEdit = (u: CompanyUser) => {
    setEditUser(u);
    setEditName(u.display_name || "");
    setEditRoles([...u.roles]);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    // Update display name
    if (editName !== editUser.display_name) {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: editName })
        .eq("user_id", editUser.user_id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    }

    // Sync roles: remove old, add new
    const oldRoles = new Set(editUser.roles);
    const newRoles = new Set(editRoles);

    const toRemove = editUser.roles.filter((r) => !newRoles.has(r));
    const toAdd = editRoles.filter((r) => !oldRoles.has(r));

    for (const role of toRemove) {
      await supabase.from("user_roles").delete()
        .eq("user_id", editUser.user_id).eq("role", role);
    }
    for (const role of toAdd) {
      await supabase.from("user_roles").insert({
        user_id: editUser.user_id,
        role,
      });
    }

    toast({ title: "User updated successfully" });
    setEditUser(null);
    fetchUsers();
  };

  const toggleEditRole = (role: AppRole) => {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  // --- Bulk role change ---
  const handleBulkRoleChange = async (role: AppRole) => {
    for (const uid of selected) {
      const u = users.find((x) => x.user_id === uid);
      if (u && !u.roles.includes(role)) {
        await supabase.from("user_roles").insert({ user_id: uid, role });
      }
    }
    toast({ title: `Added ${ROLE_CONFIG[role].label} role to ${selected.size} user(s)` });
    setSelected(new Set());
    fetchUsers();
  };

  // --- Remove user roles (soft remove) ---
  const handleRemoveUser = async () => {
    if (!removeUser) return;
    // Remove all roles — effectively deactivates the user
    for (const role of removeUser.roles) {
      await supabase.from("user_roles").delete()
        .eq("user_id", removeUser.user_id).eq("role", role);
    }
    toast({ title: `Removed all roles from ${removeUser.display_name || "user"}` });
    setRemoveUser(null);
    fetchUsers();
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Only admins can manage users.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> User Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {selected.size > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Bulk: Add Role ({selected.size})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(Object.keys(ROLE_CONFIG) as AppRole[]).map((role) => (
                    <DropdownMenuItem key={role} onClick={() => handleBulkRoleChange(role)}>
                      Add {ROLE_CONFIG[role].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {search ? "No users match your search." : "No users found."}
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toggleSort("display_name")}
                      >
                        Name <SortIcon field="display_name" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toggleSort("roles")}
                      >
                        Roles <SortIcon field="roles" />
                      </button>
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => {
                    const isMe = u.user_id === user?.id;
                    return (
                      <TableRow
                        key={u.user_id}
                        className={selected.has(u.user_id) ? "bg-primary/5" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected.has(u.user_id)}
                            onCheckedChange={() => toggleSelect(u.user_id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                              {(u.display_name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {u.display_name || "Unnamed"}
                                {isMe && (
                                  <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">No roles</span>
                            ) : (
                              u.roles.map((role) => {
                                const cfg = ROLE_CONFIG[role];
                                const Icon = cfg.icon;
                                return (
                                  <Badge key={role} variant="secondary" className={`text-xs ${cfg.color}`}>
                                    <Icon className="h-3 w-3 mr-1" />
                                    {cfg.label}
                                  </Badge>
                                );
                              })
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(u)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              {!isMe && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setRemoveUser(u)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove Roles
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {filtered.length} user{filtered.length !== 1 ? "s" : ""} in your organization
          </p>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update display name and role assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter display name"
              />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="space-y-2">
                {(Object.keys(ROLE_CONFIG) as AppRole[]).map((role) => {
                  const cfg = ROLE_CONFIG[role];
                  const Icon = cfg.icon;
                  const isOwnAdmin = editUser?.user_id === user?.id && role === "admin";
                  return (
                    <label
                      key={role}
                      className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors ${
                        editRoles.includes(role)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      } ${isOwnAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <Checkbox
                        checked={editRoles.includes(role)}
                        onCheckedChange={() => !isOwnAdmin && toggleEditRole(role)}
                        disabled={isOwnAdmin}
                      />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{cfg.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {role === "admin" && "Full access to settings, users, and all projects"}
                          {role === "pm" && "Manage projects and approve look-aheads"}
                          {role === "super" && "Create and submit look-aheads for assigned projects"}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
              {editUser?.user_id === user?.id && (
                <p className="text-xs text-muted-foreground">
                  You cannot remove your own admin role.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={editRoles.length === 0}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeUser} onOpenChange={(o) => !o && setRemoveUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all roles?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all roles from <strong>{removeUser?.display_name || "this user"}</strong>.
              They will lose access to all features until roles are re-assigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemoveUser}
            >
              Remove Roles
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
