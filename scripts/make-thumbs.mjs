import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const cwd = process.cwd();
const imgDir = path.join(cwd, "assets", "img", "original");
const outDir = path.join(cwd, "assets", "img", "thumbs");

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const files = (await listFiles(imgDir)).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
  let done = 0;
  for (const f of files) {
    const input = path.join(imgDir, f);
    const base = f.replace(/\.(png|jpg|jpeg)$/i, "");
    const out = path.join(outDir, `${base}.jpg`);
    try {
      await fs.access(out);
      process.stdout.write(`[skip] ${path.relative(cwd, out)}\n`);
      continue;
    } catch {
      // continue
    }

    // Use macOS sips to generate a lightweight thumbnail
    // - resample to width 520px
    // - output JPEG quality 60
    await execFileAsync("sips", ["-Z", "520", "-s", "format", "jpeg", "-s", "formatOptions", "60", input, "--out", out]);
    done += 1;
    process.stdout.write(`[thumb] ${f} -> ${path.relative(cwd, out)}\n`);
  }
  process.stdout.write(`\nDone. generated=${done}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

