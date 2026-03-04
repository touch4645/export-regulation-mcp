// Law JSON tree parser for e-Gov API v2
// The API returns {tag, attr, children} tree structures

import type { EGovTreeNode } from "../types/index.js";

const MAX_DEPTH = 100;

/**
 * Recursively extract all text content from a tree node.
 */
export function extractText(
  node: EGovTreeNode | string | undefined | null,
  depth: number = 0
): string {
  if (depth > MAX_DEPTH) return "";
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;

  if (!node.children) return "";

  return node.children
    .map((child) => extractText(child, depth + 1))
    .filter(Boolean)
    .join("");
}

/**
 * Find all descendant nodes with a matching tag name.
 */
export function findNodes(
  node: EGovTreeNode | string | undefined | null,
  tagName: string
): EGovTreeNode[] {
  if (!node || typeof node === "string") return [];

  const results: EGovTreeNode[] = [];
  if (node.tag === tagName) {
    results.push(node);
  }

  if (node.children) {
    for (const child of node.children) {
      results.push(...findNodes(child, tagName));
    }
  }

  return results;
}

/**
 * Find the first descendant node with a matching tag name.
 */
export function findNode(
  node: EGovTreeNode | string | undefined | null,
  tagName: string
): EGovTreeNode | undefined {
  if (!node || typeof node === "string") return undefined;

  if (node.tag === tagName) return node;

  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, tagName);
      if (found) return found;
    }
  }

  return undefined;
}

/**
 * Extract articles from law full text tree.
 * Returns array of {title, content} for each Article node.
 */
export function extractArticles(
  lawFullText: EGovTreeNode | string | undefined | null
): Array<{ title: string; content: string }> {
  if (!lawFullText || typeof lawFullText === "string") return [];

  const articles = findNodes(lawFullText, "Article");
  return articles.map((article) => {
    const titleNode = findNode(article, "ArticleTitle");
    const title = titleNode ? extractText(titleNode) : "";

    // Get paragraph content
    const paragraphs = findNodes(article, "Paragraph");
    const content = paragraphs.length > 0
      ? paragraphs.map((p) => extractText(p)).join("\n")
      : extractText(article);

    return { title, content };
  });
}

/**
 * Extract appendix tables from law full text tree.
 * Returns array of {title, content} for each AppdxTable node.
 */
export function extractAppdxTables(
  lawFullText: EGovTreeNode | string | undefined | null
): Array<{ title: string; content: string }> {
  if (!lawFullText || typeof lawFullText === "string") return [];

  const tables = findNodes(lawFullText, "AppdxTable");
  return tables.map((table) => {
    const titleNode = findNode(table, "AppdxTableTitle");
    const title = titleNode ? extractText(titleNode) : "";
    const content = extractText(table);
    return { title, content };
  });
}

/**
 * Extract the law title from the tree.
 */
export function extractLawTitle(
  lawFullText: EGovTreeNode | string | undefined | null
): string {
  if (!lawFullText || typeof lawFullText === "string") return "";
  const titleNode = findNode(lawFullText, "LawTitle");
  return titleNode ? extractText(titleNode) : "";
}
