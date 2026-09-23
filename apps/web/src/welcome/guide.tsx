import type { Component } from "solid-js";

/** Nostr 日本語コミュニティのはじめかたの案内。 */
export const GUIDE = "https://welcome.nostr-jp.org";

export const GuideLink: Component<{ href: string; children: string }> = (
  props,
) => (
  <a
    href={props.href}
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-0.5 text-link "
  >
    {props.children}
    <span
      class="i-material-symbols:open-in-new-rounded size-3.5 text-link"
      aria-hidden="true"
    />
  </a>
);
