import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLawData } from "../lib/egov-client.js";
import { extractText } from "../lib/law-parser.js";
import { LAW_IDS } from "../types/index.js";

const ITEM_CATEGORIES: Record<string, string> = {
  "1": "武器（Arms）",
  "2": "原子力（Nuclear）",
  "3": "化学兵器関連（Chemical/Biological Weapons）",
  "3の2": "化学兵器関連の2（Chemical Weapons 2）",
  "4": "ミサイル関連（Missiles）",
  "5": "先端材料（Advanced Materials）",
  "6": "材料加工（Materials Processing）",
  "7": "エレクトロニクス（Electronics）",
  "8": "コンピュータ（Computers）",
  "9": "通信（Telecommunications）",
  "10": "センサー・レーザー（Sensors & Lasers）",
  "11": "航法装置（Navigation）",
  "12": "海洋関連（Marine）",
  "13": "推進装置（Propulsion）",
  "14": "その他（Others）",
  "15": "機微品目（Sensitive Items）",
};

export function registerParameterThresholdTools(server: McpServer): void {
  server.tool(
    "export_reg_get_parameter_thresholds",
    "輸出管理リスト規制の項番別の技術パラメータ閾値を取得します。別表第1の項番と貨物等省令を組み合わせて、規制対象となる具体的な技術仕様を確認できます。",
    {
      item_number: z
        .string()
        .describe(
          "項番（1〜15）。1=武器, 2=原子力, 3=化学兵器, 4=ミサイル, 5=先端材料, 6=材料加工, 7=エレクトロニクス, 8=コンピュータ, 9=通信, 10=センサー, 11=航法, 12=海洋, 13=推進, 14=その他, 15=機微品目"
        ),
    },
    { readOnlyHint: true },
    async ({ item_number }) => {
      try {
        const category = ITEM_CATEGORIES[item_number];
        if (!category) {
          return {
            content: [
              {
                type: "text" as const,
                text: `無効な項番です: ${item_number}\n有効な項番: ${Object.entries(ITEM_CATEGORIES).map(([k, v]) => `${k}=${v}`).join(", ")}`,
              },
            ],
          };
        }

        // Fetch both the annex and ministerial ordinance in parallel
        const [annexResult, ordinanceResult] = await Promise.all([
          getLawData(LAW_IDS.EXPORT_TRADE_CONTROL_ORDER, "AppdxTable[1]"),
          getLawData(LAW_IDS.GOODS_MINISTERIAL_ORDINANCE),
        ]);

        let text = `# 項番${item_number}: ${category} のパラメータ閾値\n\n`;

        if (annexResult.stale || ordinanceResult.stale) {
          text += "⚠️ 一部キャッシュデータ（最新でない可能性があります）\n\n";
        }

        // Extract annex content
        text += "## 輸出貿易管理令 別表第1 対応部分\n\n";
        const annexFullText = annexResult.data.law_full_text;
        if (annexFullText) {
          const annexContent = extractText(annexFullText);
          // Try to find the relevant section for this item number
          const lines = annexContent.split("\n");
          const relevantLines: string[] = [];
          let inSection = false;
          for (const line of lines) {
            if (line.includes(`${item_number}`) && (line.includes("項") || line.includes("の項"))) {
              inSection = true;
            } else if (inSection && /^[一二三四五六七八九十\d]+\s/.test(line)) {
              break;
            }
            if (inSection) {
              relevantLines.push(line);
            }
          }
          text += relevantLines.length > 0 ? relevantLines.join("\n") : annexContent.slice(0, 2000);
        } else {
          text += "（別表データを取得できませんでした）\n";
        }

        // Extract ordinance content
        text += "\n\n## 貨物等省令 対応条文\n\n";
        const ordFullText = ordinanceResult.data.law_full_text;
        if (ordFullText) {
          const ordContent = extractText(ordFullText);
          // The ministerial ordinance articles roughly map to annex item numbers
          const lines = ordContent.split("\n");
          const relevantLines: string[] = [];
          let inSection = false;
          for (const line of lines) {
            if (line.includes(`第${item_number}条`)) {
              inSection = true;
            } else if (inSection && /第\d+条/.test(line) && !line.includes(`第${item_number}条`)) {
              break;
            }
            if (inSection) {
              relevantLines.push(line);
            }
          }
          text += relevantLines.length > 0 ? relevantLines.join("\n") : "(該当条文が見つかりませんでした。貨物等省令全文を export_reg_get_ministerial_ordinance で確認してください)\n";
        } else {
          text += "（省令データを取得できませんでした）\n";
        }

        text += "\n\n---\n注: 正確な該非判定には、最新の法令原文および関連通達を確認してください。\n";

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `パラメータ閾値の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
