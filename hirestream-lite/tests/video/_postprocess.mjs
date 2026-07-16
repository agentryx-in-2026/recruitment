// 1) Mux per-chapter Piper narration onto the full recording → role FILM.
// 2) Split the film into per-stage CLIPS at the recorded chapter offsets.
// Narration never overlaps because the recorder padded each chapter to >= its
// narration length.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FF = (await import("ffmpeg-static")).default;
const VIDEO_DIR = "test-results/video";
const WAV_DIR = "/tmp/vbuild/narration";
const OUT_DIR = "/home/subhash.thakur.india/Projects/Recruitment/PMD-Final wrapup/User Guides and Videos";
const CLIPS_DIR = path.join(OUT_DIR, "clips");
const LEAD_MS = 250;

const ALL_ROLES = [
  { role: "employer",  out: "1-Employer-Workflow.mp4",  match: /employer/i,  prefix: "Employer" },
  { role: "agent",     out: "2-Agent-Workflow.mp4",     match: /agent/i,     prefix: "Agent" },
  { role: "candidate", out: "3-Candidate-Workflow.mp4", match: /candidate/i, prefix: "Candidate" },
];
// Optional CLI arg restricts to one role (e.g. `node _postprocess.mjs agent`).
const roleArg = process.argv[2];
const ROLES = roleArg ? ALL_ROLES.filter((r) => r.role === roleArg) : ALL_ROLES;

function vdur(file) {
  let out = "";
  try { execFileSync(FF, ["-i", file], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { out = e.stderr?.toString() || ""; }
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}
function findVideo(match) {
  const d = fs.readdirSync(VIDEO_DIR).filter((x) => match.test(x) && fs.existsSync(path.join(VIDEO_DIR, x, "video.webm")));
  return d.length ? path.join(VIDEO_DIR, d[0], "video.webm") : null;
}

fs.mkdirSync(CLIPS_DIR, { recursive: true });

for (const { role, out, match, prefix } of ROLES) {
  const timing = path.join(VIDEO_DIR, `timing-${role}.json`);
  const video = findVideo(match);
  if (!fs.existsSync(timing) || !video) { console.log(`skip ${role}`); continue; }
  const ctx = JSON.parse(fs.readFileSync(timing, "utf8"));
  const dur = vdur(video);
  console.log(`[${role}] dur=${dur}s, ${ctx.chapters.length} chapters`);

  // 1) Mux narration onto full film
  const clips = ctx.chapters.map((ch) => ({ wav: path.join(WAV_DIR, `${role}-${ch.key}.wav`), offsetMs: Math.max(0, ch.offsetMs + LEAD_MS), ...ch }))
    .filter((c) => fs.existsSync(c.wav));
  const inputs = ["-i", video];
  clips.forEach((c) => inputs.push("-i", c.wav));
  const parts = clips.map((c, k) => `[${k + 1}]adelay=${c.offsetMs}:all=1[a${k}]`);
  const labels = clips.map((_, k) => `[a${k}]`).join("");
  const mix = clips.length === 1 ? `${parts[0]};[a0]anull[aout]`
    : `${parts.join(";")};${labels}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[aout]`;
  const film = path.join(OUT_DIR, out);
  execFileSync(FF, ["-y", ...inputs, "-filter_complex", mix, "-map", "0:v", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", ...(dur ? ["-t", String(dur)] : []), film],
    { stdio: ["ignore", "ignore", "ignore"] });
  console.log(`  film → ${out}`);

  // 2) Split film into per-stage clips at chapter offsets
  for (let k = 0; k < ctx.chapters.length; k++) {
    const ch = ctx.chapters[k];
    const start = (ch.offsetMs / 1000).toFixed(3);
    const end = k + 1 < ctx.chapters.length ? (ctx.chapters[k + 1].offsetMs / 1000).toFixed(3) : (dur ? String(dur) : null);
    const safeKey = ch.key.replace(/[^a-z0-9]+/gi, "-");
    const clipOut = path.join(CLIPS_DIR, `${prefix}-${ch.n}-${safeKey}.mp4`);
    const args = ["-y", "-i", film, "-ss", start, ...(end ? ["-to", end] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", clipOut];
    execFileSync(FF, args, { stdio: ["ignore", "ignore", "ignore"] });
    console.log(`  clip → ${path.basename(clipOut)} [${start}s–${end}s]`);
  }
}
console.log("Done.");
