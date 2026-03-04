import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCache, setCache } from "../lib/cache.js";
import { CACHE_TTLS } from "../types/index.js";
import type { UserListEntry } from "../types/index.js";
import * as XLSX from "xlsx";

const METI_PAGE_URL = "https://www.meti.go.jp/policy/anpo/law00.html";
const METI_BASE_URL = "https://www.meti.go.jp";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchAndParseExcel(): Promise<UserListEntry[]> {
  // Fetch the METI page to find the Excel file link
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const pageResponse = await fetch(METI_PAGE_URL, {
    signal: controller.signal,
    headers: { "User-Agent": USER_AGENT },
  });
  clearTimeout(timeoutId);

  if (!pageResponse.ok) {
    throw new Error(`Failed to fetch METI page: ${pageResponse.status}`);
  }

  const html = await pageResponse.text();

  // Find .xlsx links related to the user list (外国ユーザーリスト)
  // Prefer links whose surrounding text contains "外国ユーザーリスト"
  const userListPattern =
    /href=["']([^"']*\.xlsx?)["'][^>]*>([^<]*外国ユーザーリスト[^<]*)</gi;
  const generalPattern = /href=["']([^"']*\.xlsx?)["']/gi;

  let xlsxUrl: string | null = null;

  // First try to find xlsx link explicitly labeled as 外国ユーザーリスト
  let match: RegExpExecArray | null;
  while ((match = userListPattern.exec(html)) !== null) {
    xlsxUrl = match[1];
    break;
  }

  // Fallback: pick the first xlsx link on the page
  if (!xlsxUrl) {
    while ((match = generalPattern.exec(html)) !== null) {
      xlsxUrl = match[1];
      break;
    }
  }

  if (!xlsxUrl) {
    throw new Error("No Excel file links found on METI page");
  }
  if (xlsxUrl.startsWith("/")) {
    xlsxUrl = `${METI_BASE_URL}${xlsxUrl}`;
  } else if (!xlsxUrl.startsWith("http")) {
    xlsxUrl = `${METI_BASE_URL}/policy/anpo/${xlsxUrl}`;
  }

  // Download the Excel file
  const xlsxController = new AbortController();
  const xlsxTimeoutId = setTimeout(() => xlsxController.abort(), 60_000);
  const xlsxResponse = await fetch(xlsxUrl, {
    signal: xlsxController.signal,
    headers: { "User-Agent": USER_AGENT },
  });
  clearTimeout(xlsxTimeoutId);

  if (!xlsxResponse.ok) {
    throw new Error(`Failed to download Excel file: ${xlsxResponse.status}`);
  }

  const buffer = await xlsxResponse.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });

  const entries: UserListEntry[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    for (const row of rows) {
      const values = Object.values(row).map((v) => String(v ?? "").trim());
      // Skip empty rows or header rows
      if (values.every((v) => !v)) continue;

      // Try to extract organization name and country from columns
      // The METI user list typically has: No, Country/Region, Organization, Type, etc.
      const keys = Object.keys(row);
      let organization = "";
      let country = "";
      let type = "";

      for (const key of keys) {
        const keyLower = String(key).toLowerCase();
        const value = String(row[key] ?? "").trim();
        if (!value) continue;

        if (
          keyLower.includes("企業") ||
          keyLower.includes("組織") ||
          keyLower.includes("名称") ||
          keyLower.includes("organization") ||
          keyLower.includes("entity") ||
          keyLower.includes("name")
        ) {
          organization = value;
        } else if (
          keyLower.includes("国") ||
          keyLower.includes("地域") ||
          keyLower.includes("country") ||
          keyLower.includes("region")
        ) {
          country = value;
        } else if (
          keyLower.includes("種別") ||
          keyLower.includes("type") ||
          keyLower.includes("懸念") ||
          keyLower.includes("category")
        ) {
          type = value;
        }
      }

      // Fallback: if structured parsing didn't work, try positional
      if (!organization && values.length >= 3) {
        // Common layout: [No, Country, Organization, ...]
        country = values[1] || "";
        organization = values[2] || "";
        type = values.length > 3 ? values[3] : "";
      }

      if (organization) {
        entries.push({
          organization,
          country,
          type: type || "不明",
        });
      }
    }
  }

  return entries;
}

