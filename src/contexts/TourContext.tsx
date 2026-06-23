import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProductTour } from "@/components/ProductTour";

type TourContextValue = {
  startTour: () => void;
  isOpen: boolean;
};

const TourContext = createContext<TourContextValue>({
  startTour: () => {},
  isOpen: false,
});

export const useTour = () => useContext(TourContext);

const tourSeenKey = (uid: string) => `leanlook.tourSeen.${uid}`;
const legacyWelcomeKey = (uid: string) => `leanlook.welcomeSeen.${uid}`;

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Auto-launch on first login per user
  useEffect(() => {
    if (!user?.id) return;
    try {
      const seen =
        localStorage.getItem(tourSeenKey(user.id)) ||
        localStorage.getItem(legacyWelcomeKey(user.id));
      if (!seen) {
        // Small delay so the app shell is mounted and target elements exist
        const t = window.setTimeout(() => setOpen(true), 400);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const startTour = useCallback(() => setOpen(true), []);

  const handleClose = useCallback(
    (dontShowAgain: boolean) => {
      setOpen(false);
      if (user?.id && dontShowAgain) {
        try {
          localStorage.setItem(tourSeenKey(user.id), new Date().toISOString());
        } catch {
          /* ignore */
        }
      }
    },
    [user?.id],
  );

  return (
    <TourContext.Provider value={{ startTour, isOpen: open }}>
      {children}
      {open && <ProductTour onClose={handleClose} />}
    </TourContext.Provider>
  );
}