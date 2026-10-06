import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const reqs = [];
page.on("websocket", (ws) => {
  ws.on("framesent", (f) => {
    try {
      const m = JSON.parse(f.payload);
      if (m[0] === "REQ")
        reqs.push({ url: ws.url(), sub: m[1], filters: m.slice(2) });
    } catch {}
  });
  ws.on("framereceived", (f) => {
    try {
      const m = JSON.parse(f.payload);
      if (m[0] === "CLOSED" || m[0] === "NOTICE")
        reqs.push({ url: ws.url(), msg: m });
    } catch {}
  });
});
await page.goto("http://localhost:5199/");
await page.waitForTimeout(20000);
const bad = reqs.filter((r) =>
  r.filters?.some(
    (f) =>
      (f.authors ?? []).some((a) => !/^[0-9a-f]{64}$/.test(a)) ||
      Object.entries(f).some(
        ([k, v]) =>
          k.startsWith("#") &&
          ["#p", "#e"].includes(k) &&
          v.some((x) => !/^[0-9a-f]{64}$/.test(x)),
      ),
  ),
);
console.log(JSON.stringify(bad, null, 1).slice(0, 3000));
console.log(
  JSON.stringify(
    reqs.filter((r) => r.msg),
    null,
    0,
  ),
);
console.log(
  JSON.stringify(
    reqs.filter((r) => r.filters?.some((f) => f.kinds?.includes(3))),
    null,
    0,
  ).slice(0, 2000),
);
await browser.close();
