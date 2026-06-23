import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderKanban, CalendarDays, Sunrise } from "lucide-react";

const STORAGE_PREFIX = "leanlook.welcomeSeen.";

export function WelcomeDialog() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const seen = localStorage.getItem(STORAGE_PREFIX + user.id);
      if (!seen) setOpen(true);
    } catch {
      // localStorage unavailable — skip silently
    }
  }, [user?.id]);

  const dismiss = () => {
    if (user?.id) {
      try {
        localStorage.setItem(STORAGE_PREFIX + user.id, new Date().toISOString());
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  const goToHuddle = () => {
    dismiss();
    navigate("/huddle");
  };

  const firstName = (profile?.display_name || "").trim().split(/\s+/)[0];

  const items = [
    {
      icon: FolderKanban,
      title: "Projects",
      desc: "Create a job and turn its master schedule into a 2-week look-ahead.",
    },
    {
      icon: CalendarDays,
      title: "Look-Aheads",
      desc: "Plan the next two weeks and mark daily progress.",
    },
    {
      icon: Sunrise,
      title: "Daily Huddle",
      desc: "Your morning stand-up: see today's tasks, tap status, flag blockers.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Welcome to LeanLook{firstName ? `, ${firstName}` : ""}
          </DialogTitle>
          <DialogDescription>
            A quick tour of the three things you'll use most in the field.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2">
          {items.map((item) => (
            <li key={item.title} className="flex gap-3 rounded-lg border bg-card p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={goToHuddle}
            className="min-h-11"
          >
            Take me to the Daily Huddle
          </Button>
          <Button type="button" onClick={dismiss} className="min-h-11">
            Get started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}