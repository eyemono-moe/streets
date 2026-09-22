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
    class="text-link"
  >
    {props.children}
  </a>
);
