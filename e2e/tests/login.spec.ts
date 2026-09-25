import { test } from "../src/fixtures";

test("ログインできる", async ({ openApp, signIn }) => {
  await openApp();
  await signIn();
});
