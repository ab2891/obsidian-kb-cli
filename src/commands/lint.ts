import * as fs from "fs";
import * as path from "path";
import kleur from "kleur";
import {
  readVault,
  extractWikilinks,
  resolveWikilink,
  discoverTopics,
  entryNotesForTopic,
  Note,
} from "../vault";
import { extractTopicSchema } from "../schema";
import { lastGitTouchMs, isStale, formatRelative } from "../staleness";

export interface Finding {
  severity: "error" | "warn" | "info";
  topic: string;
  category:
    | "orphan"
    | "broken-link"
    | "missing-frontmatter"
    | "missing-type"
    | "not-in-index"
    | "schema-drift"
    | "stale-claim";
  note?: string;
  detail: string;
}

export interface LintOptions {
  topic?: string;
  json?: boolean;
  staleMonths?: string;
}

export interface LintResult {
  vault: string;
  topics: string[];
  findings: Finding[];
}

/**
 * Pure(-ish) lint runner — does I/O to read the vault and shells out to git
 * for stale-claim checks, but does not exit the process or print anything.
 * Reusable from `lintCommand` and from `watchCommand`.
 */
export function runLint(vault: string, opts: LintOptions): LintResult {
  const absVault = path.resolve(vault);
  if (!fs.existsSync(absVault) || !fs.statSync(absVault).isDirectory()) {
    throw new Error(`Vault not found: ${absVault}`);
  }

  const notes = readVault(absVault);
  const allTopics = discoverTopics(notes);

  const topics = opts.topic ? [opts.topic] : allTopics;
  if (opts.topic && !allTopics.includes(opts.topic)) {
    throw new Error(
      `Topic "${opts.topic}" has no index.md in ${absVault}. Available topics with an index.md: ${allTopics.join(", ") || "(none)"}`,
    );
  }

  const staleMonths = parseStaleMonths(opts.staleMonths);

  const findings: Finding[] = [];
  for (const topic of topics) {
    findings.push(...lintTopic(topic, notes, staleMonths));
  }

  return { vault: absVault, topics, findings };
}

export async function lintCommand(vault: string, opts: LintOptions): Promise<void> {
  const result = runLint(vault, opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printHuman(result.vault, result.topics, result.findings);
  }
  process.exit(result.findings.some((f) => f.severity === "error") ? 1 : 0);
}

