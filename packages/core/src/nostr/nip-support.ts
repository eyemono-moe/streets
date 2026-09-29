import inventory from "./nip-support.json";

export type NipSupport = {
  nip: string;
  status: "対応" | "一部" | "未対応";
  summary: string;
  kinds: number[];
  tags: string[];
  paths: string[];
  gap: string;
};

/** 対応 NIP の一覧。docs/nips.md と「Streets について」の共通データ。 */
export const NIP_SUPPORT: NipSupport[] = inventory as NipSupport[];
