import { spawn } from "node:child_process";
import { RELAY_PORT, RELAY_URL } from "./env";

const canConnect = () =>
  new Promise<boolean>((resolve) => {
    const socket = new WebSocket(RELAY_URL);
    socket.addEventListener("open", () => {
      socket.close();
      resolve(true);
    });
    socket.addEventListener("error", () => resolve(false));
  });

/**
 * メモリの上だけのリレーを立てる。テストごとに新しい鍵を使うので、走らせている間は
 * 空に戻さない。nak の HTTP は 404 を返すので、webServer の待ち方では待てない。
 */
export default async function globalSetup() {
  if (await canConnect()) return;
  const relay = spawn("nak", ["serve", "--port", String(RELAY_PORT)], {
    stdio: "ignore",
  });
  relay.on("error", (error) => {
    throw new Error(`nak を起動できません: ${error.message}`);
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await canConnect()) return () => relay.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  relay.kill();
  throw new Error(`${RELAY_URL} が立ち上がりませんでした`);
}
