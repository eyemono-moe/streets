import type { EmojiSpec } from "@streets/core/emoji-maker/spec";

/** 作る口（workers/app の POST /api/emoji）が断った・答えなかった理由。 */
export class EmojiCreateFailedError extends Error {
  constructor(
    readonly reason: "missing-chars" | "denied" | "rate-limited" | "server",
    readonly chars: readonly string[] = [],
  ) {
    super(reason);
  }
}

type Answer =
  | { url: string }
  | { error: "spec" | "denied" | "rate-limited" }
  | { error: "missing-chars"; chars: string[] };

const post = async (spec: EmojiSpec): Promise<string> => {
  let res: Response;
  try {
    res = await fetch("/api/emoji", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
  } catch {
    throw new EmojiCreateFailedError("server");
  }
  const answer = (await res.json().catch(() => undefined)) as
    | Answer
    | undefined;
  if (answer && "url" in answer) return answer.url;
  if (answer?.error === "missing-chars") {
    throw new EmojiCreateFailedError("missing-chars", answer.chars);
  }
  if (answer?.error === "denied" || answer?.error === "rate-limited") {
    throw new EmojiCreateFailedError(answer.error);
  }
  // CPU の上限で止められたときなどは、JSON でない答えが返る。
  throw new EmojiCreateFailedError("server");
};

/**
 * 作る口に描かせて、置いた URL を受け取る。描けたことを確かめてから送るので、ほかの人の画面で
 * 画像が出ないリアクションを送らずに済む。サーバーが答えなかったときは一度だけ頼み直す
 * （冷えた Worker の初回は CPU の上限を超えることがある）。
 */
export const requestEmoji = async (spec: EmojiSpec): Promise<string> => {
  try {
    return await post(spec);
  } catch (cause) {
    if (
      !(cause instanceof EmojiCreateFailedError) ||
      cause.reason !== "server"
    ) {
      throw cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    return post(spec);
  }
};
