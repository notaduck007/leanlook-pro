import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { X } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

type Step = {
  id: string;
  title: string;
  body: string;
  selector?: string; // CSS selector for spotlight target
  center?: boolean; // render centered (no target)
  optional?: boolean; // skip if target missing (e.g. admin-only)
  openSidebar?: boolean; // open mobile drawer for this step
  closeSidebar?: boolean; // close mobile drawer for this step
  navigateTo?: string;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to LeanLook",
    body:
      "This 2-minute tour shows you where everything is. You can revisit it any time from Settings.",
    center: true,
    closeSidebar: true,
    navigateTo: "/",
  },
  {
    id: "sidebar",
    title: "Your main menu",
    body: "Everything you need lives here on the left.",
    selector: '[data-tour="sidebar-header"]',
    openSidebar: true,
  },
  {
    id: "dashboard",
    title: "Dashboard",
    body: "Your home base — active projects, look-aheads, and schedules at a glance.",
    selector: '[data-tour="nav-dashboard"]',
    openSidebar: true,
  },
  {
    id: "projects",
    title: "Projects",
    body:
      "Create a job, upload its master schedule (PDF, Excel, or MPP), and LeanLook turns it into look-aheads.",
    selector: '[data-tour="nav-projects"]',
    openSidebar: true,
  },
  {
    id: "lookaheads",
    title: "Look-Aheads",
    body: "Your editable 2-week plan — commit work by day and mark daily progress.",
    selector: '[data-tour="nav-lookaheads"]',
    openSidebar: true,
  },
  {
    id: "huddle",
    title: "Daily Huddle",
    body: "The morning stand-up: see today's tasks, tap a status, and flag blockers.",
    selector: '[data-tour="nav-huddle"]',
    openSidebar: true,
  },
  {
    id: "master-tasks",
    title: "Master Tasks",
    body: "Your reusable library of standard tasks that auto-fills new look-aheads.",
    selector: '[data-tour="nav-master-tasks"]',
    openSidebar: true,
  },
  {
    id: "subs",
    title: "Sub Contractors",
    body: "Your subs directory — trades, contacts, and insurance-expiration warnings.",
    selector: '[data-tour="nav-subcontractors"]',
    openSidebar: true,
  },
  {
    id: "analytics",
    title: "Analytics",
    body: "Track PPC (Percent Plan Complete) trends by project and superintendent.",
    selector: '[data-tour="nav-analytics"]',
    optional: true,
    openSidebar: true,
  },
  {
    id: "new-project",
    title: "Ready to start?",
    body: "Create your first project from this button.",
    selector: '[data-tour="new-project-btn"]',
    closeSidebar: true,
    navigateTo: "/",
  },
];

const PADDING = 8;
const TOOLTIP_W = 320;
const TOOLTIP_GAP = 12;

type Rect = { top: number; left: number; width: number; height: number };

