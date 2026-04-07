import * as fs from "fs";
import * as path from "path";
import kleur from "kleur";
import { readVault, entryNotesForTopic } from "../vault";

interface IndexOptions {
  vault: string;
  output: string;
  force?: boolean;
}

export async function indexCommand(topic: string, opts: IndexOptions): Promise<void> {
  const vault = path.resolve(opts.vault);
  if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) {
    throw new Error(`Vault not found: ${vault}`);
  }

  const notes = readVault(vault);
  const entries = entryNotesForTopic(topic, notes);
  if (entries.length === 0) {
    throw new Error(
      `No entry notes found under ${topic}/. Did you mean a different topic? (Reserved files like index.md / log.md / CLAUDE.md are excluded.)`,
    );
  }

  // Group entries by status, then by type. status: active goes first.
  const byStatus = new Map<string, typeof entries>();
  for (const e of entries) {
    const s = (e.frontmatter.status as string | undefined) ?? "(unspecified)";
    if (!byStatus.has(s)) byStatus.set(s, []);
    byStatus.get(s)!.push(e);
  }
  const statusOrder = ["active", "maintenance", "draft", "archived", "(unspecified)"];
  const orderedStatuses = [...byStatus.keys()].sort((a, b) => {
    const ia = statusOrder.indexOf(a);
    const ib = statusOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  let body = `## ${topic} — Catalog\n\n`;
  body += `_Auto-generated draft. Schema and workflows: [[${topic}/CLAUDE]]._\n\n`;

  for (const status of orderedStatuses) {
    body += `### ${capitalize(status)}\n\n`;
    const items = byStatus.get(status)!.sort((a, b) =>
      a.basename.localeCompare(b.basename),
    );
    for (const e of items) {
      const type = (e.frontmatter.type as string | undefined) ?? "";
      const elevator = extractElevator(e.body);
      const typeTag = type ? ` _(${type})_` : "";
      body += `- [[${e.vaultPath}]]${typeTag}`;
      if (elevator) body += ` — ${elevator}`;
      body += "\n";
    }
    body += "\n";
  }

  if (opts.output === "-") {
    process.stdout.write(body);
    return;
  }

  const outAbs = path.resolve(opts.output);
  if (fs.existsSync(outAbs) && !opts.force) {
    throw new Error(
      `${outAbs} already exists. Pass --force to overwrite, or pipe stdout to a file instead.`,
    );
  }
  fs.writeFileSync(outAbs, body);
  console.error(kleur.green("write") + ` ${outAbs}`);
}

/** Pull the first paragraph of body text after the first heading. */
function extractElevator(body: string): string {
  const lines = body.split("\n");
  let inFirstSection = false;
  const buf: string[] = [];
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (!inFirstSection) {
        inFirstSection = true;
        continue;
      }
      break;
    }
    if (line.startsWith("## ")) {
      if (inFirstSection) break;
      continue;
    }
    if (inFirstSection) {
      if (line.trim() === "" && buf.length > 0) break;
      if (line.trim() !== "") buf.push(line.trim());
    }
  }
  const text = buf.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  // Truncate to ~140 chars
  return text.length > 140 ? text.slice(0, 137).trimEnd() + "…" : text;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
