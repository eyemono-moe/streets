/** ビットコインの 1 単位あたりのミリサトシ（1 BTC = 10^8 sat = 10^11 msat）。 */
const MULTIPLIER_MSAT: Record<string, bigint> = {
  m: 100_000_000n,
  u: 100_000n,
  n: 100n,
};

/**
 * ライトニングの請求書（BOLT-11）の金額をミリサトシで読む。金額は人が読める
 * 部分（`lnbc2500u1…` の `2500u`）にあり、署名の検証は要らない。金額の無い
 * 請求書・読めない請求書は `undefined`。
 */
export const bolt11AmountMsat = (invoice: string): number | undefined => {
  const lower = invoice
    .trim()
    .toLowerCase()
    .replace(/^lightning:/, "");
  const separator = lower.lastIndexOf("1");
  if (separator < 0) return undefined;
  const match = /^ln(?:bcrt|bc|tbs|tb)(\d+)([munp]?)$/.exec(
    lower.slice(0, separator),
  );
  if (!match) return undefined;
  const [, digits = "", unit = ""] = match;
  if (/^0\d/.test(digits)) return undefined;
  const amount = BigInt(digits);
  let msat: bigint;
  if (unit === "") msat = amount * 100_000_000_000n;
  else if (unit === "p") {
    // 1 pico-BTC は 0.1 msat。ミリサトシに割り切れない金額は仕様上不正。
    if (amount % 10n !== 0n) return undefined;
    msat = amount / 10n;
  } else msat = amount * (MULTIPLIER_MSAT[unit] ?? 0n);
  return msat > 0n && msat <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(msat)
    : undefined;
};
