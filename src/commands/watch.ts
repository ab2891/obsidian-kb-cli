import * as fs from "fs";
import * as path from "path";
import kleur from "kleur";
import chokidar from "chokidar";
import { runLint, printHuman, LintOptions } from "./lint";

interface WatchOptions extends LintOptions {
  debounceMs?: string;
}

/**
 * Watch a vault for .md file changes and re-lint on every change. Uses
 * chokidar so it works across WSL → Windows mounts and OneDrive folders
 * where vanilla fs.watch is unreliable. Debounces rapid bursts of saves
 * (atomic-write editors generate 2-3 events per save) into a single re-lint.
 *
 * Initial lint runs on startup before entering the watch loop. Ctrl+C to exit.
 */
export async function watchCommand(vault: string, opts: WatchOptions): Promise<void> {
  const absVault = path.resolve(vault);
  if (!fs.existsSync(absVault) || !fs.statSync(absVault).isDirectory()) {
    throw new Error(`Vault not found: ${absVault}`);
  }

  const debounceMs = parseDebounceMs(opts.debounceMs);

  let runCount = 0;
  let lastChange: { event: string; relPath: string } | null = null;
  let pending: NodeJS.Timeout | null = null;
  let running = false;

  const lintAndPrint = (): void => {
    runCount++;
    clearScreen();
    const ts = new Date().toLocaleTimeString();
    const header =
      kleur.bold("obsidian-kb watch") +
      kleur.dim(` — run #${runCount} at ${ts}`);
    console.log(header);
    if (lastChange) {
      const ev = changeBadge(lastChange.event);
      console.log(`Trigger: ${ev} ${kleur.cyan(lastChange.relPath)}`);
    } else {
      console.log(kleur.dim("Trigger: (initial run)"));
    }
    console.log("");

    try {
      const result = runLint(absVault, opts);
      printHuman(result.vault, result.topics, result.findings);
    } catch (err) {
      console.log(kleur.red("Lint error: ") + ((err as Error).message ?? String(err)));
    }
    console.log("");
    console.log(
      kleur.dim(
        `Watching ${absVault} for *.md changes — Ctrl+C to exit (debounce ${debounceMs}ms)`,
      ),
    );
  };

  const schedule = (event: string, filepath: string): void => {
    lastChange = { event, relPath: path.relative(absVault, filepath) || filepath };
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      if (running) {
        // Coalesce: re-schedule on top of the running pass
        schedule(event, filepath);
        return;
      }
      running = true;
      try {
        lintAndPrint();
      } finally {
        running = false;
      }
    }, debounceMs);
  };

  // Initial pass before starting the watcher
  lintAndPrint();

  const watcher = chokidar.watch(absVault, {
    ignored: (filepath: string) => {
      const base = path.basename(filepath);
      // Always allow the vault root
      if (filepath === absVault) return false;
      // Skip dotfile dirs (.obsidian, .trash, .git) and node_modules
      if (base.startsWith(".") || base === "node_modules") return true;
      // For files: only watch markdown
      try {
        if (fs.statSync(filepath).isFile()) {
          return !filepath.endsWith(".md");
        }
      } catch {
        // path may have been removed between event and stat — let chokidar handle it
      }
      return false;
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher
    .on("add", (p: string) => schedule("add", p))
    .on("change", (p: string) => schedule("change", p))
    .on("unlink", (p: string) => schedule("unlink", p))
    .on("error", (err: unknown) => {
      console.error(kleur.red("watcher error: ") + ((err as Error).message ?? String(err)));
    });

  // Hold the process open until Ctrl+C
  process.on("SIGINT", () => {
    console.log("\n" + kleur.dim("watch stopped."));
    void watcher.close().then(() => process.exit(0));
  });
}

function parseDebounceMs(raw: string | undefined): number {
  if (raw === undefined) return 250;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`--debounce must be a non-negative number of ms, got "${raw}"`);
  }
  return n;
}

function clearScreen(): void {
  // ANSI clear-screen + cursor-home — matches what vitest/jest watch use
  process.stdout.write("\x1Bc");
}

function changeBadge(event: string): string {
  switch (event) {
    case "add":
      return kleur.bgGreen().black().bold(" ADD    ");
    case "change":
      return kleur.bgCyan().black().bold(" CHANGE ");
    case "unlink":
      return kleur.bgMagenta().white().bold(" REMOVE ");
    default:
      return kleur.bgWhite().black().bold(` ${event.toUpperCase().padEnd(6)} `);
  }
}
