import { RELAY_REDUNDANCY } from "../read/default-relays";

/**
 * フォローしている人ごとに、その人の書き込みリレーの何本から読むか。端末ごとの
 * 設定 —— 増やした分だけ接続と通信量が増え、それを許せるかは端末の回線で決まるため。
 */
export const READ_REDUNDANCY_STORAGE_KEY = "streets.v1.readRedundancy";

export const READ_REDUNDANCY_CHOICES = [1, 2, 3, 4] as const;

export type ReadRedundancy = (typeof READ_REDUNDANCY_CHOICES)[number];

export const DEFAULT_READ_REDUNDANCY: ReadRedundancy = RELAY_REDUNDANCY;

const isChoice = (value: number): value is ReadRedundancy =>
  (READ_REDUNDANCY_CHOICES as readonly number[]).includes(value);

/** 未保存・読めない値・選べない本数は既定（2 本）。 */
export const loadReadRedundancy = (raw: string | null): ReadRedundancy => {
  const value = Number(raw);
  return raw !== null && isChoice(value) ? value : DEFAULT_READ_REDUNDANCY;
};

export const saveReadRedundancy = (value: ReadRedundancy): string =>
  String(value);
