import { type Component, For, Show, createSignal } from "solid-js";
import {
  type MuteVisibility,
  parseMuteTarget,
} from "../../../core/moderation/mute-list";
import type { MuteTarget } from "../../../core/nostr/build/mute";
import { encodeBech32 } from "../../../core/nostr/nip19";
import Button from "../../../shared/components/UI/Button";
import { useMuteList } from "../mute-list";
import { SettingsDeleteIcon } from "./SettingsIcons";
import SettingsPage from "./SettingsPage";
import SettingsSegmentedControl from "./SettingsSegmentedControl";
import SettingsTextField from "./SettingsTextField";

const muteTypeLabel: Record<MuteTarget["type"], string> = {
  pubkey: "著者",
  thread: "スレッド",
  hashtag: "ハッシュタグ",
  word: "単語",
};

const muteTypeOptions = (["pubkey", "thread", "hashtag", "word"] as const).map(
  (type) => ({
    value: type,
    label: muteTypeLabel[type],
    testId: `mute-type-${type}`,
  }),
);

const visibilityOptions = [
  { value: "private", label: "非公開" },
  { value: "public", label: "公開" },
] as const;

const rowVisibilityOptions = [
  {
    value: "private",
    label: "非公開",
    testId: "mute-private-toggle",
  },
  { value: "public", label: "公開", testId: "mute-public-toggle" },
] as const;

const muteLabel = (target: MuteTarget): string => {
  if (target.type === "pubkey") return encodeBech32("npub", target.value);
  if (target.type === "thread") return encodeBech32("note", target.value);
  if (target.type === "hashtag") return `#${target.value}`;
  return target.value;
};

const MuteSettingsPage: Component = () => {
  const mutes = useMuteList();
  const [muteType, setMuteType] = createSignal<MuteTarget["type"]>("pubkey");
  const [muteValue, setMuteValue] = createSignal("");
  const [muteVisibility, setMuteVisibility] =
    createSignal<MuteVisibility>("private");
  const [muteInputError, setMuteInputError] = createSignal<string>();

  const editableState = () => {
    const state = mutes.state();
    return state.phase === "ready" || state.phase === "missing"
      ? state
      : undefined;
  };

  const addMute = async () => {
    const target = parseMuteTarget(muteType(), muteValue());
    if (!target) {
      setMuteInputError("入力形式を確認してください");
      return;
    }
    const duplicate = editableState()?.entries.some(
      (entry) =>
        entry.target.type === target.type &&
        entry.target.value === target.value,
    );
    if (duplicate) {
      setMuteInputError("この対象は既にミュートされています");
      return;
    }
    setMuteInputError(undefined);
    try {
      await mutes.add(target, muteVisibility());
      setMuteValue("");
    } catch {
      // 詳細は MuteList の error に集約し、入力値は再試行のため残す。
    }
  };

  return (
    <SettingsPage
      title="ミュート設定"
      description="表示しない著者、スレッド、ハッシュタグ、単語をアカウントへ保存します。"
    >
      <Show when={mutes.state().phase === "loading"}>
        <p class="c-secondary mt-5 rounded-2 bg-secondary p-3 text-body">
          ミュートリストを取得しています…
        </p>
      </Show>
      <Show when={mutes.state().phase === "error"}>
        <div class="mt-5 flex items-center justify-between gap-3 rounded-2 border border-red-6 bg-red-4/10 p-3 text-caption text-red-8">
          <p>{mutes.error()}</p>
          <Button
            variant="border"
            data-testid="mute-refresh"
            onClick={() => void mutes.refresh()}
          >
            再試行
          </Button>
        </div>
      </Show>

      <Show
        when={
          mutes.state().phase === "missing" || mutes.state().phase === "ready"
        }
      >
        <form
          class="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void addMute();
          }}
        >
          <SettingsSegmentedControl
            ariaLabel="ミュート対象の種類"
            block
            options={muteTypeOptions}
            value={[muteType()]}
            onValueChange={(value) => {
              const next = value[0] as MuteTarget["type"] | undefined;
              if (next) setMuteType(next);
            }}
          />

          <div class="flex gap-2">
            <SettingsTextField
              rootClass="min-w-0 flex-1"
              label="ミュートする値"
              data-testid="mute-value-input"
              disabled={mutes.saving()}
              error={muteInputError()}
              placeholder={
                muteType() === "pubkey"
                  ? "npub1... または hex"
                  : muteType() === "thread"
                    ? "note1... または hex"
                    : muteType() === "hashtag"
                      ? "nostr"
                      : "表示しない単語"
              }
              value={muteValue()}
              onInput={(event) => {
                setMuteValue(event.currentTarget.value);
                setMuteInputError(undefined);
              }}
            />
            <SettingsSegmentedControl
              ariaLabel="公開範囲"
              options={visibilityOptions}
              value={[muteVisibility()]}
              onValueChange={(value) => {
                const next = value[0] as MuteVisibility | undefined;
                if (next) setMuteVisibility(next);
              }}
            />
            <Button
              data-testid="mute-add"
              type="submit"
              disabled={mutes.saving() || muteValue().trim() === ""}
            >
              追加
            </Button>
          </div>
        </form>

        <Show when={editableState()?.privatePart !== "ready"}>
          <p class="mt-3 rounded-2 border border-yellow-6 bg-yellow-4/10 p-3 text-caption">
            非公開項目を読み取れません。対応署名器の権限を確認してください。公開項目は引き続き編集できます。
          </p>
        </Show>

        <div
          class="mt-5 overflow-hidden rounded-2 border border-primary"
          data-testid="mute-settings-list"
        >
          <Show
            when={(editableState()?.entries.length ?? 0) > 0}
            fallback={
              <p class="c-secondary p-4 text-center text-caption">
                ミュート項目はありません
              </p>
            }
          >
            <For each={editableState()?.entries ?? []}>
              {(entry) => (
                <div
                  class="flex min-h-13 items-center gap-3 border-primary border-b px-3 py-2 last:border-b-0"
                  data-testid="mute-settings-row"
                >
                  <span class="c-secondary w-20 shrink-0 text-caption">
                    {muteTypeLabel[entry.target.type]}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-body">
                    {muteLabel(entry.target)}
                  </span>
                  <SettingsSegmentedControl
                    ariaLabel={`${muteLabel(entry.target)} の公開範囲`}
                    compact
                    disabled={mutes.saving()}
                    options={rowVisibilityOptions}
                    value={[entry.visibility]}
                    onValueChange={(value) => {
                      const next = value[0] as MuteVisibility | undefined;
                      if (next && next !== entry.visibility) {
                        void mutes.move(entry, next).catch(() => {});
                      }
                    }}
                  />
                  <button
                    aria-label={`${muteLabel(entry.target)} を削除`}
                    class="grid h-8 w-8 appearance-none place-items-center rounded-full bg-transparent text-red-7 enabled:cursor-pointer enabled:hover:bg-red-4/15"
                    disabled={mutes.saving()}
                    type="button"
                    data-testid="mute-remove"
                    onClick={() => void mutes.remove(entry).catch(() => {})}
                  >
                    <SettingsDeleteIcon class="h-5 w-5" />
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>

        <Show when={mutes.error()}>
          {(message) => (
            <p class="mt-3 text-caption text-red-8 dark:text-red-4">
              {message()}
            </p>
          )}
        </Show>
      </Show>
    </SettingsPage>
  );
};

export default MuteSettingsPage;
