#!/usr/bin/env node
import { Command } from "commander";
import { lintCommand } from "./commands/lint";
import { bootstrapCommand } from "./commands/bootstrap";
import { logCommand } from "./commands/log";
import { indexCommand } from "./commands/index-cmd";
import { watchCommand } from "./commands/watch";

const program = new Command();

program
  .name("obkb")
  .description(
    "Karpathy-style LLM-wiki workflow for Obsidian vaults — lint, watch, bootstrap, index, log",
  )
  .version("0.2.0");

program.addHelpCommand("help [command]", "Display help for a command");

program
  .command("lint")
  .description(
    "Lint a topic folder for orphans, broken wikilinks, missing frontmatter, schema drift, and stale claims",
  )
  .argument("<vault>", "Absolute path to the Obsidian vault root")
  .option(
    "-t, --topic <topic>",
    "Restrict lint to a single top-level topic folder (e.g. Projects). If omitted, lints every topic folder that has an index.md.",
  )
  .option(
    "--stale-months <n>",
    "Treat status:active entries whose local_path git-history hasn't moved in this many months as stale (default 6)",
  )
  .option("--json", "Emit findings as JSON instead of human-readable output")
  .action(lintCommand);

program
  .command("bootstrap")
  .description(
    "Bootstrap a new topic KB folder with CLAUDE.md, index.md, and log.md",
  )
  .argument("<topic>", "Topic folder name (e.g. Papers, Books, Recipes)")
  .requiredOption("-v, --vault <path>", "Absolute path to the Obsidian vault root")
  .option(
    "--template <kind>",
    "Topic template to use: generic | projects | papers | books | people",
    "generic",
  )
  .option("--force", "Overwrite existing files in the topic folder if they exist")
  .action(bootstrapCommand);

program
  .command("watch")
  .description(
    "Watch a vault for .md changes and re-lint on every change (vitest-watch style)",
  )
  .argument("<vault>", "Absolute path to the Obsidian vault root")
  .option(
    "-t, --topic <topic>",
    "Restrict lint to a single top-level topic folder. If omitted, lints every topic with an index.md.",
  )
  .option(
    "--stale-months <n>",
    "Treat status:active entries whose local_path git-history hasn't moved in this many months as stale (default 6)",
  )
  .option(
    "--debounce <ms>",
    "Coalesce file events within this many ms before re-linting (default 250)",
  )
  .action(watchCommand);

program
  .command("index")
  .description(
    "Emit a fresh draft <topic>/index.md to stdout (or --output) from on-disk entries — non-destructive, never overwrites by itself",
  )
  .argument("<topic>", "Topic folder name (e.g. Projects)")
  .requiredOption("-v, --vault <path>", "Absolute path to the Obsidian vault root")
  .option(
    "-o, --output <path>",
    "Write the draft to this path instead of stdout. Use '-' for stdout (default).",
    "-",
  )
  .option("--force", "Allow --output to overwrite an existing file")
  .action(indexCommand);

program
  .command("log")
  .description("Prepend a dated entry to <topic>/log.md (for cron jobs, git hooks)")
  .argument("<topic>", "Topic folder name (e.g. Projects)")
  .argument("<message>", "Log message — first line will be the heading")
  .requiredOption("-v, --vault <path>", "Absolute path to the Obsidian vault root")
  .option(
    "--kind <kind>",
    "Entry kind shown in the heading (ingest | update | restructure | lint | other)",
    "update",
  )
  .action(logCommand);

program.parseAsync().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
