import { useEffect, useState } from "react";

export type Route =
  | { name: "results" }
  | { name: "portfolio" }
  | { name: "filters" }
  | { name: "stock"; symbol: string };

/**
 * Parse a hash string (with or without leading "#") into a Route.
 * Unknown paths fall back to the results home so the app never gets
 * stuck on a 404 — useful for misconfigured deep-links.
 */
export function parseRoute(hash: string): Route {
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
  if (path === "" || path === "/" || path === "/results") return { name: "results" };
  if (path === "/portfolio") return { name: "portfolio" };
  if (path === "/filters") return { name: "filters" };
  const stockMatch = path.match(/^\/stock\/(.+)$/);
  if (stockMatch) return { name: "stock", symbol: decodeURIComponent(stockMatch[1]!) };
  return { name: "results" };
}

export type HashRouter = {
  route: Route;
  navigate: (path: string) => void;
};

export function useHashRoute(): HashRouter {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = (path: string): void => {
    window.location.hash = path;
  };

  return { route: parseRoute(hash), navigate };
}
