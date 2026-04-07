# obsidian-kb-cli

`obkb` — a scriptable CLI for the **Karpathy-style LLM-wiki workflow** on Obsidian vaults. Companion to the [`obsidian-kb`](https://github.com/ab2891/obsidian-kb) Claude / Copilot / Gemini skill, for the cases where an LLM isn't in the loop: cron-driven lint, git pre-commit hooks for vault sanity, scriptable bootstrap of new topic KBs.

## Install

```bash
npm i -g obsidian-kb-cli
obkb --help
```

Or run without installing:

```bash
npx obsidian-kb-cli lint /path/to/vault
```

## Commands

### `obkb lint <vault> [--topic X] [--stale-months N] [--json]`

Walks every top-level folder in the vault that contains an `index.md` (a "topic") and reports findings. Categories:

| Category              | Severity | Description |
|-----------------------|----------|-------------|
| `broken-link`         | error    | A `[[wikilink]]` that doesn't resolve to any note in the vault. Code-span and code-block aware. |
| `not-in-index`        | warn     | An entry note that exists on disk but is not linked from the topic's `index.md`. |
| `missing-frontmatter` | warn     | An entry note with no YAML frontmatter at all. |
| `missing-type`        | info     | Has frontmatter but no `type:` field. |
| `schema-drift`        | info     | Entry frontmatter is missing fields declared in the topic's `CLAUDE.md` schema (parsed from the first `yaml` fenced block). |
| `stale-claim`         | warn     | Entry marked `status: active` whose `local_path` git history hasn't moved in `--stale-months` months (default 6). |

Exits non-zero on `error` findings — pre-commit / CI ready.

```bash
obkb lint ~/vault                     # all topics
obkb lint ~/vault --topic Projects    # single topic
obkb lint ~/vault --stale-months 3    # tighter staleness window
obkb lint ~/vault --json              # machine-readable
```

### `obkb watch <vault> [--topic X] [--stale-months N] [--debounce ms]`

Watches the vault for any `.md` change and re-runs `lint` on every change, vitest-watch style. Ideal for "constantly updating" workflows where you're editing notes alongside an LLM agent and want findings to surface immediately. Initial lint on startup; debounces rapid bursts of saves into a single re-lint (default 250ms — atomic-write editors emit 2-3 events per save). Uses `chokidar` so it works on WSL → Windows mounts and OneDrive folders where vanilla `fs.watch` is unreliable. Ctrl+C to exit.

```bash
obkb watch ~/vault                          # all topics, default debounce
obkb watch ~/vault --topic Projects         # restrict to one topic
obkb watch ~/vault --debounce 500           # slower debounce for slow disks
```

### `obkb bootstrap <topic> --vault <path> [--template KIND] [--force]`

Scaffolds `<topic>/CLAUDE.md`, `index.md`, `log.md` with topic-aware frontmatter. Templates:

- `generic` (default)
- `projects` — `type, status, role, languages, stack, github, local_path, tags`
- `papers` — `type, arxiv_id, venue, year, authors, status, tags`
- `books` — `type, author, year, rating, status, tags`
- `people` — `type, role, org, tags`

```bash
obkb bootstrap Papers --vault ~/vault --template papers
obkb bootstrap Recipes --vault ~/vault            # generic schema
```

### `obkb index <topic> --vault <path> [--output PATH] [--force]`

Emits a fresh draft `index.md` to stdout (default) or a named file, grouped by `status` and decorated with each entry's `type` and a one-line elevator pitch extracted from the body. **Non-destructive** — refuses to overwrite without `--force`, and `--output -` keeps it on stdout so you can diff before adopting.

```bash
obkb index Projects --vault ~/vault                      # → stdout
obkb index Projects --vault ~/vault --output draft.md    # → file
obkb index Projects --vault ~/vault --output ~/vault/Projects/index.md --force
```

### `obkb log <topic> "<message>" --vault <path> [--kind KIND]`

Prepends a dated entry to `<topic>/log.md`. Suitable for cron jobs and git hooks.

```bash
obkb log Projects "added obsidian-kb to GitHub" --vault ~/vault --kind update
```

## Cron example

Lint your vault every morning at 8am, log to a file:

```cron
0 8 * * * cd /path/to/cli && /usr/bin/node dist/index.js lint "/path/to/vault" --json >> ~/obkb-lint.log 2>&1
```

## Pre-commit hook example

For a vault tracked in git:

```bash
#!/bin/sh
# .git/hooks/pre-commit
obkb lint "$(git rev-parse --show-toplevel)" || exit 1
```

## Develop

```bash
git clone https://github.com/ab2891/obsidian-kb-cli
cd obsidian-kb-cli
npm install
npm run build
node dist/index.js --help
# or for development without building:
npm run dev -- lint /path/to/vault
```

## Related

- **[ab2891/obsidian-kb](https://github.com/ab2891/obsidian-kb)** — the matching Claude / Copilot / Gemini skill, for the in-LLM workflow side. The two halves share conventions; the skill ingests/queries via the Obsidian MCP and the CLI handles the maintenance/scripting side.
- Karpathy's [LLM-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the original pattern this implements.

## License

MIT.
