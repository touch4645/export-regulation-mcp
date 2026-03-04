import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLawData } from "../lib/egov-client.js";
import { extractText, extractAppdxTables, findNodes } from "../lib/law-parser.js";
import { LAW_IDS, ANNEX_TABLE_MAP } from "../types/index.js";

export function registerAnnexTools(server: McpServer): void {
  server.tool(
    "export_reg_get_annex",
    "輸出貿易管理令の別表第1（リスト規制品目）を取得します。項番を指定して特定の規制品目カテゴリの詳細を参照できます。",
    {
      table_number: z
        .string()
        .default("1")
        .describe("別表番号（1=リスト規制品目, 2=キャッチオール, 3=ホワイト国）"),
      item_number: z
        .string()
        .optional()
        .describe(
          "項番（1〜15）。指定すると該当項の詳細のみ取得。1=武器, 2=原子力, 3=化学兵器, 4=ミサイル, 5=先端材料, 6=材料加工, 7=エレクトロニクス, 8=コンピュータ, 9=通信, 10=センサー, 11=航法, 12=海洋, 13=推進, 14=その他, 15=機微品目"
        ),
    },
    { readOnlyHint: true },
    async ({ table_number, item_number }) => {
      try {
        // Request the specific appendix table
        const elm = ANNEX_TABLE_MAP[table_number] ?? `AppdxTable[${table_number}]`;
        const { data, fromCache, stale } = await getLawData(
          LAW_IDS.EXPORT_TRADE_CONTROL_ORDER,
          elm
        );

        if (!data.law_full_text) {
          return {
            content: [
              {
                type: "text" as const,
                text: `別表データが取得できませんでした。\ne-Gov APIから別表データを取得できませんでした。法令全体を取得して確認してください。\n法令ID: ${LAW_IDS.EXPORT_TRADE_CONTROL_ORDER}`,
              },
            ],
          };
        }

        const lawFullText = data.law_full_text;
        const tables = extractAppdxTables(lawFullText);

        let text = `# 輸出貿易管理令 別表第${table_number}\n`;
        if (stale) {
          text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
        } else if (fromCache) {
          text += "（キャッシュから取得）\n";
        }

        if (tables.length > 0) {
          for (const table of tables) {
            if (item_number) {
              // Filter by item number with word boundary to avoid "1" matching "10"
              const itemPattern = new RegExp(`(^|[^\\d])${item_number}([^\\d]|$)`);
              if (
                itemPattern.test(table.title) ||
                table.content.includes(`第${item_number}項`)
              ) {
                text += `\n## ${table.title}\n${table.content}\n`;
              }
            } else {
              text += `\n## ${table.title}\n${table.content}\n`;
            }
          }
        } else {
          // Fallback: extract full text
          text += `\n${extractText(lawFullText)}\n`;
        }

        if (item_number) {
          text += `\n---\n項番${item_number}の詳細なパラメータ閾値については export_reg_get_parameter_thresholds ツールもご利用ください。\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `別表の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
