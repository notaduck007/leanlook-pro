import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TourProvider, useTour } from "@/contexts/TourContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

function TourHelpButton() {
  const { startTour } = useTour();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Take a tour"
          onClick={startTour}
          className="min-h-11 min-w-11"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Take a tour</TooltipContent>
    </Tooltip>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <TourProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <SidebarTrigger className="shrink-0" />
                <Breadcrumbs />
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <TourHelpButton />
                <ThemeToggle />
                <NotificationBell />
              </div>
            </header>
            <main className="flex-1 p-4 md:p-6 overflow-auto pb-safe pl-safe pr-safe">
              {children}
            </main>
          </div>
        </div>
      </TourProvider>
    </SidebarProvider>
  );
}
