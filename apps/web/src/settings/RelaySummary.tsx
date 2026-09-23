import { Collapsible } from "@ark-ui/solid/collapsible";
import type { RelayStatus } from "@streets/core/read/connection-pool";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, type JSX, Show, createSignal } from "solid-js";
import Avatar from "../note/Avatar";
import UserLink from "../note/UserLink";
import { useRelayInfo } from "./relay-info-cache";

const STATUS: Record<RelayStatus, { label: string; dot: string }> = {
  "in-use": { label: "つながっています", dot: "bg-status-ok" },
  failing: { label: "つながりにくくなっています", dot: "bg-status-warn" },
  idle: { label: "今は使っていません", dot: "bg-status-off" },
};

const RelayIcon: Component<{
  info: RelayInfo | undefined;
  status?: RelayStatus;
}> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <span class="relative size-8 shrink-0">
      <Show
        when={props.info?.icon && !broken() ? props.info.icon : undefined}
        fallback={
          <span class="c-secondary grid size-full place-items-center rounded-2 bg-secondary">
            <span
              class="i-material-symbols:language size-4.5"
              aria-hidden="true"
            />
          </span>
        }
      >
        {(icon) => (
          <img
            src={icon()}
            alt=""
            class="size-full rounded-2 bg-secondary object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        )}
      </Show>
      <Show when={props.status}>
        {(status) => (
          <span
            class={`-bottom-0.5 -right-0.5 absolute size-2.5 rounded-full border-2 border-white dark:border-ui-950 ${STATUS[status()].dot}`}
            aria-hidden="true"
          />
        )}
      </Show>
    </span>
  );
};

const RelayDetails: Component<{ info: RelayInfo | undefined }> = (props) => (
  <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 pb-3 pl-14 text-caption">
    <Show when={props.info?.description}>
      {(description) => (
        <>
          <dt class="c-secondary">説明</dt>
          <dd class="c-primary break-anywhere line-clamp-4 whitespace-pre-wrap">
            {description()}
          </dd>
        </>
      )}
    </Show>
    <Show when={props.info?.pubkey}>
      {(pubkey) => (
        <>
          <dt class="c-secondary">管理者</dt>
          <dd class="c-primary flex min-w-0 items-center gap-1.5">
            <Avatar pubkey={pubkey()} size="tiny" />
            <UserLink pubkey={pubkey()} class="c-primary min-w-0 truncate" />
          </dd>
        </>
      )}
    </Show>
    <Show when={props.info?.contact}>
      {(contact) => (
        <>
          <dt class="c-secondary">連絡先</dt>
          <dd class="c-primary break-all">
            <Show
              when={/^(mailto:|https:\/\/)/.test(contact()) && contact()}
              fallback={contact()}
            >
              {(href) => (
                <a
                  class="text-link"
                  href={href()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {href().replace(/^mailto:/, "")}
                </a>
              )}
            </Show>
          </dd>
        </>
      )}
    </Show>
  </dl>
);

const RelaySummary: Component<{
  url: RelayUrl;
  info?: RelayInfo;
  loadInfo?: boolean;
  status?: RelayStatus;
  subtitle?: JSX.Element;
  actions?: JSX.Element;
}> = (props) => {
  const query = useRelayInfo(
    () => props.url,
    () => props.loadInfo ?? props.info === undefined,
  );
  const info = () => props.info ?? query.data;
  const label = () => relayLabel(props.url);
  const name = () => info()?.name ?? label().replace(/^wss?:\/\//, "");
  const hasDetails = () =>
    info()?.description !== undefined ||
    info()?.pubkey !== undefined ||
    info()?.contact !== undefined;

  return (
    <Collapsible.Root lazyMount unmountOnExit disabled={!hasDetails()}>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <Collapsible.Trigger class="group flex min-w-48 flex-1 items-start gap-3 bg-transparent p-0 text-left enabled:cursor-pointer">
          <RelayIcon info={info()} status={props.status} />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="c-primary flex min-w-0 items-center gap-1 text-body">
              <span class="truncate font-600">{name()}</span>
              <Show when={hasDetails()}>
                <span
                  class="i-material-symbols:expand-more-rounded c-secondary size-4.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                  aria-hidden="true"
                />
              </Show>
            </span>
            <span class="c-primary break-all text-caption">{label()}</span>
            {props.subtitle}
            <Show when={props.status}>
              {(status) => (
                <span class="c-secondary text-caption">
                  {STATUS[status()].label}
                </span>
              )}
            </Show>
          </div>
        </Collapsible.Trigger>
        {props.actions}
      </div>
      <Collapsible.Content class="motion-collapse">
        <RelayDetails info={info()} />
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

export default RelaySummary;
