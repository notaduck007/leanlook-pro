import { createRoot } from "react-dom/client";
import "./index.css";

async function clearStaleOfflineCaches() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!("caches" in window)) return;

  const cacheKeys = await window.caches.keys();
  await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
}

async function bootstrap() {
  await clearStaleOfflineCaches();
  const { default: App } = await import("./App.tsx");

  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap app", error);
});
