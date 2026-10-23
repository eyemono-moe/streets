import type { Message, MessageKey } from "../i18n/message";
import { parseEventAddress } from "../nostr/address";
import { commentRefs } from "../nostr/comment";
import type { NostrEvent } from "../nostr/event";
import { type EventRef } from "../nostr/event-refs";
import { KIND_SUPPORT } from "../nostr/kind-support";
import { replyTarget } from "../nostr/reply";

/**
 * コメントが何について書かれたか。投稿のスレッドの中のコメント（根が kind:1）は
 * 返信と同じに見せるので、ここでは扱わない。
 */
export type CommentScope =
  | { type: "event"; label: Message; target: EventRef }
  | { type: "external"; label: Message; value: string; url?: string };

// NIP-73 の外部の識別子。ここに無いものは「何か」とだけ言う。
const EXTERNAL_LABELS: Record<string, MessageKey> = {
  web: "comment.scope.web",
  "#": "comment.scope.hashtag",
  geo: "comment.scope.geo",
  isbn: "comment.scope.isbn",
  isan: "comment.scope.isan",
  doi: "comment.scope.doi",
};

const externalLabel = (kind: string | undefined): Message => {
  if (kind === undefined) return { key: "comment.scope.external" };
  if (kind.startsWith("podcast")) return { key: "comment.scope.podcast" };
  return { key: EXTERNAL_LABELS[kind] ?? "comment.scope.external" };
};

const eventLabel = (kind: number | undefined): Message =>
  KIND_SUPPORT.some((entry) => entry.kind === kind) && kind !== undefined
    ? { key: "comment.scope.event", args: { kind } }
    : { key: "comment.scope.comment" };

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/** 根が投稿（kind:1）でないコメントの、根が何か。それ以外は `undefined`。 */
export const commentScope = (event: NostrEvent): CommentScope | undefined => {
  const root = commentRefs(event)?.root;
  if (!root) return undefined;
  if (root.form === "external") {
    const scope: CommentScope = {
      type: "external",
      label: externalLabel(root.kind),
      value: root.value,
    };
    if (root.kind === "web" && isHttpUrl(root.value)) scope.url = root.value;
    return scope;
  }
  // 根の kind が書かれていなければ、記事なら住所から分かる。
  const kind =
    root.kind ??
    (root.form === "address"
      ? parseEventAddress(root.address)?.kind
      : undefined);
  if (kind === 1) return undefined;
  const { kind: _, ...target } = root;
  return { type: "event", label: eventLabel(kind), target };
};

/**
 * 返信先の人。`replyTarget` は id しか見ないので、記事などの住所へのコメントは
 * 住所に入っている書き手を返す。
 */
export const replyPubkey = (event: NostrEvent): string | undefined => {
  const ref = replyTarget(event);
  if (ref) return ref.pubkey;
  const parent = commentRefs(event)?.parent;
  return parent?.form === "address"
    ? parseEventAddress(parent.address)?.pubkey
    : undefined;
};

/**
 * 上に添える返信先のイベント。記事などの住所へのコメントは住所で引く。
 * 外部の識別子へのコメントは、引けるイベントが無い。
 */
export const replyParentRef = (event: NostrEvent): EventRef | undefined => {
  const ref = replyTarget(event);
  if (ref) return ref;
  const parent = commentRefs(event)?.parent;
  if (parent?.form !== "address") return undefined;
  const { kind: _, ...target } = parent;
  return target;
};
