import * as fs from "fs";
import * as path from "path";
import kleur from "kleur";

interface BootstrapOptions {
  vault: string;
  template: string;
  force?: boolean;
}

type TemplateKind = "generic" | "projects" | "papers" | "books" | "people";

const TEMPLATES: Record<TemplateKind, { schema: string; index: string }> = {
  generic: {
    schema: schemaTemplate({
      kind: "generic",
      frontmatterFields: [
        "type: <entry-type>",
        "status: active | archived | draft",
        "tags: [tag1, tag2]",
      ],
    }),
    index: indexTemplate("Catalog of entries. Read this file first when answering any query about this topic."),
  },
  projects: {
    schema: schemaTemplate({
      kind: "projects",
      frontmatterFields: [
        "type: project",
        "status: active | maintenance | archived | draft",
        "role: solo | contributor | employee",
        "languages: [Lang1, Lang2]",
        "stack: [Framework1, Framework2]",
        "github: https://github.com/...",
        "local_path: /path/to/repo",
        "tags: [domain, vertical]",
      ],
    }),
    index: indexTemplate("Catalog of projects. One row per repo. Cross-cutting tags grouped below."),
  },
  papers: {
    schema: schemaTemplate({
      kind: "papers",
      frontmatterFields: [
        "type: paper",
        "arxiv_id: \"2401.12345\"",
        "venue: NeurIPS | ICLR | ICML | arXiv",
        "year: 2026",
        "authors: [Author 1, Author 2]",
        "status: read | skimmed | todo",
        "tags: [topic1, topic2]",
      ],
    }),
    index: indexTemplate("Catalog of papers. Group by year and by topic."),
  },
  books: {
    schema: schemaTemplate({
      kind: "books",
      frontmatterFields: [
        "type: book",
        "author: <name>",
        "year: 2026",
        "rating: 1-5",
        "status: read | reading | dnf | wishlist",
        "tags: [topic1, topic2]",
      ],
    }),
    index: indexTemplate("Catalog of books. Group by status and by topic."),
  },
  people: {
    schema: schemaTemplate({
      kind: "people",
      frontmatterFields: [
        "type: person",
        "role: colleague | friend | researcher | author",
        "org: <organization>",
        "tags: [field, context]",
      ],
    }),
    index: indexTemplate("Catalog of people. Group by relationship type."),
  },
};

export async function bootstrapCommand(
  topic: string,
  opts: BootstrapOptions,
): Promise<void> {
  const kind = (opts.template ?? "generic") as TemplateKind;
  if (!(kind in TEMPLATES)) {
    throw new Error(
      `Unknown template "${kind}". Available: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  }

  const vault = path.resolve(opts.vault);
  if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) {
    throw new Error(`Vault not found: ${vault}`);
  }

  const topicDir = path.join(vault, topic);
  fs.mkdirSync(topicDir, { recursive: true });

  const tpl = TEMPLATES[kind];
  const files: Array<{ name: string; content: string }> = [
    { name: "CLAUDE.md", content: tpl.schema },
    { name: "index.md", content: tpl.index.replaceAll("{{TOPIC}}", topic) },
    { name: "log.md", content: `## Ingest log\n\nAppend-only. Newest at top.\n` },
  ];

  let written = 0;
  let skipped = 0;
  for (const f of files) {
    const target = path.join(topicDir, f.name);
    if (fs.existsSync(target) && !opts.force) {
      console.log(kleur.yellow(`skip`) + ` ${path.relative(vault, target)} (already exists, --force to overwrite)`);
      skipped++;
      continue;
    }
    fs.writeFileSync(target, f.content);
    console.log(kleur.green(`write`) + ` ${path.relative(vault, target)}`);
    written++;
  }

  console.log("");
  console.log(
    kleur.bold(`Bootstrapped ${topic}/`) +
      ` (${kind} template) — ${written} written, ${skipped} skipped`,
  );
  if (skipped > 0 && !opts.force) {
    console.log(kleur.dim("Re-run with --force to overwrite existing files."));
  }
}

interface SchemaArgs {
  kind: TemplateKind;
  frontmatterFields: string[];
}

function schemaTemplate({ kind, frontmatterFields }: SchemaArgs): string {
  return `## ${capitalize(kind)} KB — Schema for Claude / LLM agents

This folder is an LLM-maintained Karpathy-style knowledge base. Its purpose is to let
future LLM sessions answer queries about this topic by reading a *compiled* wiki instead
of re-reading every raw source from scratch.

### Folder layout

- \`index.md\` — catalog. **Read this first** on any query.
- \`log.md\` — append-only ingest log, newest at top.
- \`<Entry>.md\` — one note per entry.

### Frontmatter schema

Every entry note must carry frontmatter:

\`\`\`yaml
---
${frontmatterFields.join("\n")}
---
\`\`\`

### Body schema

1. **Elevator pitch** — one paragraph, plain English, no jargon.
2. **What it is / what it covers** — bullets.
3. **Notable details** — anything worth remembering on the next query.
4. **Related** — wikilinks to other entries (use folder-prefixed form: \`[[${capitalize(kind)}/Entry]]\`).
5. **Status / known gaps** — current state, what's unfinished.

### Workflows

**Ingest** (new entry or major source change):
1. Read the source thoroughly.
2. Create or overwrite the entry note using the schema above.
3. Add a row to \`index.md\`.
4. Append a dated entry to \`log.md\`: \`## [YYYY-MM-DD] ingest | <Entry> — <one-line reason>\`.

**Query** (user asks about this topic):
1. **First, read \`index.md\`.** Always.
2. Read the relevant entry notes via the catalog.
3. Synthesize. Cite the entry notes.

**Lint** (occasional health check):
- Use \`obkb lint <vault> --topic ${capitalize(kind)}\`. Reports orphan notes,
  broken wikilinks, and missing frontmatter.

### Conventions

- Wikilinks use folder paths: \`[[${capitalize(kind)}/Entry]]\`. Avoids title collisions.
- When in doubt, prefer concrete facts from the source over adjectives.
- Never claim something the source doesn't say. The whole point of compiling is that
  future-you trusts the wiki.
`;
}

function indexTemplate(intro: string): string {
  return `## {{TOPIC}} — Catalog

${intro}

Schema and workflows: [[{{TOPIC}}/CLAUDE]].

### Entries

_(empty — bootstrap a new entry to populate)_
`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
