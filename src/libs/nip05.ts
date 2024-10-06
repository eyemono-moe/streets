import * as v from "valibot";

// TODO: https://datatracker.ietf.org/doc/html/rfc5322#section-3.4.1 に準拠する

export const parseNip05 = (nip05: string) => {
  if (nip05.includes("@")) {
    const [name, domain] = nip05.split("@");
    return { name, domain };
  }

  return {
    name: "_",
    domain: nip05,
  };
};

// https://github.com/nostr-protocol/nips/blob/master/05.md

const nip05 = v.object({
  names: v.record(v.string(), v.optional(v.string())),
});

export const fetchNip05 = async (name: string, domain: string) => {
  const url = `https://${domain}/.well-known/nostr.json?name=${name}`;

  const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);

  if (!res.ok || res.status < 200 || 300 <= res.status) {
    return;
  }

  const json = await res.json();
  const parseRes = v.safeParse(nip05, json);

  if (parseRes.success) {
    return parseRes.output;
  }
  console.warn(parseRes.issues);
};
