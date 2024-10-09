import * as linkify from "linkifyjs";
import { kinds } from "nostr-tools";
import { decode } from "nostr-tools/nip19";
import type { ImetaTag, Tag } from "./parser/commonTag";

const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const isImageUrl = (url: string) => {
  const ext = url.split(".").pop();
  return ext && imageExtensions.includes(ext.toLowerCase());
};

export type TextContent = {
  type: "text";
  content: string;
};
export type ImageContent = {
  type: "image";
  src: string;
  blurhash?: string;
  alt?: string;
  thumb?: string;
  size?: { width: number; height: number };
};
export type LinkContent = {
  type: "link";
  href: string;
  content: string;
};
export type MentionContent = {
  type: "mention";
  pubkey: string;
  relay?: string;
};
export type QuoteContent = {
  type: "quote";
  id: string;
};
export type HashtagContent = {
  type: "hashtag";
  tag: string;
};
export type EmojiContent = {
  type: "emoji";
  tag: string;
  url: string;
};
// TODO: nrelay, nprofile, naddr, nevent

export type ParsedContent =
  | TextContent
  | ImageContent
  | LinkContent
  | MentionContent
  | QuoteContent
  | HashtagContent
  | EmojiContent;

// https://github.com/nostr-protocol/nips/blob/master/27.md

const mentionRegex =
  /\b(?:nostr:)?((note|npub|naddr|nevent|nprofile)1\w+)|#(\w+)\b/g;

type Refecence = {
  start: number;
  end: number;
} & (
  | {
      type: "quote";
      value: {
        id: string;
      };
    }
  | {
      type: "hashtag";
      value: {
        tag: string;
      };
    }
  | {
      type: "mention";
      value: {
        pubkey: string;
      };
    }
  | {
      type: "emoji";
      value: {
        name: string;
        url: string;
      };
    }
);

const parseReferences = (text: string, tags: Tag[]): Refecence[] => {
  const refs: Refecence[] = [];

  const emojiTags = tags.filter((tag) => tag.kind === "emoji");
  const hashtagTags = tags.filter((tag) => tag.kind === "t");

  if (emojiTags.length > 0) {
    const emojiRegex = new RegExp(
      `:(${emojiTags.map((tag) => tag.name).join("|")}):`,
      "g",
    );
    const emojiUrlMap = new Map(
      emojiTags.map((tag) => [tag.name, tag.url] as const),
    );

    for (const match of text.matchAll(emojiRegex)) {
      const length = match[0].length;
      const start = match.index;
      const end = start + length;
      const emojiTag = match[1];
      const url = emojiUrlMap.get(emojiTag);

      if (emojiTag && url) {
        refs.push({
          start,
          end,
          type: "emoji",
          value: {
            name: emojiTag,
            url,
          },
        });
      }
    }
  }

  for (const match of text.matchAll(mentionRegex)) {
    const length = match[0].length;
    const start = match.index;
    const end = start + length;
    const hex = match.at(1);

    if (hex) {
      const { data, type } = decode(hex);
      switch (type) {
        case "note":
          refs.push({
            start,
            end,
            type: "quote",
            value: {
              id: data,
            },
          });
          break;
        case "nevent":
          refs.push({
            start,
            end,
            type: "quote",
            value: {
              id: data.id,
            },
          });
          break;
        case "npub":
          refs.push({
            start,
            end,
            type: "mention",
            value: {
              pubkey: data,
            },
          });
          break;
        case "nprofile":
          refs.push({
            start,
            end,
            type: "mention",
            value: {
              pubkey: data.pubkey,
            },
          });
          break;
        case "naddr": {
          switch (data.kind) {
            case kinds.ShortTextNote:
              refs.push({
                start,
                end,
                type: "quote",
                value: {
                  id: data.identifier,
                },
              });
              break;
            case kinds.Metadata:
              refs.push({
                start,
                end,
                type: "mention",
                value: {
                  pubkey: data.identifier,
                },
              });
              break;
          }
          break;
        }
      }
    }

    const hashtag = match.at(3);
    // postのtagに["t", content]として含まれているかどうか判定する
    if (hashtag && hashtagTags.some((tag) => tag.tag === hashtag)) {
      refs.push({
        start,
        end,
        type: "hashtag",
        value: {
          tag: hashtag,
        },
      });
    }
  }
  return refs;
};

