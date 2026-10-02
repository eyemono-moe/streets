import {
  isProbablyImageUrl,
  isProbablyVideoUrl,
} from "@streets/core/nostr/content";
import { contentWarning } from "@streets/core/nostr/content-warning";
import { articleExcerpt, parseArticle } from "@streets/core/nostr/long-form";
import { type Nip19Ref, decodeNip19 } from "@streets/core/nostr/nip19";
import { parseProfile, shortNpub } from "@streets/core/nostr/profile";
import type { EntityFound } from "./entity-fetch";

/** リンクのカードに出す中身。 */
export type PageMeta = {
  title: string;
  description?: string;
  image?: string;
  /** 人なら `profile`、投稿や記事なら `article`。 */
  type: "profile" | "article";
  /** 大きい画像のカードにするか。人のアイコンは小さいカードで出す。 */
  largeImage: boolean;
  url: string;
};

const MAX_DESCRIPTION = 200;

/** パスが `/npub1…` などの 1 語だけなら、それが指すもの。 */
export const entityOfPath = (pathname: string): Nip19Ref | undefined => {
  const value = pathname.replace(/^\//, "");
  if (value === "" || value.includes("/")) return undefined;
  return decodeNip19(value);
};

/**
 * リンクのカードを作りに来たボットか。カードの中身を作るにはリレーへ聞きに行く
 * ので、人が開いたときには待たせない。
 */
export const isLinkPreviewBot = (userAgent: string | null): boolean =>
  userAgent !== null &&
  /bot|crawler|spider|preview|facebookexternalhit|embedly|slackbot|discord|telegram|whatsapp|line\/|misskey|mastodon|pleroma|akkoma|bluesky|cardyb|skype|vkshare|iframely|outbrain|pinterest|google-inspectiontool/i.test(
    userAgent,
  );

const clip = (text: string, max: number): string => {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const httpsUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

/** 本文に貼られた最初の画像。カードに使うので https に限る。 */
const firstImage = (content: string): string | undefined =>
  content
    .match(/https:\/\/[^\s<>"]+/g)
    ?.find((url) => isProbablyImageUrl(url) && httpsUrl(url) !== undefined);

/**
 * カードの説明に向く本文。`nostr:` 参照は読めない長い文字列なので短くし、
 * 画像や動画の URL はカードの画像で見せるので落とす。
 */
const readable = (content: string): string =>
  content
    .replace(/nostr:(npub|nprofile|note|nevent|naddr)1[0-9a-z]+/g, "…")
    .replace(/https?:\/\/[^\s<>"]+/g, (url) =>
      isProbablyImageUrl(url) || isProbablyVideoUrl(url) ? "" : url,
    );

/**
 * 見つかったものからカードの中身を作る。見つからなければ undefined を返し、
 * 呼ぶ側はアプリの既定のカードのまま返す。
 */
export const entityMeta = (
  ref: Nip19Ref,
  found: EntityFound,
  url: string,
): PageMeta | undefined => {
  const profile = found.profile
    ? parseProfile(found.profile.content)
    : undefined;
  const pubkey = found.event?.pubkey ?? found.profile?.pubkey;
  const name =
    profile?.displayName ??
    profile?.name ??
    (pubkey ? shortNpub(pubkey) : undefined);
  const avatar = httpsUrl(profile?.picture);

  if (ref.kind === "npub" || ref.kind === "nprofile") {
    if (!found.profile || !name) return undefined;
    return {
      title: `${name} | Streets`,
      description: profile?.about
        ? clip(profile.about, MAX_DESCRIPTION)
        : undefined,
      image: avatar,
      type: "profile",
      largeImage: false,
      url,
    };
  }

  const event = found.event;
  if (!event) return undefined;
  const author = name ?? shortNpub(event.pubkey);
  // 閲覧注意の投稿は、本文も画像もカードに出さない。
  if (contentWarning(event)) {
    return {
      title: `${author}さんの投稿 | Streets`,
      description: "閲覧注意の投稿です。",
      type: "article",
      largeImage: false,
      url,
    };
  }

  const article = parseArticle(event);
  if (article) {
    const image = httpsUrl(article.image);
    const excerpt = articleExcerpt(article);
    return {
      title: `${article.title ?? `${author}さんの記事`} | Streets`,
      description: excerpt ? clip(excerpt, MAX_DESCRIPTION) : undefined,
      image: image ?? avatar,
      type: "article",
      largeImage: image !== undefined,
      url,
    };
  }

  const image = firstImage(event.content);
  const text = clip(readable(event.content), MAX_DESCRIPTION);
  return {
    title: `${author}さんの投稿 | Streets`,
    description: text === "" ? undefined : text,
    image: image ?? avatar,
    type: "article",
    largeImage: image !== undefined,
    url,
  };
};

const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** カードに関わる既存の行。差し替えるので、アプリの既定の分は抜く。 */
const CARD_TAG_RE =
  /\s*<(?:meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*|link\s+rel="canonical"[^>]*)>/g;

/**
 * アプリの HTML のカードの部分を差し替える。題名と説明を変えるだけで、画面は
 * そのまま動く（人が開いても同じものが描かれる）。
 */
export const withMeta = (html: string, meta: PageMeta): string => {
  const tags = [
    `<link rel="canonical" href="${escape(meta.url)}" />`,
    `<meta property="og:site_name" content="Streets" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:url" content="${escape(meta.url)}" />`,
    `<meta property="og:title" content="${escape(meta.title)}" />`,
    ...(meta.description
      ? [
          `<meta name="description" content="${escape(meta.description)}" />`,
          `<meta property="og:description" content="${escape(meta.description)}" />`,
        ]
      : []),
    ...(meta.image
      ? [`<meta property="og:image" content="${escape(meta.image)}" />`]
      : []),
    `<meta name="twitter:card" content="${meta.largeImage ? "summary_large_image" : "summary"}" />`,
  ];
  return html
    .replace(CARD_TAG_RE, "")
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(meta.title)}</title>`)
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
};
