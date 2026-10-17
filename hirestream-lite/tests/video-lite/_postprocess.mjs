// After recording: for each role
//   1) mux the per-chapter narration onto the screen recording → MP4 film
//   2) write English subtitles (.srt, also embedded as a soft track)
//   3) cut one clip per chapter into clips/
//   node tests/video-lite/_postprocess.mjs [role]
// Narration never overlaps: the recorder padded every chapter to >= its voice-over.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FF = process.env.FFMPEG_PATH || (await import("ffmpeg-static")).default;
const VIDEO_DIR = "test-results/video-lite";
const BUILD_DIR = process.env.VIDEO_BUILD_DIR || "/tmp/vbuild-lite";
const WAV_DIR = path.join(BUILD_DIR, "narration");
const TIMING_DIR = path.join(BUILD_DIR, "timing");
const OUT_DIR = process.env.VIDEO_OUT_DIR || "A.PMD/User Guides and Videos - Lite/Videos";
const CLIPS_DIR = path.join(OUT_DIR, "clips");
const LEAD_MS = 2900; // voice starts as the chapter card fades (card = 2.4 s + fade)

const ALL = [
  { role: "applicant", out: "1-Applicant-Walkthrough", match: /applicant/i, prefix: "Applicant" },
  { role: "agency", out: "2-HPSEDC-Super-Agency-Walkthrough", match: /agency/i, prefix: "Agency" },
  { role: "admin", out: "3-Admin-Walkthrough", match: /admin/i, prefix: "Admin" },
];
const roleArg = process.argv[2];
const ROLES = roleArg ? ALL.filter((r) => r.role === roleArg) : ALL;
const narration = JSON.parse(fs.readFileSync("tests/video-lite/narration.json", "utf8"));
const durations = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, "durations.json"), "utf8"));

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
const ts = (ms) => {
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = Math.floor(ms % 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};
/** Spread a chapter's sentences across its voice-over, proportional to length. */
function cues(text, startMs, durMs) {
  const sents = text.replace(/H P S E D C/g, "HPSEDC").replace(/E C R/g, "ECR").replace(/E C N R/g, "ECNR")
    .replace(/C S V/g, "CSV").replace(/P D F/g, "PDF").replace(/J P G/g, "JPG").replace(/P N G/g, "PNG")
    .replace(/M E A/g, "MEA").replace(/I T I/g, "ITI")
    .match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()) || [text];
  const total = sents.reduce((a, s) => a + s.length, 0);
  let t = startMs;
  return sents.map((s) => { const d = durMs * s.length / total; const c = { from: t, to: t + d - 60, s }; t += d; return c; });
}

/**
 * Where the chapter cards ACTUALLY are in the video. On a starved host the
 * screencast timeline drifts from wall-clock (measured: +0.9 s at chapter 1,
 * +33 s by chapter 11), so wall-clock offsets put the voice over the wrong
 * screen. The cards are full-screen dark frames: find them with blackdetect,
 * then match each chapter to the nearest dark run after the previous one,
 * predicted from the wall-clock gap (stray dark dialog backdrops are skipped).
 */
function cardStarts(video, chapters) {
  const r = spawnSync(FF, ["-nostdin", "-i", video, "-vf", "scale=160:90,blackdetect=d=0.5:pic_th=0.80:pix_th=0.35", "-an", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 27 });
  const out = r.stderr || "";
  const dets = [...out.matchAll(/black_start:([\d.]+)/g)].map((m) => +m[1] * 1000);
  const res = [];
  let prevDet = 0, prevWall = 0;
  chapters.forEach((ch, k) => {
    const pred = k === 0 ? ch.offsetMs : prevDet + (ch.offsetMs - prevWall) * 1.06;
    const cands = dets.filter((d) => d > prevDet + 4000 && Math.abs(d - pred) < Math.max(15000, (ch.offsetMs - prevWall) * 0.25));
    const best = cands.sort((a, b) => Math.abs(a - pred) - Math.abs(b - pred))[0];
    const at = best ?? pred;
    if (!best) console.log(`  ! ${ch.key}: no card found near ${(pred / 1000).toFixed(1)}s — using prediction`);
    res.push(Math.round(at));
    prevDet = at; prevWall = ch.offsetMs;
  });
  return res;
}

