/** 投稿・返信の書きかけ。 */
export type ComposeState = {
  content: string;
  /** 送っている間は、本文を変えさせず、もう一度送らせない。 */
  sending: boolean;
};

export type ComposeEvent =
  | { type: "compose/input"; content: string }
  | { type: "compose/submit" }
  /** 送れた。本文を空にする。 */
  | { type: "compose/sent" }
  /** 送れなかった。本文は残して、そのまま送り直せるようにする。 */
  | { type: "compose/failed" };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyCompose = (): ComposeState => ({
  content: "",
  sending: false,
});

/** 送れる本文。前後の空白だけのときや、送っている途中は送らない。 */
export const sendableText = (state: ComposeState): string | undefined => {
  if (state.sending) return undefined;
  const text = state.content.trim();
  return text.length > 0 ? text : undefined;
};

export const composeTransition = (
  state: ComposeState,
  event: ComposeEvent,
): ComposeState => {
  switch (event.type) {
    case "compose/input":
      return state.sending ? state : { ...state, content: event.content };
    case "compose/submit":
      return sendableText(state) === undefined
        ? state
        : { ...state, sending: true };
    case "compose/sent":
      return state.sending ? emptyCompose() : state;
    case "compose/failed":
      return state.sending ? { ...state, sending: false } : state;
  }
};
