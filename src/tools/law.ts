import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLawData, searchByKeyword } from "../lib/egov-client.js";
import { extractText, extractArticles, extractLawTitle, findNodes } from "../lib/law-parser.js";
import { LAW_IDS } from "../types/index.js";

const KNOWN_LAWS: Record<string, string> = {
  輸出貿易管理令: LAW_IDS.EXPORT_TRADE_CONTROL_ORDER,
  外国為替令: LAW_IDS.FOREIGN_EXCHANGE_ORDER,
  貨物等省令: LAW_IDS.GOODS_MINISTERIAL_ORDINANCE,
  おそれ省令: LAW_IDS.FEAR_ORDINANCE,
  関税定率法: LAW_IDS.TARIFF_LAW,
  輸出者等遵守基準省令: LAW_IDS.COMPLIANCE_STANDARDS,
};

export function registerLawTools(server: McpServer): void {
  server.tool(
    "export_reg_get_law",
    "指定された法令IDの法令本文を取得します。輸出管理関連の法令（輸出貿易管理令、外国為替令、貨物等省令など）を参照できます。",
    {
      law_id: z
        .string()
        .describe(
          "法令ID（例: 324CO0000000378=輸出貿易管理令, 355CO0000000260=外国為替令, 403M50000400049=貨物等省令）"
        ),
      elm: z
        .string()
        .optional()
        .describe("取得する要素の指定（例: 別表第一 など）"),
    },
    { readOnlyHint: true },
    async ({ law_id, elm }) => {
      try {
        const { data, fromCache, stale } = await getLawData(law_id, elm);

        if (!data.law_full_text) {
          // Suggest known law IDs
          const suggestions = Object.entries(KNOWN_LAWS)
            .map(([name, id]) => `  ${name}: ${id}`)
            .join("\n");
          return {
            content: [
              {
                type: "text" as const,
                text: `法令データが取得できませんでした。法令IDを確認してください。\n\n主要な輸出管理関連法令ID:\n${suggestions}`,
              },
            ],
          };
        }

        const lawFullText = data.law_full_text;
        const title = extractLawTitle(lawFullText) || data.law_info?.law_title || "不明";
        const articles = extractArticles(lawFullText);

        let text = `# ${title}\n`;
        if (stale) {
          text += "\n⚠️ キャッシュデータ（最新でない可能性があります）\n";
        } else if (fromCache) {
          text += "\n（キャッシュから取得）\n";
        }

        if (articles.length > 0) {
          for (const article of articles) {
            text += `\n## ${article.title}\n${article.content}\n`;
          }
        } else {
          // Fallback: extract all text
          text += `\n${extractText(lawFullText)}\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `e-Gov APIへの接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "export_reg_search_law",
    "キーワードで輸出管理関連の法令を検索します。法令名や条文の内容で検索できます。",
    {
      keyword: z.string().describe("検索キーワード（例: 輸出貿易管理, 外国為替, リスト規制）"),
      law_type: z
        .string()
        .optional()
        .describe("法令種別で絞り込み（例: 政令, 省令, 法律）"),
    },
    { readOnlyHint: true },
    async ({ keyword, law_type }) => {
      try {
        const { data, stale } = await searchByKeyword(keyword, law_type);

        if (!data.items) {
          return {
            content: [
              {
                type: "text" as const,
                text: `検索結果が取得できませんでした。キーワードを変えて再度お試しください。`,
              },
            ],
          };
        }

        let text = `# 検索結果: "${keyword}"\n`;
        if (stale) {
          text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
        }
        text += `件数: ${data.total_count ?? 0}\n\n`;

        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            text += `- **${item.law_info.law_title}**\n`;
            text += `  法令ID: ${item.law_info.law_id}\n`;
            text += `  法令番号: ${item.law_info.law_num}\n`;
            if (item.law_info.promulgation_date) {
              text += `  公布日: ${item.law_info.promulgation_date}\n`;
            }
            text += "\n";
          }
        } else {
          text += "該当する法令が見つかりませんでした。\n";
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `検索に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
