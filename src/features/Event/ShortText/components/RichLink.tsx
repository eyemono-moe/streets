import { type Component, Match, Show, Switch } from "solid-js";
import { useQueryEmbed } from "../query";

const RichLink: Component<{
  href: string;
  content: string;
}> = (props) => {
  const embed = useQueryEmbed(() => props.href);

  const hostname = (url?: string) => {
    try {
      return new URL(url ?? props.href).hostname;
    } catch {
      return props.href;
    }
  };

  return (
    <>
      <Switch
        fallback={
          <a
            href={props.href}
            target="_blank"
            rel="noopener noreferrer"
            class="c-blue-5 visited:c-violet-7 break-anywhere whitespace-pre-wrap underline"
          >
            {props.content}
          </a>
        }
      >
        <Match when={embed.data?.type === "oEmbed" && embed.data}>
          {(embed) => <div innerHTML={embed().value.html} />}
        </Match>
        <Match when={embed.data?.type === "ogp" && embed.data}>
          {(embed) => (
            <a
              href={embed().value.url ?? props.href}
              target="_blank"
              rel="noopener noreferrer"
              class="b-1 block flex w-full flex-col overflow-hidden rounded bg-white hover:bg-zinc-50"
            >
              <Show when={embed().value.image}>
                <img
                  src={embed().value.image}
                  alt={embed().value.title}
                  class="h-full max-h-48 w-full object-cover"
                />
              </Show>
              <div class="grid gap-1 p-2">
                <div class="line-clamp-2 text-ellipsis font-500">
                  {embed().value.title}
                </div>
                <div class="c-zinc-6 line-clamp-3 text-ellipsis text-3.5">
                  {embed().value.description}
                </div>
                <div class="c-zinc-6 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1 text-3.5">
                  <div class="i-material-symbols:link-rounded aspect-square h-3.5 w-auto" />
                  <span class="w-full truncate">
                    {hostname(embed().value.url)}
                  </span>
                </div>
              </div>
            </a>
          )}
        </Match>
      </Switch>
    </>
  );
};

export default RichLink;
