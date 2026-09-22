import { normalizeForMatch } from "./text-match";

/**
 * 文字を打つ欄の補完。カーソルの前に `@` や `:` があれば、そこから先を
 * 打っている言葉とみなして候補を出す。どの欄でも同じ判定を使い、何を出して
 * 何を入れるかは欄ごとに決める。
 */

export type CompletionKind = "user" | "emoji";

export type CompletionTrigger = {
  kind: CompletionKind;
  /**
   * 打ち始めの印。全角も並べる —— 日本語入力のまま打つと `＠` `：` になる。
   * 空の配列は、欄全体を 1 つの問い合わせとして扱う（「書いた人」の欄など）。
   */
  prefixes: readonly string[];
  /** 選んだときに印を残すか。`from:` は残し、`@` は選んだものに置き換える。 */
  keepPrefix?: boolean;
};

export const USER_TRIGGER: CompletionTrigger = {
  kind: "user",
  prefixes: ["@", "＠"],
};

export const EMOJI_TRIGGER: CompletionTrigger = {
  kind: "emoji",
  prefixes: [":", "："],
};

export type CompletionMatch = {
  kind: CompletionKind;
  /** 打たれた印（欄全体を問い合わせにする形では空）。同じ種類でも印で入れる形を変えられる。 */
  prefix: string;
  /** 印の後ろ、カーソルまでに打った言葉。 */
  query: string;
  /** 選んだものに置き換える範囲。 */
  start: number;
  end: number;
};

/** 印の直前がこれなら、言葉の途中（`a@b` のメールアドレス、`12:30` の時刻）とみなす。 */
const WORD_CHAR = /[A-Za-z0-9_]/;

/** ショートコードに使える文字（NIP-30）。全角で打っても半角に揃えて比べる。 */
const SHORTCODE = /^[A-Za-z0-9_-]+$/;

/** これより長く続いたら、補完ではなく文を書いているとみなす。 */
const MAX_QUERY = 64;

type Found = {
  trigger: CompletionTrigger;
  prefix: string;
  index: number;
};

/** カーソルの前で、いちばん近くにある印を探す。 */
const nearestPrefix = (
  before: string,
  triggers: readonly CompletionTrigger[],
): Found | undefined => {
  let found: Found | undefined;
  for (const trigger of triggers) {
    for (const prefix of trigger.prefixes) {
      const index = before.lastIndexOf(prefix);
      if (index < 0) continue;
      if (found === undefined || index > found.index) {
        found = { trigger, prefix, index };
      }
    }
  }
  return found;
};

/**
 * カーソルの位置で効いている補完を返す。何も効いていなければ `undefined`。
 * 日本語の文は言葉をスペースで区切らないので、印の直前が日本語でも効かせる
 * （`かわいい:ne`）。
 */
export const findCompletion = (
  text: string,
  caret: number,
  triggers: readonly CompletionTrigger[],
): CompletionMatch | undefined => {
  const whole = triggers.find((trigger) => trigger.prefixes.length === 0);
  if (whole) {
    return {
      kind: whole.kind,
      prefix: "",
      query: text.trim(),
      start: 0,
      end: text.length,
    };
  }

  const before = text.slice(0, caret);
  const found = nearestPrefix(before, triggers);
  if (!found) return undefined;

  const previous = before[found.index - 1];
  if (previous !== undefined && WORD_CHAR.test(previous)) return undefined;

  const queryStart = found.index + found.prefix.length;
  const query = before.slice(queryStart);
  if (/\s/.test(query) || query.length > MAX_QUERY) return undefined;
  // 絵文字は 1 文字打つまで出さない。`:` だけで毎回開くと、文を書く邪魔になる。
  if (
    found.trigger.kind === "emoji" &&
    !SHORTCODE.test(query.normalize("NFKC"))
  ) {
    return undefined;
  }

  return {
    kind: found.trigger.kind,
    prefix: found.prefix,
    query,
    start: found.trigger.keepPrefix ? queryStart : found.index,
    end: caret,
  };
};

/**
 * 選んだものを入れた後の文と、カーソルの位置。`space` のときは後ろに空白を
 * 1 つ置く（人の参照の直後に言葉が続くと、読む側で参照の終わりが分からない）。
 */
