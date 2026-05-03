import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const audioDir = path.join(cwd, "assets", "audio");
const imgDir = path.join(cwd, "assets", "img", "original");
const thumbDir = path.join(cwd, "assets", "img", "thumbs");
const mapsDir = path.join(cwd, "assets", "maps");
const outItems = path.join(cwd, "data", "items.json");
const outMaps = path.join(cwd, "data", "maps.json");

const WINGS = ["Denon", "Sully", "Richelieu"];

function parseBaseName(base) {
  // Capture from the right so names can include '-'
  const re = new RegExp(`^(.*)-(${WINGS.join("|")})(-?\\d+)(?:-(\\d+))?$`, "i");
  const m = re.exec(base);
  if (!m) return null;
  const title = m[1];
  const wing = WINGS.find((w) => w.toLowerCase() === m[2].toLowerCase()) ?? m[2];
  const floor = Number(m[3]);
  const room = m[4] ? String(Number(m[4])) : "";
  return { title, wing, floor: Number.isFinite(floor) ? floor : null, room };
}

function stripTrailingDigits(text) {
  return text.replace(/\d+$/u, "");
}

function scoreNameMatch(a, b) {
  if (a === b) return 100;
  if (a.startsWith(b) || b.startsWith(a)) return 80;
  const aa = stripTrailingDigits(a);
  const bb = stripTrailingDigits(b);
  if (aa === bb) return 70;
  if (aa && (aa.startsWith(bb) || bb.startsWith(aa))) return 60;
  return 0;
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function main() {
  await fs.mkdir(path.dirname(outItems), { recursive: true });

  const [audioFiles, imgFiles, thumbFiles, mapFiles] = await Promise.all([
    listFiles(audioDir),
    listFiles(imgDir),
    fs
      .access(thumbDir)
      .then(() => listFiles(thumbDir))
      .catch(() => []),
    listFiles(mapsDir),
  ]);

  const imagesParsed = imgFiles
    .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
    .map((file) => {
      const base = file.replace(/\.(png|jpg|jpeg)$/i, "");
      const meta = parseBaseName(base);
      return { file, base, meta };
    })
    .filter((x) => x.meta);

  const thumbsByBase = new Map();
  for (const file of thumbFiles) {
    const base = file.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    thumbsByBase.set(base, file);
  }

  const items = [];
  for (const file of audioFiles.filter((f) => f.toLowerCase().endsWith(".mp3"))) {
    const base = file.replace(/\.mp3$/i, "");
    const meta = parseBaseName(base);
    if (!meta) continue;

    const candidates = imagesParsed.filter((x) => {
      if (!x.meta) return false;
      return x.meta.wing === meta.wing && String(x.meta.floor) === String(meta.floor) && x.meta.room === meta.room;
    });

    let best = null;
    let bestScore = -1;
    for (const cand of candidates) {
      const s = scoreNameMatch(cand.meta.title, meta.title);
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }

    const id = `${meta.title}-${meta.wing}${meta.floor}${meta.room ? `-${meta.room}` : ""}`;
    const imgPath = best ? `./assets/img/original/${encodeURIComponent(best.file)}` : "";
    const thumbFile = best ? thumbsByBase.get(best.base) : null;
    const thumbPath = thumbFile ? `./assets/img/thumbs/${encodeURIComponent(thumbFile)}` : "";

    const transcriptPath = `./assets/transcript/${encodeURIComponent(base)}.txt`;

    items.push({
      id,
      title: meta.title,
      wing: meta.wing,
      floor: meta.floor,
      room: meta.room || "",
      audio: `./assets/audio/${encodeURIComponent(file)}`,
      audioFile: file,
      image: imgPath,
      imageFile: best?.file || "",
      thumb: thumbPath,
      transcript: transcriptPath,
    });
  }

  items.sort((a, b) => {
    if (a.wing !== b.wing) return a.wing.localeCompare(b.wing);
    if ((a.floor ?? 0) !== (b.floor ?? 0)) return (a.floor ?? 0) - (b.floor ?? 0);
    if ((Number(a.room) || 0) !== (Number(b.room) || 0)) return (Number(a.room) || 0) - (Number(b.room) || 0);
    return a.title.localeCompare(b.title, "zh-Hans-CN-u-co-pinyin");
  });

  const maps = mapFiles
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .map((file) => {
      const base = file.replace(/\.png$/i, "");
      const label = base.replace(/^0卢浮宫地图-?/u, "") || base;
      return { label, src: `./assets/maps/${encodeURIComponent(file)}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  await fs.writeFile(outItems, JSON.stringify(items, null, 2), "utf8");
  await fs.writeFile(outMaps, JSON.stringify(maps, null, 2), "utf8");

  process.stdout.write(`Wrote ${path.relative(cwd, outItems)} (${items.length} items)\n`);
  process.stdout.write(`Wrote ${path.relative(cwd, outMaps)} (${maps.length} maps)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

