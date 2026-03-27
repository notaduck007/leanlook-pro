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
  Pencil, Trash2, UserPlus, ChevronUp, ChevronDown, Mail, Loader2,
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
  const { profile, roles: myRoles, user, session } = useAuth();
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
  const [removing, setRemoving] = useState(false);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("super");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [inviting, setInviting] = useState(false);

  const fetchCompanies = useCallback(async () => {
    const { data } = await supabase.from("companies").select("id, name");
    setCompanies(data || []);
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("company_id", profile.company_id);

    if (!profiles) { setLoading(false); return; }

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
  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

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

  // --- Invite user ---
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    if (!invitePassword.trim()) {
      toast({ title: "Password is required", variant: "destructive" });
      return;
    }
    if (invitePassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      const res = await supabase.functions.invoke("invite-user", {
        body: {
          email: inviteEmail.trim(),
          password: invitePassword,
          role: inviteRole,
          display_name: inviteName.trim() || null,
          company_id: inviteCompanyId || null,
        },
      });

      if (res.error || res.data?.error) {
        toast({
          title: "Failed to create user",
          description: res.data?.error || res.error?.message || "Unknown error",
          variant: "destructive",
        });
      } else {
        toast({ title: "User created successfully", description: `${inviteEmail} can now sign in.` });
        setInviteOpen(false);
        setInviteEmail("");
        setInviteName("");
        setInvitePassword("");
        setInviteRole("super");
        setInviteCompanyId("");
        fetchUsers();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  // --- Edit ---
  const openEdit = (u: CompanyUser) => {
    setEditUser(u);
    setEditName(u.display_name || "");
    setEditRoles([...u.roles]);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
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

  // --- Remove user (full removal from org via edge function) ---
  const handleRemoveUser = async () => {
    if (!removeUser) return;
    setRemoving(true);
    try {
      const res = await supabase.functions.invoke("remove-user", {
        body: { target_user_id: removeUser.user_id },
      });

      if (res.error || res.data?.error) {
        toast({
          title: "Error",
          description: res.data?.error || res.error?.message || "Failed to remove user",
          variant: "destructive",
        });
      } else {
        toast({ title: `${removeUser.display_name || "User"} removed from organization` });
        setRemoveUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRemoving(false);
    }
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> User Management
            </CardTitle>
            <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Add User
            </Button>
          </div>
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
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove User
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

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Add User
            </DialogTitle>
            <DialogDescription>
              Invite a new user by email or add an existing user to your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Enter display name (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label>Initial Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_CONFIG) as AppRole[]).map((role) => {
                    const cfg = ROLE_CONFIG[role];
                    return (
                      <SelectItem key={role} value={role}>
                        <span className="flex items-center gap-2">
                          {cfg.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                You can change roles later from the user list.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {inviting ? "Inviting..." : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle>Remove user from organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{removeUser?.display_name || "this user"}</strong> from your
              organization entirely. All their roles will be cleared and they will lose access to all
              projects and data. They can be re-invited later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemoveUser}
              disabled={removing}
            >
              {removing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {removing ? "Removing..." : "Remove User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
