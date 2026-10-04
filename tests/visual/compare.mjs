/* TEST-ONLY: compare BEFORE/AFTER screenshots with ffmpeg's SSIM (1.0 = identical).
   Writes a side-by-side diff image (before | amplified difference | after) for
   every pair below the threshold.
     node tests/visual/compare.mjs <beforeDir> <afterDir> <outDir> [threshold=0.995] */
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [before, after, out, thr = "0.995"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const dims = (p) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", p]).toString().trim();
const rows = [];
for (const f of fs.readdirSync(before).filter((x) => x.endsWith(".png")).sort()) {
  const a = path.join(before, f);
  const b = path.join(after, f);
  if (!fs.existsSync(b)) {
    rows.push({ file: f, ssim: null, note: "missing in AFTER" });
    continue;
  }
  if (dims(a) !== dims(b)) {
    rows.push({ file: f, ssim: null, note: `size differs ${dims(a)} vs ${dims(b)}` });
    continue;
  }
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", a, "-i", b, "-lavfi", "ssim", "-f", "null", "-"], { encoding: "utf8" });
  const m = /All:([0-9.]+)/.exec(r.stderr || "");
  const ssim = m ? Number(m[1]) : null;
  if (ssim !== null && ssim < Number(thr)) {
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", a, "-i", b, "-filter_complex", "[0][1]blend=all_mode=difference,eq=brightness=0.25:contrast=4[d];[0][d][1]hstack=inputs=3", path.join(out, f.replace(".png", "-diff.jpg"))]);
  }
  rows.push({ file: f, ssim });
}
fs.writeFileSync(path.join(out, "ssim.json"), JSON.stringify(rows, null, 2));
for (const r of rows) console.log(`${r.ssim === null ? "  n/a " : r.ssim.toFixed(4)}  ${r.ssim !== null && r.ssim < Number(thr) ? "DIFF" : "same"}  ${r.file}${r.note ? "  (" + r.note + ")" : ""}`);
