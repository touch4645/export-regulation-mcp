import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLawData } from "../lib/egov-client.js";
import {
  extractText,
  extractArticles,
  extractAppdxTables,
  findNodes,
} from "../lib/law-parser.js";
import { LAW_IDS } from "../types/index.js";

export function registerCatchallTools(server: McpServer): void {
  // Tool 1: 別表第3の2（武器禁輸国・地域）
  server.tool(
    "export_reg_get_annex3_2",
    "輸出貿易管理令別表第3の2（国連武器禁輸国・地域）のリストを取得します。キャッチオール規制の客観要件判定に使用します。",
    { readOnlyHint: true },
    async () => {
      try {
        const { data, fromCache, stale } = await getLawData(
          LAW_IDS.EXPORT_TRADE_CONTROL_ORDER,
          "AppdxTable[7]"
        );

        if (data.result.code !== "0") {
          return {
            content: [
              {
                type: "text" as const,
                text: `別表第3の2の取得に失敗しました: ${data.result.message}`,
              },
            ],
          };
        }

        const lawBody = data.law_full_text;
        let text = "# 輸出貿易管理令 別表第3の2（国連武器禁輸国・地域）\n";
        if (stale) {
          text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
        } else if (fromCache) {
          text += "（キャッシュから取得）\n";
        }
        text += "\n";
        text += extractText(lawBody);

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `別表第3の2の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: おそれ省令
  server.tool(
    "export_reg_get_fear_ordinance",
    "おそれ省令（輸出貿易管理令の運用通達）の内容を取得します。キャッチオール規制における用途要件の判定基準を参照できます。",
    {
      article: z
        .string()
        .optional()
        .describe("条番号（例: '1', '2'）。指定すると該当条文のみ取得"),
    },
    { readOnlyHint: true },
    async ({ article }) => {
      try {
        const { data, fromCache, stale } = await getLawData(
          LAW_IDS.FEAR_ORDINANCE,
          article ? `Article[${article}]` : undefined
        );

        if (data.result.code !== "0") {
          return {
            content: [
              {
                type: "text" as const,
                text: `おそれ省令の取得に失敗しました: ${data.result.message}`,
              },
            ],
          };
        }

        const lawBody = data.law_full_text;
        let text = "# おそれ省令\n";
        if (stale) {
          text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
        } else if (fromCache) {
          text += "（キャッシュから取得）\n";
        }
        text += "\n";

        const articles = extractArticles(lawBody);
        if (articles.length > 0) {
          for (const art of articles) {
            text += `## ${art.title}\n${art.content}\n\n`;
          }
        } else {
          text += extractText(lawBody);
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `おそれ省令の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 3: 関税定率法の品目分類
  server.tool(
    "export_reg_get_tariff_items",
    "関税定率法別表の品目分類を取得します。キャッチオール規制の16項中欄（別表第1の16の項）に関連する品目の確認に使用します。",
    {
      category: z
        .string()
        .describe(
          "品目分類番号（例: '25', '54-59', '68-93'）。関税定率法別表の類番号を指定"
        ),
    },
    { readOnlyHint: true },
    async ({ category }) => {
      try {
        const { data, fromCache, stale } = await getLawData(
          LAW_IDS.TARIFF_LAW
        );

        if (data.result.code !== "0") {
          return {
            content: [
              {
                type: "text" as const,
                text: `関税定率法の取得に失敗しました: ${data.result.message}`,
              },
            ],
          };
        }

        const lawBody = data.law_full_text;
        let text = "# 関税定率法 品目分類\n";
        if (stale) {
          text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
        } else if (fromCache) {
          text += "（キャッシュから取得）\n";
        }
        text += `\n検索カテゴリ: ${category}\n\n`;

        // Parse category range
        const rangeMatch = category.match(/^(\d+)\s*-\s*(\d+)$/);
        let categoryNumbers: number[];
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = parseInt(rangeMatch[2], 10);
          categoryNumbers = [];
          for (let i = start; i <= end; i++) {
            categoryNumbers.push(i);
          }
        } else {
          categoryNumbers = [parseInt(category, 10)];
        }

        // Extract appendix tables (the tariff schedule is in appendix tables)
        const tables = extractAppdxTables(lawBody);
        let found = false;

        if (tables.length > 0) {
          for (const table of tables) {
            // Check if this table mentions any of the requested category numbers
            const matches = categoryNumbers.some((num) => {
              const numStr = String(num);
              const pattern = new RegExp(
                `(第${numStr}類|第\\s*${numStr}\\s*類|^${numStr}\\s|\\s${numStr}\\s)`
              );
              return (
                pattern.test(table.title) || pattern.test(table.content)
              );
            });

            if (matches) {
              text += `## ${table.title}\n${table.content}\n\n`;
              found = true;
            }
          }
        }

        if (!found) {
          // Fallback: search in articles
          const articles = extractArticles(lawBody);
          for (const art of articles) {
            const matches = categoryNumbers.some((num) => {
              const numStr = String(num);
              return (
                art.content.includes(`第${numStr}類`) ||
                art.content.includes(`${numStr}類`)
              );
            });
            if (matches) {
              text += `## ${art.title}\n${art.content}\n\n`;
              found = true;
            }
          }
        }

        if (!found) {
          text += `カテゴリ ${category} に該当する品目分類は見つかりませんでした。\n`;
          text += "関税定率法別表の全体を確認するには、法令IDを指定して法令本文を取得してください。\n";
          text += `法令ID: ${LAW_IDS.TARIFF_LAW}\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `関税定率法の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
