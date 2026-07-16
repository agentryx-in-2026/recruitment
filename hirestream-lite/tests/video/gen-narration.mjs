// Generate Piper narration WAVs + a durations map BEFORE recording, so the
// recorder can pad each chapter to be at least as long as its narration
// (guaranteeing the voice clips never overlap).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FF = (await import("ffmpeg-static")).default;
const PIPER_DIR = "/tmp/piper";
const PIPER_BIN = path.join(PIPER_DIR, "piper", "piper");
const PIPER_MODEL = path.join(PIPER_DIR, "en_US-lessac-medium.onnx");
// NOTE: must live OUTSIDE Playwright's outputDir (test-results/video), which
// Playwright wipes at the start of every run.
const BUILD_DIR = "/tmp/vbuild";
const WAV_DIR = path.join(BUILD_DIR, "narration");
fs.mkdirSync(WAV_DIR, { recursive: true });

const onlyRole = process.argv[2]; // optional: "employer"
const narration = JSON.parse(fs.readFileSync("tests/video/narration.json", "utf8"));
const durations = {};

function piper(text, outWav) {
  execFileSync(PIPER_BIN, ["--model", PIPER_MODEL, "--output_file", outWav], {
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

for (const [role, chapters] of Object.entries(narration)) {
  if (onlyRole && role !== onlyRole) continue;
  for (const ch of chapters) {
    const wav = path.join(WAV_DIR, `${role}-${ch.key}.wav`);
    piper(ch.text, wav);
    const ms = Math.round(durSec(wav) * 1000);
    durations[`${role}-${ch.key}`] = ms;
    console.log(`${role}-${ch.key}: ${(ms / 1000).toFixed(1)}s`);
  }
}
fs.writeFileSync(path.join(BUILD_DIR, "durations.json"), JSON.stringify(durations, null, 2));
console.log("\nWrote /tmp/vbuild/durations.json");
