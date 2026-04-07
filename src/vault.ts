import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

export interface Note {
  /** Absolute path on disk */
  absPath: string;
  /** Path relative to the vault root, without the .md extension */
  vaultPath: string;
  /** Just the filename without .md */
  basename: string;
  /** Top-level folder name, or "" if at vault root */
  topic: string;
  /** Parsed frontmatter (empty object if none) */
  frontmatter: Record<string, unknown>;
  /** Markdown body (frontmatter stripped) */
  body: string;
}

/**
 * Recursively walk a vault and return every .md note. Skips dotfile dirs
 * (.obsidian, .trash, etc.) and `node_modules` defensively.
 */
export function readVault(vaultRoot: string): Note[] {
  const out: Note[] = [];
  walk(vaultRoot, vaultRoot, out);
  return out;
}

function walk(root: string, dir: string, out: Note[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, abs, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(parseNote(root, abs));
    }
  }
}

function parseNote(root: string, abs: string): Note {
  const raw = fs.readFileSync(abs, "utf8");
  const parsed = matter(raw);
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  const vaultPath = rel.replace(/\.md$/i, "");
  const basename = path.basename(abs, path.extname(abs));
  const topic = vaultPath.includes("/") ? vaultPath.split("/")[0] : "";
  return {
    absPath: abs,
    vaultPath,
    basename,
    topic,
    frontmatter: (parsed.data ?? {}) as Record<string, unknown>,
    body: parsed.content,
  };
}

/**
 * Find every `[[wikilink]]` in a markdown body. Strips alias (`[[X|alias]]`) and
 * heading anchor (`[[X#heading]]`) suffixes. Ignores embeds (`![[X]]`). Strips
 * fenced code blocks and inline code spans first so literal `[[X]]` examples in
 * docs aren't reported as broken links.
 */
export function extractWikilinks(body: string): string[] {
  const stripped = stripCode(body);
  const out: string[] = [];
  // Negative lookbehind for `!` to skip `![[embed]]`
  const re = /(?<!!)\[\[([^\]\n]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const inner = m[1].split("|")[0].split("#")[0].trim();
    if (inner) out.push(inner);
  }
  return out;
}

/** Replace fenced code blocks and inline code spans with same-length whitespace
 *  so character offsets are preserved (helpful if we later add line numbers). */
function stripCode(body: string): string {
  // Fenced code blocks ```...``` (greedy non-newline language tag, multiline body)
  let out = body.replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));
  // Inline code spans `...` (non-greedy, single line)
  out = out.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  return out;
}

/**
 * Resolve a wikilink target (`Projects/lifeBot` or bare `lifeBot`) to a Note in the
 * vault, or return undefined if no such note exists. Folder-prefixed wikilinks are
 * matched by exact `vaultPath`; bare wikilinks fall back to a unique `basename` match.
 */
export function resolveWikilink(target: string, notes: Note[]): Note | undefined {
  const norm = target.replace(/\\/g, "/").replace(/\.md$/i, "");
  if (norm.includes("/")) {
    return notes.find((n) => n.vaultPath === norm);
  }
  const matches = notes.filter((n) => n.basename === norm);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Discover every "topic" in the vault — a top-level folder containing an `index.md`.
 * These are the folders the KB workflow tracks.
 */
export function discoverTopics(notes: Note[]): string[] {
  const topics = new Set<string>();
  for (const n of notes) {
    if (n.topic && n.basename.toLowerCase() === "index") {
      topics.add(n.topic);
    }
  }
  return [...topics].sort();
}

/**
 * For a topic, list every entry note (i.e. excluding index.md, log.md, CLAUDE.md,
 * _skills-matrix.md, and other underscore- or special-prefixed convention files).
 */
export function entryNotesForTopic(topic: string, notes: Note[]): Note[] {
  return notes.filter((n) => n.topic === topic && isEntryNote(n.basename));
}

const RESERVED_BASENAMES = new Set([
  "index",
  "log",
  "claude",
  "agents",
  "readme",
]);

function isEntryNote(basename: string): boolean {
  if (basename.startsWith("_")) return false;
  return !RESERVED_BASENAMES.has(basename.toLowerCase());
}
