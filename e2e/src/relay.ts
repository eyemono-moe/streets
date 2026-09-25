import type { NostrEvent } from "@streets/core/nostr/event";
import { RELAY_URL } from "./env";

export type Filter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  limit?: number;
  [tag: `#${string}`]: string[] | undefined;
};

const open = (url: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error(`${url} に繋がりません`)),
      { once: true },
    );
  });

/** 別のクライアントを模して、アプリを通さずにリレーへ書く。 */
export const publish = async (event: NostrEvent, url = RELAY_URL) => {
  const socket = await open(url);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("message", (message) => {
        const [type, id, ok, reason] = JSON.parse(String(message.data));
        if (type !== "OK" || id !== event.id) return;
        if (ok) resolve();
        else reject(new Error(`リレーが受け取りませんでした: ${reason}`));
      });
      socket.send(JSON.stringify(["EVENT", event]));
    });
  } finally {
    socket.close();
  }
};

/** 保存済みのイベントを EOSE まで読む。 */
export const query = async (
  filter: Filter,
  url = RELAY_URL,
): Promise<NostrEvent[]> => {
  const socket = await open(url);
  try {
    return await new Promise<NostrEvent[]>((resolve) => {
      const events: NostrEvent[] = [];
      socket.addEventListener("message", (message) => {
        const [type, , event] = JSON.parse(String(message.data));
        if (type === "EVENT") events.push(event as NostrEvent);
        if (type === "EOSE") resolve(events);
      });
      socket.send(JSON.stringify(["REQ", "e2e", filter]));
    });
  } finally {
    socket.close();
  }
};

/**
 * 条件に合うイベントがリレーに届くまで待つ。画面に出ても、リレーへの送信は
 * 後から終わることがある。
 */
export const waitForEvent = async (
  filter: Filter,
  match: (event: NostrEvent) => boolean = () => true,
  timeoutMs = 15_000,
): Promise<NostrEvent> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await query(filter)).find(match);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `リレーに条件に合うイベントが届きませんでした: ${JSON.stringify(filter)}`,
  );
};
