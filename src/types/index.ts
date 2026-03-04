// e-Gov API v2 response types

// Tree node structure returned by e-Gov API v2 JSON format
export interface EGovTreeNode {
  tag: string;
  attr?: Record<string, string>;
  children?: (EGovTreeNode | string)[];
}

export interface EGovLawDataResponse {
  result: {
    code: string;
    message: string;
  };
  law_full_text?: EGovTreeNode;
  law_info?: LawInfo;
}

export interface LawInfo {
  law_type: string;
  law_id: string;
  law_num: string;
  law_title: string;
  promulgation_date?: string;
  enforcement_date?: string;
}

// e-Gov keyword search response
export interface EGovKeywordItem {
  law_info: LawInfo;
  revision_info?: {
    law_revision_id?: string;
    law_type?: string;
    updated_date?: string;
  };
}

export interface EGovKeywordResponse {
  result: {
    code: string;
    message: string;
  };
  total_count?: number;
  items?: EGovKeywordItem[];
}

// e-Gov laws list response
export interface EGovLawsItem {
  law_info: LawInfo;
  revision_info?: {
    law_revision_id?: string;
    law_type?: string;
    updated_date?: string;
  };
}

export interface EGovLawsResponse {
  result: {
    code: string;
    message: string;
  };
  total_count?: number;
  laws?: EGovLawsItem[];
}

// Cache types
export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttl: number;
}

// Tool result types
export interface AnnexItem {
  itemNumber: string;
  title: string;
  description: string;
  subItems?: AnnexSubItem[];
}

export interface AnnexSubItem {
  number: string;
  description: string;
  parameters?: string[];
}

export interface WhiteCountry {
  name: string;
  group: string;
}

export interface UserListEntry {
  organization: string;
  country: string;
  type: string;
  updateDate?: string;
}

export interface ParameterThreshold {
  itemNumber: string;
  category: string;
  parameter: string;
  threshold: string;
  unit?: string;
}

// Known law IDs
export const LAW_IDS = {
  EXPORT_TRADE_CONTROL_ORDER: "324CO0000000378", // 輸出貿易管理令
  FOREIGN_EXCHANGE_ORDER: "355CO0000000260", // 外国為替令
  GOODS_MINISTERIAL_ORDINANCE: "403M50000400049", // 貨物等省令
  FEAR_ORDINANCE: "413M60000400249", // おそれ省令（輸出貿易管理令別表第一及び外国為替令別表の規定に基づき貨物又は技術を定める省令の運用について）
  TARIFF_LAW: "143AC0000000054", // 関税定率法
  COMPLIANCE_STANDARDS: "421M60000400060", // 輸出者等遵守基準省令
} as const;

// 輸出貿易管理令の別表番号 → e-Gov elm パラメータ マッピング
export const ANNEX_TABLE_MAP: Record<string, string> = {
  "1": "AppdxTable[1]",
  "2": "AppdxTable[2]",
  "3": "AppdxTable[3]",
  "4": "AppdxTable[4]",
  "5": "AppdxTable[5]",
  "6": "AppdxTable[6]",
  "3-2": "AppdxTable[7]",
  "3-3": "AppdxTable[8]",
};

// Cache TTLs in milliseconds
export const CACHE_TTLS = {
  LAW_TEXT: 24 * 60 * 60 * 1000, // 24 hours
  ANNEX: 24 * 60 * 60 * 1000, // 24 hours
  USER_LIST: 7 * 24 * 60 * 60 * 1000, // 7 days
  WHITE_COUNTRIES: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;
