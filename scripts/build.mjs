import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

mkdirSync(join(dist, "main"), { recursive: true });
mkdirSync(join(dist, "renderer"), { recursive: true });
mkdirSync(join(dist, "assets"), { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
};

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/main/index.ts")],
  outfile: join(dist, "main/index.js"),
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron", "@adam91holt/grokbot-sdk"],
});

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/main/preload.ts")],
  outfile: join(dist, "preload.js"),
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
});

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/renderer/renderer.ts")],
  outfile: join(dist, "renderer/renderer.js"),
  platform: "browser",
  target: "es2022",
  format: "iife",
});

cpSync(join(root, "src/renderer/index.html"), join(dist, "renderer/index.html"));
cpSync(join(root, "src/renderer/styles.css"), join(dist, "renderer/styles.css"));
cpSync(join(root, "assets"), join(dist, "assets"), { recursive: true });

console.log("blob: dist ready");
