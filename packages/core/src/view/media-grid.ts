import type { NostrEvent } from "../nostr/event";
import { type NoteMedia, layoutNote } from "./note-layout";

/** 格子の 1 マス。1 つの投稿に何枚もあれば、1 枚ずつ別のマスにする。 */
export type MediaTile = {
  /** 投稿の id と、その投稿の中での順番。同じ URL を 2 度貼った投稿でも重ならない。 */
  key: string;
  event: NostrEvent;
  media: NoteMedia;
};

/** 投稿に添えられた画像・動画を、本文での順にマスにする。音声は絵が無いので入れない。 */
export const mediaTilesOf = (event: NostrEvent): MediaTile[] =>
  layoutNote(event, { quotes: false }).media.map((media, index) => ({
    key: `${event.id}:${index}`,
    event,
    media,
  }));
