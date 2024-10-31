import * as v from "valibot";

const ogpScheme = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  image: v.optional(v.string()),
  site_name: v.optional(v.string()),
});

export const fetchOgp = async (url: string, proxy = true) => {
  const res = await fetch(
    proxy ? `https://corsproxy.io/?${encodeURIComponent(url)}` : url,
  );
  const contentType = res.headers.get("Content-Type");
  if (
    !res.ok ||
    res.status < 200 ||
    300 <= res.status ||
    !contentType ||
    !contentType.includes("text/html")
  ) {
    return;
  }

  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const metaTags = Array.from(doc.head.querySelectorAll("meta"));

  // check if charset is utf-8
  if (
    !/charset=utf-8/i.test(contentType) &&
    !metaTags.some((meta) =>
      meta.getAttribute("charset")?.toLowerCase().includes("utf-8"),
    )
  ) {
    return;
  }

  const ogp = Object.fromEntries(
    metaTags
      .filter(
        (meta) =>
          meta.getAttribute("property")?.startsWith("og:") ||
          meta.getAttribute("name")?.startsWith("og:"),
      )
      .map(
        (meta) =>
          [
            meta.getAttribute("property")?.replace(/^og:/, "") ??
              meta.getAttribute("name")?.replace(/^og:/, "") ??
              "",
            meta.getAttribute("content") ?? "",
          ] as const,
      ),
  );

  const parseRes = v.safeParse(ogpScheme, ogp);
  if (parseRes.success) {
    return parseRes.output;
  }
};
