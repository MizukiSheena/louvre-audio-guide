import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const target = {
  audio: path.join(cwd, "assets", "audio"),
  imgOriginal: path.join(cwd, "assets", "img", "original"),
  maps: path.join(cwd, "assets", "maps"),
};

function isMapFile(name) {
  return name.startsWith("0卢浮宫地图") && name.toLowerCase().endsWith(".png");
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(src, dest) {
  if (await exists(dest)) return { moved: false, reason: "exists" };
  if (dryRun) return { moved: true, reason: "dry-run" };
  await fs.rename(src, dest);
  return { moved: true, reason: "ok" };
}

async function main() {
  await fs.mkdir(target.audio, { recursive: true });
  await fs.mkdir(target.imgOriginal, { recursive: true });
  await fs.mkdir(target.maps, { recursive: true });

  const entries = await fs.readdir(cwd, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  const mp3 = files.filter((f) => f.toLowerCase().endsWith(".mp3"));
  const images = files.filter((f) => /\.(png|jpg|jpeg)$/i.test(f));

  let movedCount = 0;

  for (const f of mp3) {
    const src = path.join(cwd, f);
    const dest = path.join(target.audio, f);
    const res = await moveFile(src, dest);
    if (res.moved) movedCount += 1;
    process.stdout.write(`[audio] ${f} -> ${path.relative(cwd, dest)} (${res.reason})\n`);
  }

  for (const f of images) {
    const src = path.join(cwd, f);
    const dest = isMapFile(f) ? path.join(target.maps, f) : path.join(target.imgOriginal, f);
    const res = await moveFile(src, dest);
    if (res.moved) movedCount += 1;
    process.stdout.write(`[img]   ${f} -> ${path.relative(cwd, dest)} (${res.reason})\n`);
  }

  process.stdout.write(`\nDone. moved=${movedCount}${dryRun ? " (dry-run)" : ""}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