export const parseTextContent = (content: string, tags: Tag[]) => {
  try {
    const references = parseReferences(content, tags);
    const imetaTags = tags.filter((tag) => tag.kind === "imeta");
    const splittedContent = splitTextByLinks(content, references, imetaTags);
    return splittedContent;
  } catch (e) {
    console.error("failed to parse contents: ", e);
    return [
      {
        type: "text" as const,
        content,
      },
    ];
  }
};

export const splitTextByLinks = (
  text: string,
  refs: Refecence[],
  imetaTags: ImetaTag[],
): ParsedContent[] => {
  const links = linkify.find(text, {});

  const sortedLinkOrRefs = [...links, ...refs].sort(
    (a, b) => a.start - b.start,
  );

  const parsedContent: ParsedContent[] = [];
  let lastIdx = 0;
  for (const linkOrRef of sortedLinkOrRefs) {
    const { start, end } = linkOrRef;
    if (start > lastIdx) {
      parsedContent.push({
        type: "text",
        content: text.slice(lastIdx, start),
      });
    }

    const matchedContent = text.slice(start, end);
    if (isRef(linkOrRef)) {
      switch (linkOrRef.type) {
        case "mention":
          parsedContent.push({
            type: "mention",
            pubkey: linkOrRef.value.pubkey,
          });
          break;
        case "quote":
          parsedContent.push({
            type: "quote",
            id: linkOrRef.value.id,
          });
          break;
        case "hashtag":
          parsedContent.push({
            type: "hashtag",
            tag: linkOrRef.value.tag,
          });
          break;
        case "emoji":
          parsedContent.push({
            type: "emoji",
            tag: linkOrRef.value.name,
            url: linkOrRef.value.url,
          });
          break;
        default: {
          const _unreachable: never = linkOrRef;
          throw new Error(`Unknown ref type: ${_unreachable}`);
        }
      }
    } else {
      if (isImageUrl(matchedContent)) {
        const imetaTag = imetaTags.find((tag) => tag.url === matchedContent);

        parsedContent.push({
          type: "image",
          src: matchedContent,
          blurhash: imetaTag?.blurhash,
          alt: imetaTag?.alt,
          thumb: imetaTag?.thumb,
          size: imetaTag?.dim
            ? {
                width: Number(imetaTag.dim.split("x")[0]),
                height: Number(imetaTag.dim.split("x")[1]),
              }
            : undefined,
        });
        lastIdx = end;
      } else {
        parsedContent.push({
          type: "link",
          href: linkOrRef.href,
          content: text.slice(start, end),
        });
      }
    }

    lastIdx = end;
  }

  if (lastIdx < text.length) {
    parsedContent.push({
      type: "text",
      content: text.slice(lastIdx),
    });
  }

  return parsedContent;
};

const isRef = (
  ref: Refecence | ReturnType<typeof linkify.find>[number],
): ref is ReturnType<typeof parseReferences>[number] => {
  return !("href" in ref);
};

export const parsedContents2Tags = (
  parsedContents: ParsedContent[],
): string[][] => {
  const tags: string[][] = [];
  for (const parsedContent of parsedContents) {
    switch (parsedContent.type) {
      case "text":
      case "image":
      case "emoji":
        // do nothing
        break;
      case "quote":
        // TODO: get relay, pubkey from cache
        tags.push(["q", parsedContent.id]);
        break;
      case "hashtag":
        tags.push(["t", parsedContent.tag]);
        break;
      case "mention":
        // TODO: get relay from cache
        tags.push(["p", parsedContent.pubkey]);
        break;
      case "link":
        tags.push(["r", parsedContent.href]);
        break;
    }
  }
  return tags;
};
