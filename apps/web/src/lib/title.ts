import { useEffect } from "react";

/** Per-route document titles — browser history and shared tabs stay legible. */
export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    if (title) {
      document.title = `${title.slice(0, 60)} · World Trade Explorer`;
    }
  }, [title]);
}
