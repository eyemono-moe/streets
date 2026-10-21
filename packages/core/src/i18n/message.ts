/**
 * 画面に出す文言。core は文を持たず、キーと埋める値を返す。文は web の辞書
 * （`apps/web/src/core/i18n/`）が持ち、`core.<key>` で引く。
 */
export type Message = {
  key: MessageKey;
  args?: Readonly<Record<string, string | number>>;
  /** 数で形が変わる文。辞書は `<key>.one` と `<key>.other` を持ち、`{{ count }}` にも入る。 */
  count?: number;
};

/** 文言で失敗を知らせる。web は `text` を辞書で引いて出す。 */
export class MessageError extends Error {
  readonly text: Message;
  constructor(text: Message) {
    super(text.key);
    this.name = "MessageError";
    this.text = text;
  }
}

/**
 * core が返すキーの一覧。足したら web の `core` の辞書にも足す（型検査が落とす）。
 */
export type MessageKey =
  | "column.title.home"
  | "column.title.timeslip"
  | "column.title.followeesActivity"
  | "column.title.notifications"
  | "column.title.bookmarks"
  | "column.title.article"
  | "column.title.thread"
  | "column.title.activity"
  | "column.title.followees"
  | "column.title.followers"
  | "column.title.info"
  | "column.title.followSets"
  | "column.title.channels"
  | "column.title.welcome"
  | "column.title.relays"
  | "column.title.note"
  | "column.alert.directUnreachable"
  | "column.alert.directUnreachableAction"
  | "column.alert.relaysBlocked"
  | "column.alert.relaysBlockedAction"
  | "column.alert.relaysUnreachable"
  | "column.alert.relaysUnreachableAction"
  | "column.alert.relayListMissing"
  | "column.alert.relayListMissingAction"
  | "column.alert.readRelaysUnreachable"
  | "column.alert.readRelaysUnreachableAction"
  | "column.alert.unroutable"
  | "column.alert.unroutableAction"
  | "write.rejection.blocked"
  | "write.rejection.rateLimited"
  | "write.rejection.invalid"
  | "write.rejection.pow"
  | "write.rejection.restricted"
  | "write.rejection.authRequired"
  | "write.rejection.duplicate"
  | "write.rejection.error"
  | "write.rejection.timeout"
  | "write.rejection.unreachable"
  | "write.rejection.budget"
  | "write.status.checking"
  | "write.status.signing"
  | "write.status.noneReached"
  | "write.status.sending"
  | "write.status.savedSome"
  | "write.status.partial"
  | "write.status.saved";
