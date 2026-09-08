import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] === "full" ? "full" : "dir";

// Prefer prebuilt icons; generate if missing.
if (!existsSync(join(root, "build", "icon.icns")) && !existsSync(join(root, "build", "icon.png"))) {
  const icons = spawnSync(process.execPath, [join(root, "scripts", "make-icon.mjs")], { cwd: root, stdio: "inherit" });
  if (icons.status) process.exit(icons.status ?? 1);
}

const ebJs = join(root, "node_modules", "electron-builder", "cli.js");
const ebBin = join(root, "node_modules", ".bin", "electron-builder");
const cmd = existsSync(ebJs) ? process.execPath : ebBin;
const args = existsSync(ebJs) ? [ebJs] : [];
if (mode === "dir") args.push("--dir");
args.push("--" + "mac");
// No Developer ID on typical dev Mac: disable discovery so pack still works.
const out = process.env.BLOB_OUT
  || (process.platform === "darwin"
    ? join(homedir(), "Library/Caches/GrokBlob/out")
    : join(root, "dist-out"));
mkdirSync(out, { recursive: true });
args.push("--config.directories.output=" + out);
console.log("blob: pack output -> " + out);

const env = { ...process.env };
env["CSC_IDENTITY_AUTO_DISCOVERY"] = "false";
const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env });
process.exit(result.status ?? 1);
