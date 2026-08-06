// Minimal privacy-first analytics: events are appended to a per-session
// buffer in localStorage so they survive reloads, and are never sent off
// device. Swap `track` internals for a real backend later if needed.

export type AnalyticsEvent =
  | { type: "time_to_first_match"; level: number; ms: number }
  | { type: "add_rows_used"; level: number; used: number; won: boolean }
  | { type: "completion_time"; level: number; ms: number; won: boolean }
  | { type: "rescue_triggered"; level: number; reason: string };

const STORAGE_KEY = "logic-link:analytics";
const SESSION_LIMIT = 500;

export function track(event: AnalyticsEvent): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: unknown[] = raw ? JSON.parse(raw) : [];
    list.push({ ts: Date.now(), ...event });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-SESSION_LIMIT)));
    if (import.meta.env.DEV) {
      console.debug("[analytics]", event.type, event);
    }
  } catch {
    // Storage full or unavailable — analytics must never break the game.
  }
}

export function getAnalyticsEvents(): AnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

export function clearAnalytics(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
