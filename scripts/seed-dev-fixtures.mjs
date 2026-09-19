const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** 開発用 seed が、設定ミスで外部リレーへ流れることを防ぐ。 */
export const assertLocalRelayUrl = (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`ローカルリレー以外へは seed できません: ${raw}`);
  }
  if (
    (url.protocol !== "ws:" && url.protocol !== "wss:") ||
    !LOOPBACK_HOSTS.has(url.hostname)
  ) {
    throw new Error(`ローカルリレー以外へは seed できません: ${raw}`);
  }
  return raw;
};

/** マーカー無しの r タグは NIP-65 で read/write 両用。 */
export const relayListTemplate = (relayUrl, createdAt) => ({
  kind: 10002,
  created_at: createdAt,
  tags: [["r", relayUrl]],
  content: "",
});

/** 順序を保ちながら、seed中のイベント数が増えても未来時刻を作らない。 */
export const createPastTimestampSequence = (now, lookbackSeconds = 300) => {
  let tick = 0;
  return () => Math.min(now - lookbackSeconds + tick++, now);
};
