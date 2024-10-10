import * as v from "valibot";

const oembedResScheme = v.object({
  html: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
});

const oEmbedProviders: {
  name: string;
  patterns: string[];
  endpoint: string;
}[] = [
  {
    name: "youtube",
    patterns: [
      "https?://.*\\.youtube\\.com/watch.*",
      "https?://.*\\.youtube\\.com/v/.*",
      "https?://youtu\\.be/.*",
      "https?://.*\\.youtube\\.com/playlist\\?list=.*",
    ],
    endpoint: "https://www.youtube.com/oembed",
  },
  {
    name: "spotify",
    patterns: ["https?://open\\.spotify\\.com/.*", "spotify:.*"],
    endpoint: "https://open.spotify.com/oembed",
  },
];

const getOEmbedProvider = (url: string) => {
  for (const provider of oEmbedProviders) {
    for (const pattern of provider.patterns) {
      if (new RegExp(pattern).test(url)) {
        return provider;
      }
    }
  }
  return;
};

export const fetchOEmbed = async (url: string) => {
  const provider = getOEmbedProvider(url);
  if (!provider) {
    return;
  }
  const res = await fetch(
    `${provider.endpoint}?url=${encodeURIComponent(url)}`,
  );
  if (!res.ok) {
    return;
  }
  const data = await res.json();
  const parsed = v.safeParse(oembedResScheme, data);
  if (!parsed.success) {
    return;
  }
  return parsed.output;
};
