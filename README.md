# export-regulation-mcp

日本の輸出管理（該非判定）を支援するMCPサーバーです。e-Gov法令API v2を通じて、輸出貿易管理令・外国為替令・貨物等省令などの法令データをリアルタイムに参照できます。

リスト規制とキャッチオール規制の両方に対応し、該非判定に必要なデータソースを包括的にカバーします。

## 機能

### リスト規制関連

| ツール | 説明 |
|--------|------|
| `export_reg_get_law` | 法令IDを指定して法令本文を取得 |
| `export_reg_search_law` | キーワードで輸出管理関連法令を検索 |
| `export_reg_get_annex` | 輸出貿易管理令の別表（リスト規制品目等）を取得 |
| `export_reg_get_ministerial_ordinance` | 貨物等省令の条文を取得 |
| `export_reg_get_parameter_thresholds` | 項番別の技術パラメータ閾値を取得 |

### キャッチオール規制関連

| ツール | 説明 |
|--------|------|
| `export_reg_get_annex3_2` | 別表第3の2（国連武器禁輸国・地域）を取得 |
| `export_reg_get_fear_ordinance` | おそれ省令（用途要件の判定基準）を取得 |
| `export_reg_get_tariff_items` | 関税定率法の品目分類（16項中欄関連）を取得 |

### 仕向地・需要者確認

| ツール | 説明 |
|--------|------|
| `export_reg_get_white_countries` | グループA国（旧ホワイト国）リストを取得 |
| `export_reg_check_country` | 国別の輸出管理ステータスを確認 |
| `export_reg_check_user_list` | 経産省の外国ユーザーリストをExcelから自動取得・照合 |

## セットアップ

```bash
npm install
npm run build
```

## 使い方

### Claude Code

`~/.claude/settings.json` に追加:

```json
{
  "mcpServers": {
    "export-regulation-mcp": {
      "command": "node",
      "args": ["/path/to/export-regulation-mcp/build/index.js"]
    }
  }
}
```

### Claude Desktop

`claude_desktop_config.json` に追加:

```json
{
  "mcpServers": {
    "export-regulation-mcp": {
      "command": "node",
      "args": ["/path/to/export-regulation-mcp/build/index.js"]
    }
  }
}
```

## 主要法令ID

| 法令 | ID |
|------|-----|
| 輸出貿易管理令 | `324CO0000000378` |
| 外国為替令 | `355CO0000000260` |
| 貨物等省令 | `403M50000400049` |
| おそれ省令 | `413M60000400249` |
| 関税定率法 | `143AC0000000054` |
| 輸出者等遵守基準省令 | `421M60000400060` |

## 別表マッピング

輸出貿易管理令の別表は e-Gov API の `elm` パラメータとして `AppdxTable[N]` 形式で指定します。

| 別表 | elm パラメータ |
|------|---------------|
| 別表第1（リスト規制品目） | `AppdxTable[1]` |
| 別表第2 | `AppdxTable[2]` |
| 別表第3（グループA国） | `AppdxTable[3]` |
| 別表第3の2（武器禁輸国） | `AppdxTable[7]` |
| 別表第3の3 | `AppdxTable[8]` |

## 使用例

### リスト規制の該非判定

1. `export_reg_get_annex` で別表第1の該当項番を特定
2. `export_reg_get_parameter_thresholds` で技術パラメータ閾値を確認
3. `export_reg_get_ministerial_ordinance` で省令の詳細条文を参照

### キャッチオール規制の確認

1. `export_reg_check_country` で仕向地のグループ分類を確認（グループA国は対象外）
2. `export_reg_get_annex3_2` で武器禁輸国リストを確認
3. `export_reg_get_fear_ordinance` で用途要件（おそれ省令）を参照
4. `export_reg_check_user_list` で需要者を外国ユーザーリストと照合
5. `export_reg_get_tariff_items` で16項中欄の品目分類を確認

## キャッシュ

e-Gov APIへの負荷軽減のため、レスポンスをローカルファイルにキャッシュします。

| データ種別 | TTL |
|-----------|-----|
| 法令本文・別表 | 24時間 |
| 外国ユーザーリスト | 7日 |
| ホワイト国リスト | 30日 |

キャッシュは `cache/` ディレクトリに保存されます。API障害時はstaleキャッシュをフォールバックとして使用します。

## 技術スタック

- TypeScript + Node.js (ES Modules)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) v1.x
- [e-Gov法令API v2](https://laws.e-gov.go.jp/apitop/)
- [xlsx (SheetJS)](https://sheetjs.com/) — 外国ユーザーリストExcelパース
- zod (入力バリデーション)

## ライセンス

MIT
