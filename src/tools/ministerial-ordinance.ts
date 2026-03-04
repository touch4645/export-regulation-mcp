import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLawData } from "../lib/egov-client.js";
import { extractText, extractArticles, extractLawTitle } from "../lib/law-parser.js";
import { LAW_IDS } from "../types/index.js";

export function registerMinisterialOrdinanceTools(server: McpServer): void {
  server.tool(
    "export_reg_get_ministerial_ordinance",
    "輸出貿易管理令の貨物等省令（経済産業省令）の条文を取得します。リスト規制品目の具体的な技術仕様・パラメータ閾値が規定されています。",
    {
      article: z
        .string()
        .optional()
        .describe("条文番号（例: 第1条, 第2条）。省略時は全文を取得"),
    },
    { readOnlyHint: true },
    async ({ article }) => {
      try {
        const elm = article ? article : undefined;
        const { data, fromCache, stale } = await getLawData(
          LAW_IDS.GOODS_MINISTERIAL_ORDINANCE,
          elm
        );

        if (data.result.code !== "0") {
          return {
            content: [
              {
                type: "text" as const,
                text: `貨物等省令の取得に失敗しました: ${data.result.message}\n法令ID: ${LAW_IDS.GOODS_MINISTERIAL_ORDINANCE}`,
              },
            ],
          };
        }

        const lawFullText = data.law_full_text;
        const title = extractLawTitle(lawFullText) || "輸出貿易管理令別表第一及び外国為替令別表の規定に基づき貨物又は技術を定める省令";
        const articles = extractArticles(lawFullText);

        let text = `# ${title}\n`;
        if (stale) {
          text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
        } else if (fromCache) {
          text += "（キャッシュから取得）\n";
        }

        if (articles.length > 0) {
          for (const a of articles) {
            text += `\n## ${a.title}\n${a.content}\n`;
          }
        } else {
          text += `\n${extractText(lawFullText)}\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `貨物等省令の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
