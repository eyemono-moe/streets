import * as v from "valibot";

// https://github.com/nostr-protocol/nips/blob/master/11.md

const relayInformation = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  pubkey: v.optional(v.string()),
  contact: v.optional(v.string()),
  supported_nips: v.optional(v.array(v.number())),
  software: v.optional(v.string()),
  version: v.optional(v.string()),

  // extra fields
  icon: v.optional(v.string()),
});

export const fetchNip11 = async (relayUrl: string) => {
  let url = relayUrl;
  // urlがwssスキーマならばhttpsに変換する
  if (relayUrl.startsWith("wss://")) {
    url = relayUrl.replace("wss://", "https://");
  }
  const res = await fetch(url, {
    headers: {
      Accept: "application/nostr+json",
    },
  });

  if (!res.ok || res.status < 200 || 300 <= res.status) {
    console.warn(`failed to fetch nip05 from ${url}: ${res.status}`);
    return;
  }

  const json = await res.json();
  const parsed = v.safeParse(relayInformation, json);

  if (!parsed.success) {
    console.warn(parsed.issues);
    return;
  }
  return parsed.output;
};
