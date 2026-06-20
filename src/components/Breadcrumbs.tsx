import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs() {
  const location = useLocation();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);

  useEffect(() => {
    buildCrumbs(location.pathname).then(setCrumbs);
  }, [location.pathname]);

  if (crumbs.length <= 1) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast || !crumb.href ? (
                  <BreadcrumbPage className="text-xs">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.href} className="text-xs hover:text-foreground">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

async function buildCrumbs(pathname: string): Promise<Crumb[]> {
  const crumbs: Crumb[] = [{ label: "Dashboard", href: "/" }];

  // /projects
  if (pathname === "/projects") {
    crumbs.push({ label: "Projects" });
    return crumbs;
  }

  // /projects/new
  if (pathname === "/projects/new") {
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({ label: "New Project" });
    return crumbs;
  }

  // /projects/:id/lookahead/new
  const newLAMatch = pathname.match(/^\/projects\/([^/]+)\/lookahead\/new$/);
  if (newLAMatch) {
    const projectId = newLAMatch[1];
    const projectName = await fetchProjectName(projectId);
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({ label: projectName, href: `/projects/${projectId}` });
    crumbs.push({ label: "New Look-Ahead" });
    return crumbs;
  }

  // /projects/:id/lookahead/:laId
  const laMatch = pathname.match(/^\/projects\/([^/]+)\/lookahead\/([^/]+)$/);
  if (laMatch) {
    const projectId = laMatch[1];
    const lookaheadId = laMatch[2];
    const [projectName, weekStart] = await Promise.all([
      fetchProjectName(projectId),
      fetchLookaheadWeek(lookaheadId),
    ]);
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({ label: projectName, href: `/projects/${projectId}` });
    crumbs.push({ label: weekStart ? `Look-Ahead (Week of ${weekStart})` : "Look-Ahead" });
    return crumbs;
  }

  // /projects/:id
  const projMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projMatch) {
    const projectId = projMatch[1];
    const projectName = await fetchProjectName(projectId);
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({ label: projectName });
    return crumbs;
  }

  // Simple routes
  const simpleRoutes: Record<string, string> = {
    "/lookaheads": "Look-Aheads",
    "/analytics": "Analytics",
    "/settings": "Settings",
    "/master-tasks": "Master Tasks",
    "/subcontractors": "Sub Contractors",
  };

  if (simpleRoutes[pathname]) {
    crumbs.push({ label: simpleRoutes[pathname] });
    return crumbs;
  }

  return crumbs;
}

// Cache to avoid repeated fetches during the same session
const nameCache = new Map<string, string>();

async function fetchProjectName(projectId: string): Promise<string> {
  if (nameCache.has(`project-${projectId}`)) return nameCache.get(`project-${projectId}`)!;
  const { data } = await supabase.from("projects").select("name").eq("id", projectId).single();
  const name = data?.name || "Project";
  nameCache.set(`project-${projectId}`, name);
  return name;
}

async function fetchLookaheadWeek(lookaheadId: string): Promise<string> {
  if (nameCache.has(`la-${lookaheadId}`)) return nameCache.get(`la-${lookaheadId}`)!;
  const { data } = await supabase.from("look_aheads").select("week_start_date").eq("id", lookaheadId).single();
  const formatted = data?.week_start_date ? format(parseISO(data.week_start_date), "MMM d, yyyy") : "";
  nameCache.set(`la-${lookaheadId}`, formatted);
  return formatted;
}
