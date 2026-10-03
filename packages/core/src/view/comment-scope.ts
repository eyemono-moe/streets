import { parseEventAddress } from "../nostr/address";
import type { NostrEvent } from "../nostr/event";
import { type EventRef, commentRefs, replyTarget } from "../nostr/event-refs";
import { KIND_SUPPORT } from "../nostr/kind-support";

/**
 * コメントが何について書かれたか。投稿のスレッドの中のコメント（根が kind:1）は
 * 返信と同じに見せるので、ここでは扱わない。
 */
export type CommentScope =
  | { type: "event"; label: string; target: EventRef }
  | { type: "external"; label: string; value: string; url?: string };

// NIP-73 の外部の識別子。ここに無いものは「何か」とだけ言う。
const EXTERNAL_LABELS: Record<string, string> = {
  web: "Web ページ",
  "#": "ハッシュタグ",
  geo: "場所",
  isbn: "本",
  isan: "映像作品",
  doi: "論文",
};

const externalLabel = (kind: string | undefined): string => {
  if (kind === undefined) return "外部のもの";
  if (kind.startsWith("podcast")) return "ポッドキャスト";
  return EXTERNAL_LABELS[kind] ?? "外部のもの";
};

const eventLabel = (kind: number | undefined): string => {
  const summary = KIND_SUPPORT.find((entry) => entry.kind === kind)?.summary;
  return summary ? `${summary}へのコメント` : "コメント";
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/** 根が投稿（kind:1）でないコメントの、根が何か。それ以外は `undefined`。 */
export const commentScope = (event: NostrEvent): CommentScope | undefined => {
  const root = commentRefs(event)?.root;
  if (!root) return undefined;
  if (root.form === "external") {
    const scope: CommentScope = {
      type: "external",
      label: `${externalLabel(root.kind)}へのコメント`,
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
