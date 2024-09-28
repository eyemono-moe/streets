import * as linkify from "linkifyjs";
import { parseReferences } from "nostr-tools";
import type { parseShortTextNote } from "../features/ShortText/event";
import type { ImetaTag } from "./commonTag";

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
};
export type QuoteContent = {
  type: "quote";
  id: string;
};
export type HashtagContent = {
  type: "hashtag";
  tag: string;
};
export type ParsedContent =
  | TextContent
  | ImageContent
  | LinkContent
  | MentionContent
  | QuoteContent
  | HashtagContent;

export const parseTextContent = (
  event: ReturnType<typeof parseShortTextNote>,
) => {
  try {
    const references = parseReferences(event.raw);

    const imetaTags = event.tags.filter((tag) => tag.kind === "imeta");
    const splittedContent = splitTextByLinks(
      event.content,
      references,
      imetaTags,
    );

    return splittedContent;
  } catch (e) {
    console.error("failed to parse contents: ", e);
    return [
      {
        type: "text" as const,
        content: event.content,
      },
    ];
  }
};

export const splitTextByLinks = (
  text: string,
  refs: ReturnType<typeof parseReferences>,
  imetaTags: ImetaTag[],
): ParsedContent[] => {
  const links = linkify.find(text, {});
  const refsWithStartAndEnd = calcStartAndEnd(text, refs);

  const sortedLinkOrRefs = [...links, ...refsWithStartAndEnd].sort(
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
      if (linkOrRef.profile) {
        parsedContent.push({
          type: "mention",
          pubkey: linkOrRef.profile.pubkey,
        });
      }
      if (linkOrRef.event) {
        parsedContent.push({
          type: "quote",
          id: linkOrRef.event.id,
        });
      }
      // TODO: hashtag
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

export const calcStartAndEnd = (
  text: string,
  refs: ReturnType<typeof parseReferences>,
) => {
  const refsWithStartAndEnd = refs.map((ref) => {
    const start = text.indexOf(ref.text);
    return {
      ...ref,
      start,
      end: start + ref.text.length,
      type: "ref",
    } as const;
  });

  return refsWithStartAndEnd;
};

const isRef = (
  ref:
    | ReturnType<typeof parseReferences>[number]
    | ReturnType<typeof linkify.find>[number],
): ref is ReturnType<typeof parseReferences>[number] => {
  return "text" in ref;
};
