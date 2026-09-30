import "server-only";

export const WEEK_ONE_PRACTICE_RELEASE = "2026-10-02T00:00:00+05:30";

export function weekOnePracticeOpen(now = Date.now()): boolean {
  return Number.isFinite(now) && now >= Date.parse(WEEK_ONE_PRACTICE_RELEASE);
}