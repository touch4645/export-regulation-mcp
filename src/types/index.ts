// e-Gov API v2 response types

export interface EGovLawDataResponse {
  result: {
    code: string;
    message: string;
  };
  law_full_text?: LawFullText;
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

export interface LawFullText {
  law: LawElement;
}

export interface LawElement {
  law_type?: string;
  law_num?: string;
  law_body: LawBody;
}

export interface LawBody {
  law_title?: string;
  main_provision?: MainProvision;
  suppl_provision?: unknown[];
  appdx_table?: AppdxTable[];
}

export interface MainProvision {
  article?: Article[];
  chapter?: Chapter[];
}

export interface Chapter {
  chapter_title?: string;
  article?: Article[];
}

export interface Article {
  article_title?: string;
  article_caption?: string;
  paragraph?: Paragraph[];
}

export interface Paragraph {
  paragraph_num?: string;
  paragraph_sentence?: Sentence;
  item?: Item[];
}

export interface Sentence {
  sentence?: Array<{ content: string }>;
}

export interface Item {
  item_title?: string;
  item_sentence?: Sentence;
  sub_item1?: SubItem[];
}

export interface SubItem {
  sub_item1_title?: string;
  sub_item1_sentence?: Sentence;
  sub_item2?: SubItem2[];
}

export interface SubItem2 {
  sub_item2_title?: string;
  sub_item2_sentence?: Sentence;
}

export interface AppdxTable {
  appdx_table_title?: string;
  table_struct?: unknown;
  remarks?: unknown;
}

// e-Gov keyword search response
export interface EGovKeywordResponse {
  result: {
    code: string;
    message: string;
  };
  total_count?: number;
  laws?: LawInfo[];
}

// e-Gov laws list response
export interface EGovLawsResponse {
  result: {
    code: string;
    message: string;
  };
  total_count?: number;
  laws?: LawInfo[];
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
} as const;

// Cache TTLs in milliseconds
export const CACHE_TTLS = {
  LAW_TEXT: 24 * 60 * 60 * 1000, // 24 hours
  ANNEX: 24 * 60 * 60 * 1000, // 24 hours
  USER_LIST: 7 * 24 * 60 * 60 * 1000, // 7 days
  WHITE_COUNTRIES: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;
