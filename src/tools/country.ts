import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLawData } from "../lib/egov-client.js";
import { extractText } from "../lib/law-parser.js";
import { LAW_IDS, CACHE_TTLS } from "../types/index.js";
import { getCache, setCache } from "../lib/cache.js";

// Group A (former White Countries) — as of latest known data
// This is a fallback; the tool also fetches from the law dynamically
const WHITE_COUNTRIES_FALLBACK: Array<{ name: string; group: string }> = [
  { name: "アルゼンチン", group: "A" },
  { name: "オーストラリア", group: "A" },
  { name: "オーストリア", group: "A" },
  { name: "ベルギー", group: "A" },
  { name: "ブルガリア", group: "A" },
  { name: "カナダ", group: "A" },
  { name: "チェコ", group: "A" },
  { name: "デンマーク", group: "A" },
  { name: "フィンランド", group: "A" },
  { name: "フランス", group: "A" },
  { name: "ドイツ", group: "A" },
  { name: "ギリシャ", group: "A" },
  { name: "ハンガリー", group: "A" },
  { name: "アイルランド", group: "A" },
  { name: "イタリア", group: "A" },
  { name: "ルクセンブルク", group: "A" },
  { name: "オランダ", group: "A" },
  { name: "ニュージーランド", group: "A" },
  { name: "ノルウェー", group: "A" },
  { name: "ポーランド", group: "A" },
  { name: "ポルトガル", group: "A" },
  { name: "スペイン", group: "A" },
  { name: "スウェーデン", group: "A" },
  { name: "スイス", group: "A" },
  { name: "英国", group: "A" },
  { name: "アメリカ合衆国", group: "A" },
];

export function registerCountryTools(server: McpServer): void {
  server.tool(
    "export_reg_get_white_countries",
    "輸出貿易管理令別表第3に規定されるグループA国（旧ホワイト国）のリストを取得します。グループA国への輸出は包括許可が利用可能です。",
    { readOnlyHint: true },
    async () => {
      try {
        // Try to get from cache first
        const cached = await getCache<Array<{ name: string; group: string }>>(
          "white_countries"
        );
        if (cached && !cached.stale) {
          let text = "# グループA国（旧ホワイト国）リスト\n（キャッシュから取得）\n\n";
          for (const country of cached.data) {
            text += `- ${country.name}\n`;
          }
          text += `\n合計: ${cached.data.length}カ国\n`;
          return { content: [{ type: "text" as const, text }] };
        }

        // Fetch from e-Gov API (別表第3)
        const { data, stale } = await getLawData(
          LAW_IDS.EXPORT_TRADE_CONTROL_ORDER,
          "AppdxTable[3]"
        );

        if (data.law_full_text) {
          const content = extractText(data.law_full_text);

          // Parse country names from the content
          // The format may vary, so we extract text and present it
          let text = "# グループA国（旧ホワイト国）リスト\n";
          if (stale) {
            text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
          }
          text += "\n## 輸出貿易管理令 別表第3\n\n";
          text += content;

          // Cache the fallback list for structured queries
          await setCache("white_countries", WHITE_COUNTRIES_FALLBACK, CACHE_TTLS.WHITE_COUNTRIES);

          return { content: [{ type: "text" as const, text }] };
        }

        // Fallback to static data
        await setCache("white_countries", WHITE_COUNTRIES_FALLBACK, CACHE_TTLS.WHITE_COUNTRIES);
        let text = "# グループA国（旧ホワイト国）リスト\n";
        text += "⚠️ e-Gov APIから取得できなかったため、組み込みデータを使用しています\n\n";
        for (const country of WHITE_COUNTRIES_FALLBACK) {
          text += `- ${country.name}\n`;
        }
        text += `\n合計: ${WHITE_COUNTRIES_FALLBACK.length}カ国\n`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ホワイト国リストの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "export_reg_check_country",
    "指定された国の輸出管理上のステータス（グループA/B/C/D）を確認します。国グループにより利用可能な包括許可の種類が異なります。",
    {
      country_name: z
        .string()
        .describe("確認する国名（日本語または英語）"),
    },
    { readOnlyHint: true },
    async ({ country_name }) => {
      try {
        // Check against cached white countries
        const cached = await getCache<Array<{ name: string; group: string }>>(
          "white_countries"
        );
        const countries = cached?.data ?? WHITE_COUNTRIES_FALLBACK;

        const normalizedInput = country_name.toLowerCase().trim();
        const found = countries.find(
          (c) =>
            c.name.toLowerCase().includes(normalizedInput) ||
            normalizedInput.includes(c.name.toLowerCase())
        );

        let text = `# 国別輸出管理ステータス: ${country_name}\n\n`;

        if (found) {
          text += `**グループ: ${found.group}**\n\n`;
          text += "グループA国（旧ホワイト国）に該当します。\n";
          text += "- 包括許可（一般包括、特別一般包括）の利用が可能です\n";
          text += "- キャッチオール規制の対象外です\n";
        } else {
          text += "**グループAには該当しません**\n\n";
          text += "以下のいずれかのグループに分類されます:\n";
          text += "- **グループB**: 一部の包括許可が利用可能\n";
          text += "- **グループC**: 個別許可が原則必要\n";
          text += "- **グループD**: 国連武器禁輸国。全ての規制品目で個別許可が必要\n\n";
          text += "正確なグループ分類は経済産業省の最新の告示を確認してください。\n";
          text += "キャッチオール規制（別表第1の16の項）の対象となる可能性があります。\n";
        }

        if (cached?.stale) {
          text += "\n⚠️ キャッシュデータのため最新でない可能性があります\n";
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `国別ステータスの確認に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
