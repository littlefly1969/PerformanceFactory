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

function runUpdate(args = [], stubEnv = {}) {
  const temp = mkdtempSync(join(tmpdir(), "pf-update-"));
  const envFile = join(temp, ".env.production");
  const log = join(temp, "calls.jsonl");
  writeFileSync(
    envFile,
    "COMPOSE_PROJECT_NAME=script-test\nIMAGE_TAG=local\nAPI_IMAGE=performancefactory-api:local\nSESSION_SECRET=keep-me\n",
    { mode: 0o600 },
  );
  writeFileSync(
    join(temp, "docker"),
    `#!/usr/bin/env node
const args = process.argv.slice(2);
require('fs').appendFileSync(process.env.DOCKER_TEST_LOG, JSON.stringify(args) + '\\n');
const has = (word) => args.includes(word);
if (has('pull') && process.env.STUB_PULL_FAILS) process.exit(1);
if (has('inspect')) console.log('abcdef1234567890');
else if (has('config') && has('--services')) console.log(process.env.STUB_EXTERNAL_DB ? 'migrate\\napi\\nweb' : 'postgres\\nmigrate\\napi\\nweb');
else if (has('exec')) process.stdout.write('DUMP');
else if (has('ls') && has('--format')) console.log('sha-abcdef1\\nsha-old0001\\nmain');
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    "sh",
    ["infra/scripts/update-prod.sh", "--env-file", envFile, ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        ...stubEnv,
        PATH: `${temp}:${process.env.PATH}`,
        DOCKER_TEST_LOG: log,
        IMAGE_PREFIX: "ghcr.io/owner/pf",
      },
      encoding: "utf8",
    },
  );
  const calls = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return { temp, envFile, result, calls };
}

const deployUp = (calls) =>
  calls.find(
    (args) => args.includes("up") && args.includes("--remove-orphans"),
  );

test("update pulls published images, backs up, pins the commit tag and keeps volumes", () => {
  const { temp, envFile, result, calls } = runUpdate();
  try {
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const env = readFileSync(envFile, "utf8");
    assert.match(env, /^IMAGE_TAG=sha-abcdef1$/m);
    assert.match(env, /^API_IMAGE=ghcr\.io\/owner\/pf-api:sha-abcdef1$/m);
    assert.match(env, /^WEB_IMAGE=ghcr\.io\/owner\/pf-web:sha-abcdef1$/m);
    assert.match(env, /^SESSION_SECRET=keep-me$/m);
    assert.equal(statSync(envFile).mode & 0o777, 0o600);
    assert.equal(statSync(`${envFile}.bak`).mode & 0o777, 0o600);
    assert.match(
      readFileSync(join(temp, ".deploy-history"), "utf8"),
      / sha-abcdef1\n$/,
    );
    assert.ok(
      calls.some((args) => args.join(" ") === "pull ghcr.io/owner/pf-api:main"),
    );
    const dump = calls.findIndex(
      (args) => args.includes("exec") && args.join(" ").includes("pg_dump"),
    );
    assert.ok(dump > 0);
    assert.ok(dump < calls.indexOf(deployUp(calls)));
    assert.ok(deployUp(calls).includes("--no-build"));
    assert.ok(deployUp(calls).includes("--wait"));
    assert.ok(!calls.some((args) => args.includes("build")));
    assert.ok(
      calls.some(
        (args) => args.join(" ") === "rmi ghcr.io/owner/pf-api:sha-old0001",
      ),
    );
    assert.ok(
      !calls.some(
        (args) => args.join(" ") === "rmi ghcr.io/owner/pf-api:sha-abcdef1",
      ),
    );
    assert.ok(
      !calls.some(
        (args) => args.includes("prune") || args.includes("--volumes"),
      ),
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("update rolls back to a commit tag kept on the server without pulling", () => {
  const { temp, envFile, result, calls } = runUpdate(["sha-abcdef1"], {
    STUB_PULL_FAILS: "1",
  });
  try {
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.ok(!calls.some((args) => args[0] === "pull"));
    assert.match(readFileSync(envFile, "utf8"), /^IMAGE_TAG=sha-abcdef1$/m);
    assert.ok(deployUp(calls));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("update stops before migrations when the database cannot be backed up", () => {
  const { temp, envFile, result, calls } = runUpdate([], {
    STUB_EXTERNAL_DB: "1",
  });
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SKIP_BACKUP=1/);
    assert.equal(deployUp(calls), undefined);
    assert.match(readFileSync(envFile, "utf8"), /^IMAGE_TAG=local$/m);
    const skipped = runUpdate([], {
      STUB_EXTERNAL_DB: "1",
      SKIP_BACKUP: "1",
    });
    try {
      assert.equal(skipped.result.status, 0, skipped.result.stderr);
      assert.ok(deployUp(skipped.calls));
    } finally {
      rmSync(skipped.temp, { recursive: true, force: true });
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
