// Render every chapter's voice-over with Piper BEFORE recording, and write
// durations.json so each filmed chapter is padded to at least its narration.
//   node tests/video-lite/gen-narration.mjs [role]
// PIPER_DIR must hold piper/piper + en_US-lessac-medium.onnx (see README).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FF = process.env.FFMPEG_PATH || (await import("ffmpeg-static")).default;
const PIPER_DIR = process.env.PIPER_DIR || "/tmp/piper";
const PIPER_BIN = path.join(PIPER_DIR, "piper", "piper");
const PIPER_MODEL = path.join(PIPER_DIR, process.env.PIPER_VOICE || "en_US-lessac-medium.onnx");
const BUILD_DIR = process.env.VIDEO_BUILD_DIR || "/tmp/vbuild-lite";
const WAV_DIR = path.join(BUILD_DIR, "narration");
fs.mkdirSync(WAV_DIR, { recursive: true });

const onlyRole = process.argv[2];
const narration = JSON.parse(fs.readFileSync("tests/video-lite/narration.json", "utf8"));
const durFile = path.join(BUILD_DIR, "durations.json");
const durations = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, "utf8")) : {};

function piper(text, outWav) {
  execFileSync(PIPER_BIN, ["--model", PIPER_MODEL, "--length_scale", "1.05", "--sentence_silence", "0.35", "--output_file", outWav], {
    input: text, env: { ...process.env, LD_LIBRARY_PATH: path.join(PIPER_DIR, "piper") },
    stdio: ["pipe", "ignore", "ignore"],
  });
}
function durSec(file) {
  let out = "";
  try { execFileSync(FF, ["-i", file], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { out = e.stderr?.toString() || ""; }
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

let total = 0;
for (const [role, chapters] of Object.entries(narration)) {
  if (onlyRole && role !== onlyRole) continue;
  for (const ch of chapters) {
    const wav = path.join(WAV_DIR, `${role}-${ch.key}.wav`);
    piper(ch.text, wav);
    const ms = Math.round(durSec(wav) * 1000);
    durations[`${role}-${ch.key}`] = ms;
    total += ms;
    console.log(`${role}-${ch.key}: ${(ms / 1000).toFixed(1)}s`);
  }
}
fs.writeFileSync(durFile, JSON.stringify(durations, null, 2));
console.log(`\nnarration total ${(total / 60000).toFixed(1)} min → ${durFile}`);
