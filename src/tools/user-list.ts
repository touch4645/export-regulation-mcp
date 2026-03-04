import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCache, setCache } from "../lib/cache.js";
import { CACHE_TTLS } from "../types/index.js";
import type { UserListEntry } from "../types/index.js";

// METI End-User List URL (CSV)
const USER_LIST_URL =
  "https://www.meti.go.jp/policy/anpo/law05.html";

async function fetchUserList(): Promise<UserListEntry[]> {
  // Try cache first
  const cached = await getCache<UserListEntry[]>("user_list");
  if (cached && !cached.stale) {
    return cached.data;
  }

  // Note: The actual user list is published as an Excel/PDF file by METI.
  // Programmatic access requires parsing that file.
  // For now, we use a curated subset and instruct users to check the official source.
  // In production, this would fetch and parse the actual METI data.

  try {
    const response = await fetch(USER_LIST_URL);
    if (!response.ok) {
      if (cached) return cached.data;
      throw new Error(`Failed to fetch user list page: ${response.status}`);
    }
    // The page contains links to the actual Excel files
    // For this implementation, we note that parsing is needed
    // and return cached/fallback data
    if (cached) return cached.data;
    return [];
  } catch {
    if (cached) return cached.data;
    return [];
  }
}

export function registerUserListTools(server: McpServer): void {
  server.tool(
    "export_reg_check_user_list",
    "経済産業省の外国ユーザーリスト（懸念企業リスト）に対して組織名を照合します。大量破壊兵器の開発等に関与している懸念のある企業・組織が掲載されています。注意: 現在はMETI公式ページへの参照案内が主な機能です。実際のリストデータはExcel/PDF形式で公開されており、自動取得には追加実装が必要です。",
    {
      organization: z
        .string()
        .describe("照合する組織名（部分一致で検索）"),
      country: z
        .string()
        .optional()
        .describe("国名で絞り込み（日本語）"),
    },
    async ({ organization, country }) => {
      try {
        const entries = await fetchUserList();
        const normalizedOrg = organization.toLowerCase().trim();

        let matches: UserListEntry[];
        if (entries.length > 0) {
          matches = entries.filter((entry) => {
            const orgMatch = entry.organization.toLowerCase().includes(normalizedOrg);
            const countryMatch = country
              ? entry.country.includes(country)
              : true;
            return orgMatch && countryMatch;
          });
        } else {
          matches = [];
        }

        let text = `# 外国ユーザーリスト照合結果\n\n`;
        text += `検索条件: 組織名="${organization}"`;
        if (country) text += `, 国="${country}"`;
        text += "\n\n";

        if (entries.length === 0) {
          text += "⚠️ 外国ユーザーリストのデータを取得できませんでした。\n\n";
          text += "経済産業省の公式ページで直接確認してください:\n";
          text += `${USER_LIST_URL}\n\n`;
          text += "外国ユーザーリストは以下からダウンロードできます:\n";
          text += "- Excel形式: 経済産業省 安全保障貿易管理のページ\n";
          text += "- 最新版は上記URLから取得してください\n";
        } else if (matches.length > 0) {
          text += `**⚠️ ${matches.length}件の一致が見つかりました**\n\n`;
          for (const entry of matches) {
            text += `### ${entry.organization}\n`;
            text += `- 国: ${entry.country}\n`;
            text += `- 種別: ${entry.type}\n`;
            if (entry.updateDate) {
              text += `- 更新日: ${entry.updateDate}\n`;
            }
            text += "\n";
          }
          text += "---\n";
          text += "外国ユーザーリストに掲載されている組織への輸出は、キャッチオール規制の「客観要件」に該当する可能性があります。\n";
          text += "経済産業省への個別許可申請を検討してください。\n";
        } else {
          text += "一致する組織は見つかりませんでした。\n\n";
          text += "注意:\n";
          text += "- この結果は参考情報です。最終的な判断は経済産業省の最新の外国ユーザーリストで確認してください。\n";
          text += "- 外国ユーザーリストに掲載されていなくても、輸出者自身が需要者の用途について懸念がある場合は経済産業省に相談してください。\n";
        }

        // Cache the entries for future use
        if (entries.length > 0) {
          await setCache("user_list", entries, CACHE_TTLS.USER_LIST);
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ユーザーリスト照合に失敗しました: ${error instanceof Error ? error.message : String(error)}\n\n経済産業省の公式ページで直接確認してください:\n${USER_LIST_URL}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
