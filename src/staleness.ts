import { execSync } from "child_process";
import * as fs from "fs";

/**
 * For an entry note whose frontmatter declares a `local_path`, return the most
 * recent commit timestamp from that path's git history (in ms since epoch), or
 * null if the path doesn't exist or isn't inside a git repo.
 */
export function lastGitTouchMs(localPath: string): number | null {
  if (!localPath || !fs.existsSync(localPath)) return null;
  try {
    const out = execSync(`git -C "${localPath}" log -1 --format=%cI`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (!out) return null;
    const ts = Date.parse(out);
    return Number.isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Whether a given timestamp is older than the threshold.
 */
export function isStale(touchedMs: number | null, staleMonths: number): boolean {
  if (touchedMs === null) return false;
  const cutoffMs = Date.now() - staleMonths * 30 * 24 * 60 * 60 * 1000;
  return touchedMs < cutoffMs;
}

/**
 * Format an absolute timestamp as a relative human string ("3 months ago").
 */
export function formatRelative(touchedMs: number): string {
  const deltaMs = Date.now() - touchedMs;
  const days = Math.floor(deltaMs / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
