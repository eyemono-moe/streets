import { type RelayRequest, parseRelayRequest } from "./request";

type Env = {
  /** 呼べるのはこれを知っている人だけ（リリースのワークフロー）。 */
  TOKEN: string;
};

type RelayResult = { relay: string; accepted: boolean; message: string };

/** リレーの返事を待つ長さ。 */
const TIMEOUT_MS = 5_000;

const safeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

/**
 * 1 本のリレーへ送り、`OK` を待つ。Workers の外向きの WebSocket は、
 * `Upgrade` を付けた fetch で開く。
 */
const publish = async (
  relay: string,
  event: RelayRequest["event"],
): Promise<RelayResult> => {
  const result = (accepted: boolean, message: string): RelayResult => ({
    relay,
    accepted,
    message,
  });
  let socket: WebSocket | null = null;
  try {
    const response = await fetch(relay.replace(/^wss:/, "https:"), {
      headers: { Upgrade: "websocket" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    socket = response.webSocket;
    if (!socket) {
      return result(false, `接続できない（HTTP ${response.status}）`);
    }
    const opened = socket;
    opened.accept();
    return await new Promise<RelayResult>((resolve) => {
      const timer = setTimeout(
        () => resolve(result(false, "返事が無い")),
        TIMEOUT_MS,
      );
      opened.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        let data: unknown;
        try {
          data = JSON.parse(message.data);
        } catch {
          return;
        }
        if (!Array.isArray(data) || data[0] !== "OK" || data[1] !== event.id) {
          return;
        }
        clearTimeout(timer);
        resolve(result(data[2] === true, String(data[3] ?? "")));
      });
      opened.addEventListener("close", () => {
        clearTimeout(timer);
        resolve(result(false, "返事の前に切れた"));
      });
      opened.send(JSON.stringify(["EVENT", event]));
    });
  } catch (error) {
    return result(false, String(error));
  } finally {
    try {
      socket?.close();
    } catch {
      // 既に閉じている。
    }
  }
};

/** 署名済みのイベントを受け取り、指定のリレーへ流して、リレーごとの結果を返す。 */
export default {
  async fetch(request, env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const authorization = request.headers.get("authorization") ?? "";
    if (!env.TOKEN || !safeEqual(authorization, `Bearer ${env.TOKEN}`)) {
      return new Response("forbidden", { status: 403 });
    }
    let body: RelayRequest;
    try {
      body = parseRelayRequest(await request.json());
    } catch (error) {
      return new Response(String(error), { status: 400 });
    }
    const results = await Promise.all(
      body.relays.map((relay) => publish(relay, body.event)),
    );
    return Response.json({ results });
  },
} satisfies ExportedHandler<Env>;
