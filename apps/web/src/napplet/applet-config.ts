import type { ConfigSchema } from "@streets/core/napplet/config";
import type { AppletAddress } from "@streets/core/napplet/library";
import { createSignal } from "solid-js";

/**
 * アップレットの設定（NAP-CONFIG）。この端末に置く。動いているアップレットが登録した
 * スキーマも覚え、アップレットを開いていなくてもカラムの設定に描けるようにする。
 *
 * > Persisted values MUST be keyed on the napplet's verified manifest and artifact scope
 *
 * 本体（artifactHash）が変わったら、前の値は使わない（NAP-CONFIG では、本体ごとに
 * 新しく始めてよい）。
 */
type Saved = {
  artifactHash: string;
  schema: ConfigSchema;
  values: Record<string, unknown>;
};

const KEY = "streets.napplet.config.v1";
const keyOf = (applet: AppletAddress) =>
  `${KEY}:${applet.pubkey}:${applet.identifier}`;

const read = (applet: AppletAddress): Saved | undefined => {
  try {
    const raw = localStorage.getItem(keyOf(applet));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Saved)
      : undefined;
  } catch {
    return undefined;
  }
};

const write = (applet: AppletAddress, saved: Saved) => {
  try {
    localStorage.setItem(keyOf(applet), JSON.stringify(saved));
  } catch {
    // 覚えられなくても、いまの画面には当てる。
  }
};

// 書き換えるたびに数を進め、読む側（設定の画面・動いているアップレット）に知らせる。
const [version, setVersion] = createSignal(0);
const memory = new Map<string, Saved>();

const current = (applet: AppletAddress): Saved | undefined => {
  version();
  const key = keyOf(applet);
  if (!memory.has(key)) {
    const saved = read(applet);
    if (saved) memory.set(key, saved);
  }
  return memory.get(key);
};

const put = (applet: AppletAddress, saved: Saved) => {
  memory.set(keyOf(applet), saved);
  write(applet, saved);
  setVersion((count) => count + 1);
};

export const appletConfig = {
  /** 登録されたスキーマと、ユーザーが入れた値。読むたびに変わりを追う。 */
  read: current,
  register: (
    applet: AppletAddress,
    artifactHash: string,
    schema: ConfigSchema,
  ) => {
    const saved = current(applet);
    put(applet, {
      artifactHash,
      schema,
      values: saved?.artifactHash === artifactHash ? saved.values : {},
    });
  },
  /** ユーザーが値を変えた。`undefined` は消す（既定に戻す）。 */
  set: (applet: AppletAddress, key: string, value: unknown) => {
    const saved = current(applet);
    if (!saved) return;
    const { [key]: _, ...rest } = saved.values;
    put(applet, {
      ...saved,
      values: value === undefined ? rest : { ...rest, [key]: value },
    });
  },
};
