import yaml from "js-yaml";

/**
 * Extract the canonical frontmatter field set for a topic from its CLAUDE.md.
 *
 * Strategy: find the first ```yaml fenced code block in the schema doc and parse
 * its top-level keys. Placeholder values like `<entry-type>` and `arxiv_id: "..."`
 * are tolerated by parsing line-by-line as a fallback if real YAML parsing fails.
 *
 * Returns null if no schema block is found — caller should treat that as
 * "no schema declared, skip drift checks for this topic."
 */
export function extractTopicSchema(claudeMdBody: string): string[] | null {
  const fenceMatch = claudeMdBody.match(/```ya?ml\s*\n([\s\S]*?)```/);
  if (!fenceMatch) return null;
  const yamlBlock = fenceMatch[1];

  // Try real YAML parse first.
  try {
    const parsed = yaml.load(yamlBlock);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length > 0) return keys;
    }
  } catch {
    /* fall through to line-based extraction */
  }

  // Fallback: walk lines, pick `key:` patterns at column zero.
  const keys: string[] = [];
  for (const line of yamlBlock.split("\n")) {
    if (!line || /^\s/.test(line)) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (m) keys.push(m[1]);
  }
  return keys.length > 0 ? keys : null;
}
