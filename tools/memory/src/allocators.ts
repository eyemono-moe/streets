import type { CDPSession } from "@playwright/test";

/** アロケータの名前（`v8`・`cc/image_memory` など）ごとのバイト数。 */
export type Allocators = Record<string, number>;

type DumpEvent = {
  ph: string;
  pid: number;
  name?: string;
  args?: {
    name?: string;
    dumps?: {
      allocators?: Record<string, { attrs?: { size?: { value: string } } }>;
    };
  };
};

/** 出す深さ。`cc/image_memory` のように 1 段下までにし、細かすぎる内訳は捨てる。 */
const MAX_DEPTH = 2;
const MIN_BYTES = 1024 * 1024;
/**
 * `cc/image_memory` などが置き場として使う共有メモリの、区画ごとの内訳。同じ
 * メモリを数え直しているだけで、名前も実行ごとに変わるので出さない。
 */
const SAME_MEMORY = /^(shared_memory|discardable)\//;

/**
 * Chrome の memory-infra でメモリを 1 回ダンプし、renderer のアロケータごとの
 * 大きさを返す。PSS だけでは、V8・Blink・デコード済みの画像・タイルのどれが
 * 取っているかが分からない。
 */
export const rendererAllocators = async (
  browserSession: CDPSession,
): Promise<Allocators> => {
  const complete = new Promise<string>((resolve) =>
    browserSession.once("Tracing.tracingComplete", (event) =>
      resolve(event.stream ?? ""),
    ),
  );
  await browserSession.send("Tracing.start", {
    traceConfig: {
      includedCategories: ["disabled-by-default-memory-infra"],
    },
    transferMode: "ReturnAsStream",
  });
  await browserSession.send("Tracing.requestMemoryDump", {
    levelOfDetail: "detailed",
  });
  await browserSession.send("Tracing.end");
  const stream = await complete;

  let text = "";
  for (;;) {
    const chunk = await browserSession.send("IO.read", { handle: stream });
    text += chunk.base64Encoded
      ? Buffer.from(chunk.data, "base64").toString("utf8")
      : chunk.data;
    if (chunk.eof) break;
  }
  await browserSession.send("IO.close", { handle: stream });

  const parsed = JSON.parse(text) as DumpEvent[] | { traceEvents: DumpEvent[] };
  const events = Array.isArray(parsed) ? parsed : parsed.traceEvents;
  const renderers = new Set(
    events
      .filter(
        (event) =>
          event.ph === "M" &&
          event.name === "process_name" &&
          event.args?.name === "Renderer",
      )
      .map((event) => event.pid),
  );

  // ダンプのイベントの id は頼んだ番号と一致しないので、プロセスごとに最後の 1 回を使う。
  const latest = new Map<number, Allocators>();
  for (const event of events) {
    const allocators = event.args?.dumps?.allocators;
    if (event.ph !== "v" || !allocators || !renderers.has(event.pid)) continue;
    const sizes: Allocators = {};
    for (const [name, dump] of Object.entries(allocators)) {
      if (name.split("/").length > MAX_DEPTH || SAME_MEMORY.test(name)) {
        continue;
      }
      const bytes = Number.parseInt(dump.attrs?.size?.value ?? "0", 16);
      if (bytes >= MIN_BYTES) sizes[name] = bytes;
    }
    latest.set(event.pid, sizes);
  }
  const totals: Allocators = {};
  for (const sizes of latest.values()) {
    for (const [name, bytes] of Object.entries(sizes)) {
      totals[name] = (totals[name] ?? 0) + bytes;
    }
  }
  return totals;
};
