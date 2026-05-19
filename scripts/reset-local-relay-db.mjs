import { spawnSync } from "node:child_process";

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (options.allowFailure) {
      return result;
    }
    process.exit(result.status ?? 1);
  }
  return result;
};

const volumeName = () => {
  const result = run("docker", ["compose", "config", "--format", "json"], {
    capture: true,
  });
  const config = JSON.parse(result.stdout);
  return config.services?.postgres?.volumes?.find(
    (volume) => volume.target === "/var/lib/postgresql/data",
  )?.source;
};

const postgresVolume = volumeName();
if (!postgresVolume) {
  throw new Error(
    "Could not resolve the postgres volume from docker compose config",
  );
}

console.log("[streets reset] stopping local relay and postgres");
run("docker", ["compose", "stop", "nostr-rs-relay", "postgres"]);

console.log(`[streets reset] removing postgres volume: ${postgresVolume}`);
run("docker", ["compose", "rm", "-f", "-s", "-v", "postgres"]);
run("docker", ["volume", "rm", postgresVolume], { allowFailure: true });

console.log("[streets reset] starting local relay and postgres");
run("docker", ["compose", "up", "-d", "postgres", "nostr-rs-relay"]);

console.log("[streets reset] local relay database reset complete");