fs.mkdirSync(CLIPS_DIR, { recursive: true });
for (const { role, out, match, prefix } of ROLES) {
  const timingFile = path.join(TIMING_DIR, `timing-${role}.json`);
  const video = findVideo(match);
  if (!fs.existsSync(timingFile) || !video) { console.log(`skip ${role} (timing or video missing)`); continue; }
  const { chapters } = JSON.parse(fs.readFileSync(timingFile, "utf8"));
  const dur = vdur(video);
  console.log(`[${role}] ${dur?.toFixed(1)}s, ${chapters.length} chapters`);
  const starts = cardStarts(video, chapters);
  chapters.forEach((ch, k) => {
    console.log(`  ${ch.key}: wall ${(ch.offsetMs / 1000).toFixed(1)}s → video ${(starts[k] / 1000).toFixed(1)}s`);
    // card fade-in (~0.3 s) is before the frame reads as dark
    ch.offsetMs = Math.max(0, starts[k] - 300);
  });
  chapters.forEach((ch, k) => {
    const end = k + 1 < chapters.length ? chapters[k + 1].offsetMs : (dur || 0) * 1000;
    const need = LEAD_MS + (durations[`${role}-${ch.key}`] || 0);
    if (end - ch.offsetMs < need) console.log(`  ! ${ch.key}: voice-over ${(need / 1000).toFixed(1)}s > segment ${((end - ch.offsetMs) / 1000).toFixed(1)}s (overlap)`);
  });

  // subtitles
  const NARR = narration[role];
  let srt = "", n = 1;
  chapters.forEach((ch, k) => {
    const start = ch.offsetMs + LEAD_MS, d = durations[`${role}-${ch.key}`] || 0;
    for (const c of cues(NARR[k].text, start, d)) srt += `${n++}\n${ts(c.from)} --> ${ts(c.to)}\n${c.s}\n\n`;
  });
  const srtPath = path.join(OUT_DIR, `${out}.en.srt`);
  fs.writeFileSync(srtPath, srt);

  // narration mux + soft subtitle track
  const clips = chapters.map((ch) => ({ wav: path.join(WAV_DIR, `${role}-${ch.key}.wav`), offsetMs: ch.offsetMs + LEAD_MS }))
    .filter((c) => fs.existsSync(c.wav));
  const inputs = ["-i", video];
  clips.forEach((c) => inputs.push("-i", c.wav));
  inputs.push("-i", srtPath);
  const parts = clips.map((c, k) => `[${k + 1}]adelay=${c.offsetMs}:all=1[a${k}]`);
  const labels = clips.map((_, k) => `[a${k}]`).join("");
  const mix = `${parts.join(";")};${labels}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[aout]`;
  const film = path.join(OUT_DIR, `${out}.mp4`);
  execFileSync(FF, ["-y", ...inputs, "-filter_complex", mix, "-map", "0:v", "-map", "[aout]", "-map", `${clips.length + 1}:s`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-threads", "2",
    "-c:a", "aac", "-b:a", "128k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
    "-movflags", "+faststart", ...(dur ? ["-t", String(dur)] : []), film], { stdio: ["ignore", "ignore", "pipe"] });
  console.log(`  film → ${film}`);

  // per-chapter clips (cut from the finished film; no subtitle track)
  for (let k = 0; k < chapters.length; k++) {
    const ch = chapters[k];
    const start = (ch.offsetMs / 1000).toFixed(3);
    const end = k + 1 < chapters.length ? (chapters[k + 1].offsetMs / 1000).toFixed(3) : (dur ? String(dur) : null);
    const clipOut = path.join(CLIPS_DIR, `${prefix}-${String(ch.n).padStart(2, "0")}-${ch.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.mp4`);
    execFileSync(FF, ["-y", "-ss", start, ...(end ? ["-to", end] : []), "-i", film, "-map", "0:v", "-map", "0:a",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-threads", "2", "-c:a", "aac", "-movflags", "+faststart", clipOut],
      { stdio: ["ignore", "ignore", "pipe"] });
    console.log(`  clip → ${path.basename(clipOut)}`);
  }
}
console.log("Done.");
