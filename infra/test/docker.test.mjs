import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const production = "infra/docker-compose.prod.example.yml";
const example = "infra/.env.docker.example";

function composeConfig(file, extraEnv = {}, envFile = example) {
  const env = { ...process.env };
  for (const line of readFileSync(resolve(root, envFile), "utf8").split("\n")) {
    const key = /^([A-Z_]+)=/.exec(line)?.[1];
    if (key) delete env[key];
  }
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        envFile,
        "-f",
        file,
        "config",
        "--format",
        "json",
      ],
      {
        cwd: root,
        env: { ...env, ...extraEnv },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
}

test("local deployment uses Docker for web, API, Redis and persistent PostgreSQL", () => {
  const config = composeConfig(production);
  const { api, web, redis, postgres, migrate } = config.services;
  assert.equal(new URL(api.environment.DATABASE_URL).hostname, "postgres");
  assert.equal(migrate.environment.DATABASE_URL, api.environment.DATABASE_URL);
  assert.deepEqual(migrate.command, ["prisma", "migrate", "deploy"]);
  assert.equal(
    api.depends_on.migrate.condition,
    "service_completed_successfully",
  );
  assert.equal(migrate.depends_on.postgres.condition, "service_healthy");
  assert.equal(api.depends_on.redis.condition, "service_healthy");
  assert.equal(web.depends_on.api.condition, "service_healthy");
  assert.equal(api.build.dockerfile, "apps/api/Dockerfile");
  assert.equal(web.build.dockerfile, "apps/web/Dockerfile");
  assert.equal(api.image, migrate.image);
  assert.ok(
    postgres.volumes.some(
      (v) => v.type === "volume" && v.target === "/var/lib/postgresql/data",
    ),
  );
  assert.equal(postgres.ports, undefined);
  assert.equal(redis.ports, undefined);
  assert.equal(config.networks.backend.internal, true);
  assert.equal(api.ports[0].host_ip, "127.0.0.1");
  assert.equal(web.ports[0].host_ip, "127.0.0.1");
});

test("remote database remains supported without starting local PostgreSQL", () => {
  const url =
    "postgresql://user:password@remote.example.test/db?sslmode=require";
  const config = composeConfig(production, {
    COMPOSE_PROFILES: "",
    DATABASE_URL: url,
  });
  assert.equal(config.services.postgres, undefined);
  assert.equal(config.services.api.environment.DATABASE_URL, url);
  assert.equal(config.services.migrate.environment.DATABASE_URL, url);
  assert.equal(
    config.services.migrate.depends_on?.postgres?.required ?? false,
    false,
  );
  assert.ok("public" in config.services.migrate.networks);
});

test("integration test containers use a separate ephemeral database without host ports", () => {
  const config = composeConfig("infra/docker-compose.test.yml", {
    COMPOSE_PROJECT_NAME: "performancefactory-test",
  });
  assert.equal(config.name, "performancefactory-test");
  assert.equal(config.services.postgres.ports, undefined);
  assert.deepEqual(config.services.postgres.tmpfs, [
    "/var/lib/postgresql/data",
  ]);
  assert.equal(config.services["api-tests"].build.target, "test");
  const url = new URL(
    config.services["api-tests"].environment.TEST_DATABASE_URL,
  );
  assert.equal(url.hostname, "postgres");
  assert.equal(url.pathname, "/performancefactory_test");
  assert.equal(config.networks.test.internal, true);
});

test("environment initialization generates secrets once and preserves an existing file", () => {
  const temp = mkdtempSync(join(tmpdir(), "pf-env-"));
  try {
    const file = join(temp, "environment with spaces");
    execFileSync("sh", ["infra/scripts/init-docker-env.sh", file], {
      cwd: root,
      stdio: "pipe",
    });
    const contents = readFileSync(file, "utf8");
    const secrets = [
      "POSTGRES_PASSWORD",
      "SESSION_SECRET",
      "ACCESS_TOKEN_SECRET",
    ].map((key) => {
      const value = contents.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1];
      assert.match(value, /^[a-f0-9]{64}$/);
      return value;
    });
    assert.equal(new Set(secrets).size, 3);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    execFileSync("sh", ["infra/scripts/init-docker-env.sh", file], {
      cwd: root,
      stdio: "pipe",
    });
    assert.equal(readFileSync(file, "utf8"), contents);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("deploy preserves paths with spaces and waits for healthy services", () => {
  const temp = mkdtempSync(join(tmpdir(), "pf-deploy-"));
  try {
    const envFile = join(temp, "env file");
    const log = join(temp, "calls.jsonl");
    writeFileSync(envFile, "COMPOSE_PROJECT_NAME=script-test\n");
    writeFileSync(
      join(temp, "docker"),
      `#!/usr/bin/env node\nrequire('fs').appendFileSync(process.env.DOCKER_TEST_LOG, JSON.stringify(process.argv.slice(2))+'\\n');\n`,
      { mode: 0o755 },
    );
    const result = spawnSync(
      "sh",
      ["infra/scripts/deploy-prod.sh", "--env-file", envFile],
      {
        cwd: root,
        env: {
          ...process.env,
          DEPLOY_MODE: "build",
          PATH: `${temp}:${process.env.PATH}`,
          DOCKER_TEST_LOG: log,
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const up = calls.find((args) => args.includes("up"));
    assert.ok(up.includes(envFile));
    assert.ok(up.includes("--wait"));
    assert.ok(up.includes("--wait-timeout"));
    assert.ok(
      !calls.some(
        (args) => args.includes("prune") || args.includes("--volumes"),
      ),
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