export const applyCompletion = (
  text: string,
  match: Pick<CompletionMatch, "start" | "end">,
  insert: string,
  options?: { space?: boolean },
): { text: string; caret: number } => {
  const head = text.slice(0, match.start) + insert;
  const tail = text.slice(match.end);
  if (!options?.space) return { text: head + tail, caret: head.length };
  // 既に空白が続いていれば足さず、その後ろへカーソルを送る。
  if (/^\s/.test(tail)) return { text: head + tail, caret: head.length + 1 };
  return { text: `${head} ${tail}`, caret: head.length + 1 };
};

/** 候補の一覧の状態。 */
export type CompletionState = {
  match: CompletionMatch | undefined;
  /** 選んでいる候補の位置。 */
  active: number;
  /** Esc で閉じた印の位置。その印を打ち直すまで開かない。 */
  dismissed: number | undefined;
};

export const initialCompletion = (): CompletionState => ({
  match: undefined,
  active: 0,
  dismissed: undefined,
});

export type CompletionEvent =
  /** 打った・カーソルを動かした。その位置で `findCompletion` した結果を渡す。 */
  | { type: "completion/input"; match: CompletionMatch | undefined }
  /** 候補を移る。`count` は今出ている候補の数（端で反対へ回るのに使う）。 */
  | { type: "completion/move"; delta: 1 | -1; count: number }
  | { type: "completion/dismiss" }
  | { type: "completion/chosen" };

const sameQuery = (a: CompletionMatch | undefined, b: CompletionMatch) =>
  a !== undefined &&
  a.kind === b.kind &&
  a.prefix === b.prefix &&
  a.start === b.start &&
  a.query === b.query;

export const completionTransition = (
  state: CompletionState,
  event: CompletionEvent,
): CompletionState => {
  switch (event.type) {
    case "completion/input": {
      const match = event.match;
      if (match === undefined) return initialCompletion();
      if (match.start === state.dismissed) {
        return { match: undefined, active: 0, dismissed: state.dismissed };
      }
      return {
        match,
        // 打った言葉が変わらない（カーソルが動いただけ）なら、選んでいる候補を保つ。
        active: sameQuery(state.match, match) ? state.active : 0,
        dismissed: undefined,
      };
    }
    case "completion/move": {
      if (state.match === undefined || event.count === 0) return state;
      const current = Math.min(state.active, event.count - 1);
      return {
        ...state,
        active: (current + event.delta + event.count) % event.count,
      };
    }
    case "completion/dismiss":
      return {
        match: undefined,
        active: 0,
        dismissed: state.match?.start,
      };
    case "completion/chosen":
      return initialCompletion();
  }
};

/** 人の候補。 */
export type SearchableUser = {
  pubkey: string;
  /** 引く手がかり（表示名・name など）。無いものは省いてよい。 */
  names: readonly (string | undefined)[];
  /**
   * 前から一致するときだけ当てる手がかり（npub）。英数字の羅列なので、途中で
   * 当てると 1 文字でほぼ誰にでも当たる。
   */
  ids?: readonly string[];
  /** 小さいほど先に出す（返信先の人 → フォロー中の人 など）。 */
  rank: number;
};

/**
 * 人を打った言葉で絞り、近い順に並べる。前から一致するものを途中で一致する
 * ものより先に出し、同じ近さなら `rank`、その次に渡された並びを保つ。空なら
 * `rank` の順に全部返す。同じ人は、`rank` の小さいほうだけを残す。
 */
export const rankUsers = <T extends SearchableUser>(
  users: readonly T[],
  query: string,
): T[] => {
  const needle = normalizeForMatch(query.trim());
  const best = new Map<string, { user: T; score: number; order: number }>();
  users.forEach((user, order) => {
    let score = needle === "" ? 0 : Number.POSITIVE_INFINITY;
    if (needle !== "") {
      for (const name of user.names) {
        if (name === undefined) continue;
        const index = normalizeForMatch(name).indexOf(needle);
        if (index >= 0) score = Math.min(score, index === 0 ? 0 : 1);
      }
      for (const id of user.ids ?? []) {
        if (id.toLowerCase().startsWith(needle)) score = 0;
      }
    }
    if (score === Number.POSITIVE_INFINITY) return;
    const seen = best.get(user.pubkey);
    if (seen && seen.user.rank <= user.rank) return;
    best.set(user.pubkey, { user, score, order });
  });
  return [...best.values()]
    .sort(
      (a, b) =>
        a.score - b.score || a.user.rank - b.user.rank || a.order - b.order,
    )
    .map((entry) => entry.user);
};
