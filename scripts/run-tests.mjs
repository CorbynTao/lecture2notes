import ts from "typescript";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
// Compile a small isolated test graph with the project's own TypeScript compiler.
// This avoids a shell runner/IPC dependency and works on portable Windows hosts.
const output = resolve("work/test-build");
const sources = [...(await readdir("lib/lecture")).filter(n => n.endsWith(".ts")).map(n => `lib/lecture/${n}`), "tests/domain.test.ts"];
for (const name of sources) {
  const source = await readFile(name, "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, esModuleInterop: true } });
  const code = result.outputText.replace(/(from\s+["']|import\(["'])(\.\.?\/[^"']+)(["'])/g, (_, prefix, path, quote) => `${prefix}${/\.[a-z]+$/i.test(path) ? path : path + ".js"}${quote}`);
  const path = resolve(output, name.replace(/\.ts$/, ".js")); await mkdir(dirname(path), { recursive: true }); await writeFile(path, code);
}
const result = spawnSync(process.execPath, ["--test", resolve(output, "tests/domain.test.js")], { stdio: "inherit" });
process.exit(result.status ?? 1);
