import { type Component, Match, Switch } from "solid-js";
import { parseNip05 } from "../../../shared/libs/nip05";
import { useProfile } from "../../../shared/libs/query";
import { useQueryNip05 } from "../query";

const Nip05Badge: Component<{
  pubkey?: string;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const parsedNip05 = () => {
    const n = profile().data?.parsed.nip05;
    if (n) return parseNip05(n);
  };

  const nip05Pubkey = useQueryNip05(parsedNip05);

  return (
    <div class="flex items-center gap-1">
      <Switch
        fallback={
          <div class="i-material-symbols:report-rounded c-red aspect-square h-0.75lh w-auto" />
        }
      >
        <Match when={!profile().data?.parsed.nip05}>
          <div class="i-material-symbols:question-mark-rounded c-secondary aspect-square h-0.75lh w-auto" />
        </Match>
        <Match when={nip05Pubkey.isLoading}>
          <div class="flex items-center justify-center">
            <div class="b-2 b-r-accent-5 aspect-square h-0.75lh w-auto animate-spin rounded-full" />
          </div>
        </Match>
        <Match when={nip05Pubkey.data === props.pubkey}>
          <div class="i-material-symbols:verified-rounded c-blue aspect-square h-0.75lh w-auto" />
        </Match>
      </Switch>
      <div class="c-secondary text-caption">{parsedNip05()?.domain}</div>
    </div>
  );
};

export default Nip05Badge;
