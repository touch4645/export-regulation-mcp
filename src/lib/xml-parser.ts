// Law JSON structure parser
// e-Gov API v2 returns JSON, so this module handles hierarchical JSON parsing

interface TextContent {
  content?: string;
  text?: string;
  sentence?: Array<{ content?: string; text?: string }>;
  [key: string]: unknown;
}

const MAX_DEPTH = 50;

export function extractText(node: unknown, depth: number = 0): string {
  if (depth > MAX_DEPTH) return "";
  if (typeof node === "string") return node;
  if (node === null || node === undefined) return "";

  if (Array.isArray(node)) {
    return node.map((n) => extractText(n, depth + 1)).filter(Boolean).join("");
  }

  if (typeof node === "object") {
    const obj = node as TextContent;

    // Direct content or text field
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.text === "string") return obj.text;

    // Sentence array
    if (Array.isArray(obj.sentence)) {
      return obj.sentence.map((s) => s.content ?? s.text ?? "").join("");
    }

    // Recurse into all values
    return Object.values(obj)
      .map((v) => extractText(v, depth + 1))
      .filter(Boolean)
      .join("");
  }

  return String(node);
}

export function extractArticles(
  mainProvision: unknown
): Array<{ title: string; content: string }> {
  if (!mainProvision || typeof mainProvision !== "object") return [];
  const provision = mainProvision as Record<string, unknown>;

  const articles: Array<{ title: string; content: string }> = [];

  // Direct articles
  if (Array.isArray(provision.article)) {
    for (const article of provision.article) {
      const a = article as Record<string, unknown>;
      articles.push({
        title: extractText(a.article_title),
        content: extractText(a.paragraph),
      });
    }
  }

  // Articles within chapters
  if (Array.isArray(provision.chapter)) {
    for (const chapter of provision.chapter) {
      const ch = chapter as Record<string, unknown>;
      if (Array.isArray(ch.article)) {
        for (const article of ch.article) {
          const a = article as Record<string, unknown>;
          articles.push({
            title: extractText(a.article_title),
            content: extractText(a.paragraph),
          });
        }
      }
    }
  }

  return articles;
}

export function extractAppdxTables(
  lawBody: unknown
): Array<{ title: string; content: string }> {
  if (!lawBody || typeof lawBody !== "object") return [];
  const body = lawBody as Record<string, unknown>;

  const tables: Array<{ title: string; content: string }> = [];

  if (Array.isArray(body.appdx_table)) {
    for (const table of body.appdx_table) {
      const t = table as Record<string, unknown>;
      tables.push({
        title: extractText(t.appdx_table_title),
        content: extractText(t.table_struct ?? t.related_article_num ?? ""),
      });
    }
  }

  // Also handle appdx_style, appdx
  for (const key of ["appdx", "appdx_style", "appdx_fig"]) {
    if (Array.isArray(body[key])) {
      for (const item of body[key] as unknown[]) {
        const t = item as Record<string, unknown>;
        tables.push({
          title: extractText(t[`${key}_title`] ?? t.title),
          content: extractText(t),
        });
      }
    }
  }

  return tables;
}