function parseStaleMonths(raw: string | undefined): number {
  if (raw === undefined) return 6;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--stale-months must be a positive number, got "${raw}"`);
  }
  return n;
}

function lintTopic(topic: string, notes: Note[], staleMonths: number): Finding[] {
  const findings: Finding[] = [];

  const indexNote = notes.find(
    (n) => n.topic === topic && n.basename.toLowerCase() === "index",
  );
  if (!indexNote) return findings;

  const claudeNote = notes.find(
    (n) => n.topic === topic && n.basename.toLowerCase() === "claude",
  );
  const schemaFields = claudeNote ? extractTopicSchema(claudeNote.body) : null;

  const entries = entryNotesForTopic(topic, notes);
  const indexBody = indexNote.body;

  // 1. Orphan notes — entry files not referenced by topic/index.md
  for (const entry of entries) {
    const candidates = [
      `[[${entry.vaultPath}]]`,
      `[[${entry.basename}]]`,
      `[[${entry.vaultPath}|`,
      `[[${entry.basename}|`,
      `[[${entry.vaultPath}#`,
      `[[${entry.basename}#`,
    ];
    const referenced = candidates.some((needle) => indexBody.includes(needle));
    if (!referenced) {
      findings.push({
        severity: "warn",
        topic,
        category: "not-in-index",
        note: entry.vaultPath,
        detail: `Entry note exists on disk but is not linked from ${topic}/index.md`,
      });
    }
  }

  // 2. Missing frontmatter on entry notes
  for (const entry of entries) {
    if (Object.keys(entry.frontmatter).length === 0) {
      findings.push({
        severity: "warn",
        topic,
        category: "missing-frontmatter",
        note: entry.vaultPath,
        detail: "Entry note has no YAML frontmatter — queries can't filter on it",
      });
      continue;
    }
    if (entry.frontmatter.type === undefined) {
      findings.push({
        severity: "info",
        topic,
        category: "missing-type",
        note: entry.vaultPath,
        detail: "Entry note has frontmatter but is missing the `type` field",
      });
    }
  }

  // 3. Schema drift — entry frontmatter missing fields declared in topic CLAUDE.md
  if (schemaFields && schemaFields.length > 0) {
    for (const entry of entries) {
      if (Object.keys(entry.frontmatter).length === 0) continue; // already reported
      const missing = schemaFields.filter((k) => !(k in entry.frontmatter));
      if (missing.length > 0) {
        findings.push({
          severity: "info",
          topic,
          category: "schema-drift",
          note: entry.vaultPath,
          detail: `Missing frontmatter field${missing.length === 1 ? "" : "s"} declared in ${topic}/CLAUDE.md: ${missing.join(", ")}`,
        });
      }
    }
  }

  // 4. Stale claims — entries marked status: active whose local_path hasn't moved in N months
  for (const entry of entries) {
    const status = entry.frontmatter.status;
    if (status !== "active") continue;
    const localPath = entry.frontmatter.local_path;
    if (typeof localPath !== "string" || !localPath) continue;
    const touched = lastGitTouchMs(localPath);
    if (touched === null) continue; // path missing or not a git repo — silent
    if (isStale(touched, staleMonths)) {
      findings.push({
        severity: "warn",
        topic,
        category: "stale-claim",
        note: entry.vaultPath,
        detail: `status: active but local_path "${localPath}" last touched ${formatRelative(touched)} (>${staleMonths}mo). Consider updating status or refreshing the note.`,
      });
    }
  }

  // 5. Broken wikilinks anywhere in the topic (including index, log, entries)
  const topicNotes = notes.filter((n) => n.topic === topic);
  for (const n of topicNotes) {
    const links = extractWikilinks(n.body);
    for (const link of links) {
      const resolved = resolveWikilink(link, notes);
      if (!resolved) {
        findings.push({
          severity: "error",
          topic,
          category: "broken-link",
          note: n.vaultPath,
          detail: `[[${link}]] does not resolve to any note in the vault`,
        });
      }
    }
  }

  return findings;
}

export function printHuman(vault: string, topics: string[], findings: Finding[]): void {
  console.log(kleur.bold(`obsidian-kb lint`) + ` — ${vault}`);
  console.log(`Topics scanned: ${topics.join(", ") || kleur.dim("(none)")}`);
  console.log("");

  if (findings.length === 0) {
    console.log(kleur.green("✓ Clean. No findings."));
    return;
  }

  const byTopic = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byTopic.has(f.topic)) byTopic.set(f.topic, []);
    byTopic.get(f.topic)!.push(f);
  }

  for (const [topic, ts] of byTopic) {
    console.log(kleur.bold().underline(topic));
    for (const f of ts) {
      const tag = severityTag(f.severity);
      const cat = kleur.dim(`[${f.category}]`);
      const where = f.note ? kleur.cyan(f.note) : "";
      console.log(`  ${tag} ${cat} ${where}`);
      console.log(`     ${f.detail}`);
    }
    console.log("");
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const infos = findings.filter((f) => f.severity === "info").length;
  console.log(
    kleur.bold("Summary: ") +
      `${kleur.red(`${errors} errors`)}, ${kleur.yellow(`${warns} warnings`)}, ${kleur.dim(`${infos} info`)}`,
  );
}

function severityTag(s: Finding["severity"]): string {
  switch (s) {
    case "error":
      return kleur.bgRed().white().bold(" ERROR ");
    case "warn":
      return kleur.bgYellow().black().bold(" WARN  ");
    case "info":
      return kleur.bgBlue().white().bold(" INFO  ");
  }
}