export function ProductTour({ onClose }: { onClose: (dontShowAgain: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [dontShow, setDontShow] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0); // force re-measure
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Filter optional steps whose targets don't exist at all
  const steps = useMemo(() => {
    return STEPS.filter((s) => {
      if (!s.optional || !s.selector) return true;
      return !!document.querySelector(s.selector);
    });
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps[Math.min(index, steps.length - 1)];

  // Navigate / open sidebar drawer per step
  useEffect(() => {
    if (!step) return;
    if (step.navigateTo && location.pathname !== step.navigateTo) {
      navigate(step.navigateTo);
    }
    if (isMobile) {
      if (step.openSidebar) setOpenMobile(true);
      if (step.closeSidebar) setOpenMobile(false);
    }
  }, [step, isMobile, setOpenMobile, navigate, location.pathname]);

  // Measure target rect (with retries while the target mounts)
  useLayoutEffect(() => {
    if (!step) return;
    if (step.center || !step.selector) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector!) as HTMLElement | null;
      if (el && el.getBoundingClientRect().width > 0) {
        try {
          el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        } catch {
          /* ignore */
        }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (attempts < 20) {
        attempts++;
        window.setTimeout(measure, 80);
      } else {
        // Give up → centered fallback
        setRect(null);
      }
    };
    measure();
    return () => {
      cancelled = true;
    };
  }, [step, tick]);

  // Reposition on resize/scroll
  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, []);

  const finish = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    onClose(dontShow);
  }, [dontShow, isMobile, onClose, setOpenMobile]);

  const skip = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    // Always mark as seen on skip
    onClose(true);
  }, [isMobile, onClose, setOpenMobile]);

  if (!step) return null;

  const isLast = index >= steps.length - 1;
  const useCentered = step.center || !rect;

  // Compute tooltip position
  let tooltipStyle: React.CSSProperties;
  if (useCentered) {
    tooltipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: `min(${TOOLTIP_W}px, calc(100vw - 24px))`,
      zIndex: 10001,
    };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = Math.min(TOOLTIP_W, vw - 24);
    const th = 240; // approx; clamped against viewport
    const spaceBelow = vh - (rect!.top + rect!.height);
    const spaceAbove = rect!.top;
    const placeBelow = spaceBelow > th + TOOLTIP_GAP || spaceBelow >= spaceAbove;
    let top = placeBelow
      ? rect!.top + rect!.height + TOOLTIP_GAP
      : Math.max(12, rect!.top - th - TOOLTIP_GAP);
    let left = rect!.left + rect!.width / 2 - tw / 2;
    left = Math.max(12, Math.min(left, vw - tw - 12));
    top = Math.max(12, Math.min(top, vh - 12));
    tooltipStyle = {
      position: "fixed",
      top,
      left,
      width: tw,
      zIndex: 10001,
    };
  }

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 10000 }}>
      {useCentered ? (
        // Full-screen dim
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          onClick={() => skip()}
        />
      ) : (
        <>
          {/* 4 dim panels around target (spotlight cutout) */}
          <div
            className="absolute bg-black/60 backdrop-blur-[2px]"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect!.top - PADDING) }}
          />
          <div
            className="absolute bg-black/60 backdrop-blur-[2px]"
            style={{
              top: rect!.top + rect!.height + PADDING,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            className="absolute bg-black/60 backdrop-blur-[2px]"
            style={{
              top: Math.max(0, rect!.top - PADDING),
              left: 0,
              width: Math.max(0, rect!.left - PADDING),
              height: rect!.height + PADDING * 2,
            }}
          />
          <div
            className="absolute bg-black/60 backdrop-blur-[2px]"
            style={{
              top: Math.max(0, rect!.top - PADDING),
              left: rect!.left + rect!.width + PADDING,
              right: 0,
              height: rect!.height + PADDING * 2,
            }}
          />
          {/* Ring around target */}
          <div
            className="absolute pointer-events-none rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200"
            style={{
              top: rect!.top - PADDING / 2,
              left: rect!.left - PADDING / 2,
              width: rect!.width + PADDING,
              height: rect!.height + PADDING,
            }}
          />
        </>
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="rounded-xl border bg-card text-card-foreground shadow-2xl p-4 sm:p-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-xs font-medium text-muted-foreground">
            Step {index + 1} of {steps.length}
          </div>
          <button
            type="button"
            onClick={skip}
            aria-label="Close tour"
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 p-1 rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-base sm:text-lg font-semibold leading-tight">{step.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>

        <label className="mt-4 flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox
            checked={dontShow}
            onCheckedChange={(v) => setDontShow(v === true)}
          />
          <span className="text-muted-foreground">Don't show this tour again</span>
        </label>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={skip}
            className="text-xs sm:text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline min-h-11 px-1"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="min-h-11"
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (isLast) finish();
                else setIndex((i) => i + 1);
              }}
              className="min-h-11"
            >
              {isLast ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}