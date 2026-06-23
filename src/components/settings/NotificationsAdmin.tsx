import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Bell, Mail, Play, Loader2, Info, CheckCircle2 } from "lucide-react";

function ResultBlock({ data }: { data: any }) {
  if (!data) return null;
  return (
    <pre className="mt-2 text-[11px] bg-muted/40 rounded p-2 overflow-x-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function NotificationsAdmin() {
  const { toast } = useToast();
  const [runningDaily, setRunningDaily] = useState(false);
  const [runningWeekly, setRunningWeekly] = useState(false);
  const [dailyResult, setDailyResult] = useState<any>(null);
  const [weeklyResult, setWeeklyResult] = useState<any>(null);

  const runDaily = async () => {
    setRunningDaily(true);
    setDailyResult(null);
    const { data, error } = await supabase.functions.invoke("daily-reminders");
    setRunningDaily(false);
    if (error) {
      toast({ title: "Daily reminders failed", description: error.message, variant: "destructive" });
      return;
    }
    setDailyResult(data);
    toast({ title: "Daily reminders sent", description: "Check the bell for new in-app notifications." });
  };

  const runWeekly = async () => {
    setRunningWeekly(true);
    setWeeklyResult(null);
    const { data, error } = await supabase.functions.invoke("weekly-digest");
    setRunningWeekly(false);
    if (error) {
      toast({ title: "Weekly digest failed", description: error.message, variant: "destructive" });
      return;
    }
    setWeeklyResult(data);
    toast({
      title: "Weekly digest sent",
      description: data?.emailEnabled ? "In-app + email delivered." : "In-app only (add RESEND_API_KEY for email).",
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> Reminders & Digests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Reminders post to the in-app bell. Email delivery for the weekly digest is enabled only when a
              <code className="mx-1 px-1 rounded bg-muted">RESEND_API_KEY</code>
              secret is configured in Project Settings → Secrets.
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Daily reminders</p>
                <p className="text-xs text-muted-foreground">
                  Overdue/upcoming constraints, expiring insurance, missing next-week look-aheads, pending approvals.
                </p>
              </div>
              <Button size="sm" onClick={runDaily} disabled={runningDaily}>
                {runningDaily ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span className="ml-1.5">Run now</span>
              </Button>
            </div>
            <ResultBlock data={dailyResult} />
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1">Weekly PPC digest <Mail className="h-3.5 w-3.5 text-muted-foreground" /></p>
                <p className="text-xs text-muted-foreground">
                  Company PPC for last week, PPC by project, top variance reasons, open constraints & corrective actions.
                </p>
              </div>
              <Button size="sm" onClick={runWeekly} disabled={runningWeekly}>
                {runningWeekly ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span className="ml-1.5">Run now</span>
              </Button>
            </div>
            <ResultBlock data={weeklyResult} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Schedule (active)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            Scheduled jobs are running automatically in the background — no manual setup required.
          </p>
          <ul className="space-y-1 pl-4 list-disc">
            <li><span className="font-medium text-foreground">Daily reminders</span> — every day at 6:00 AM US Central (12:00 UTC).</li>
            <li><span className="font-medium text-foreground">Weekly PPC digest</span> — every Monday at 6:00 AM US Central (12:00 UTC).</li>
          </ul>
          <p>Use the "Run now" buttons above any time you want to fire a job on demand.</p>
        </CardContent>
      </Card>
    </div>
  );
}