async function fetchUserList(): Promise<{
  entries: UserListEntry[];
  fromCache: boolean;
  stale: boolean;
}> {
  // Try cache first
  const cached = await getCache<UserListEntry[]>("user_list");
  if (cached && !cached.stale) {
    return { entries: cached.data, fromCache: true, stale: false };
  }

  try {
    const entries = await fetchAndParseExcel();

    if (entries.length > 0) {
      await setCache("user_list", entries, CACHE_TTLS.USER_LIST);
    }

    return { entries, fromCache: false, stale: false };
  } catch {
    // Fallback to stale cache if available
    if (cached) {
      return { entries: cached.data, fromCache: true, stale: true };
    }
    return { entries: [], fromCache: false, stale: false };
  }
}

export function registerUserListTools(server: McpServer): void {
  server.tool(
    "export_reg_check_user_list",
    "経済産業省の外国ユーザーリスト（懸念企業リスト）に対して組織名を照合します。大量破壊兵器の開発等に関与している懸念のある企業・組織が掲載されています。METIが公開するExcelデータを取得・解析して検索します。",
    {
      organization: z
        .string()
        .describe("照合する組織名（部分一致で検索）"),
      country: z
        .string()
        .optional()
        .describe("国名で絞り込み（日本語）"),
    },
    { readOnlyHint: true },
    async ({ organization, country }) => {
      try {
        const { entries, fromCache, stale } = await fetchUserList();
        const normalizedOrg = organization.toLowerCase().trim();

        let text = "# 外国ユーザーリスト照合結果\n\n";
        if (stale) {
          text += "⚠️ キャッシュデータ（最新でない可能性があります）\n";
        } else if (fromCache) {
          text += "（キャッシュから取得）\n";
        }

        text += `検索条件: 組織名="${organization}"`;
        if (country) text += `, 国="${country}"`;
        text += "\n\n";

        if (entries.length === 0) {
          text += "⚠️ 外国ユーザーリストのデータを取得できませんでした。\n\n";
          text += "経済産業省の公式ページで直接確認してください:\n";
          text += `${METI_PAGE_URL}\n\n`;
          text +=
            "外国ユーザーリストはExcel形式で上記URLからダウンロードできます。\n";
        } else {
          const filteredMatches = entries.filter((entry) => {
            const orgMatch = entry.organization
              .toLowerCase()
              .includes(normalizedOrg);
            const countryMatch = country
              ? entry.country.includes(country)
              : true;
            return orgMatch && countryMatch;
          });

          text += `データ件数: ${entries.length}件\n\n`;

          if (filteredMatches.length > 0) {
            text += `**⚠️ ${filteredMatches.length}件の一致が見つかりました**\n\n`;
            for (const entry of filteredMatches) {
              text += `### ${entry.organization}\n`;
              text += `- 国: ${entry.country}\n`;
              text += `- 種別: ${entry.type}\n`;
              if (entry.updateDate) {
                text += `- 更新日: ${entry.updateDate}\n`;
              }
              text += "\n";
            }
            text += "---\n";
            text +=
              "外国ユーザーリストに掲載されている組織への輸出は、キャッチオール規制の「客観要件」に該当する可能性があります。\n";
            text += "経済産業省への個別許可申請を検討してください。\n";
          } else {
            text += "一致する組織は見つかりませんでした。\n\n";
            text += "注意:\n";
            text +=
              "- この結果は参考情報です。最終的な判断は経済産業省の最新の外国ユーザーリストで確認してください。\n";
            text +=
              "- 外国ユーザーリストに掲載されていなくても、輸出者自身が需要者の用途について懸念がある場合は経済産業省に相談してください。\n";
          }
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ユーザーリスト照合に失敗しました: ${error instanceof Error ? error.message : String(error)}\n\n経済産業省の公式ページで直接確認してください:\n${METI_PAGE_URL}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
