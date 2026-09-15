import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const maxLines = 650;
const violations = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      const lines = source.trimEnd().split("\n").length;
      if (lines > maxLines)
        violations.push(`${relative(root, path)}: ${lines} lines`);
    }
  }
}

await inspect(resolve(root, "apps/api/src"));
await inspect(resolve(root, "apps/web/app"));
if (violations.length) {
  console.error(
    `Source files must stay within ${maxLines} lines. Split by responsibility:\n${violations.sort().join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Source size OK: API, web and CSS files are within ${maxLines} lines.`,
  );
}
