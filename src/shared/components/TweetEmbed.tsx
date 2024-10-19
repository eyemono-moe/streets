import { type Component, createEffect } from "solid-js";

// hostnameがx.comだとwindow.twttr.widgets.loadによって検知されないためtwitter.comに変換する
const detectableTwitterUrl = (urlString: string): string => {
  try {
    const url = new URL(urlString);
    url.hostname = "twitter.com";
    return url.href;
  } catch {
    return urlString;
  }
};

const TweetEmbed: Component<{ url: string }> = (props) => {
  let twitterRef: HTMLDivElement | undefined;

  createEffect(() => {
    window.twttr?.widgets?.load(twitterRef);
  });

  return (
    <div ref={twitterRef}>
      <blockquote
        ref={twitterRef}
        class="twitter-tweet"
        data-conversation="none"
      >
        <a
          href={detectableTwitterUrl(props.url)}
          target="_blank"
          rel="noopener noreferrer"
          class="break-anywhere whitespace-pre-wrap text-link"
        >
          {props.url}
        </a>
      </blockquote>
    </div>
  );
};

export default TweetEmbed;
