import * as fs from "fs";
import * as path from "path";
import kleur from "kleur";

interface LogOptions {
  vault: string;
  kind: string;
}

export async function logCommand(
  topic: string,
  message: string,
  opts: LogOptions,
): Promise<void> {
  const vault = path.resolve(opts.vault);
  const logPath = path.join(vault, topic, "log.md");
  if (!fs.existsSync(logPath)) {
    throw new Error(
      `${path.relative(vault, logPath)} does not exist. Bootstrap the topic first: obkb bootstrap ${topic} --vault ${vault}`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const lines = message.trim().split("\n");
  const heading = lines[0];
  const rest = lines.slice(1).join("\n");

  const entry =
    `## [${today}] ${opts.kind} | ${heading}\n` + (rest ? `${rest}\n` : "") + "\n";

  const existing = fs.readFileSync(logPath, "utf8");

  // Insert the new entry above the first existing `## ` heading, or at the top if none.
  const headingMatch = existing.match(/^## /m);
  let updated: string;
  if (headingMatch && headingMatch.index !== undefined) {
    updated =
      existing.slice(0, headingMatch.index) + entry + existing.slice(headingMatch.index);
  } else {
    // No prior entries — append after the file's intro lines.
    const trimmed = existing.replace(/\s*$/, "\n\n");
    updated = trimmed + entry;
  }

  fs.writeFileSync(logPath, updated);
  console.log(
    kleur.green("logged") +
      ` ${path.relative(vault, logPath)} — ${kleur.dim(`[${today}] ${opts.kind} | ${heading}`)}`,
  );
}
