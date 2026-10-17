# hirestream-lite — walkthrough films and user-guide screenshots

Produces the three role films and every screenshot used in the user guides in
`A.PMD/User Guides and Videos - Lite/`. One recording run = films + guide
images, so the guides and the videos always show the same build.

| file | what |
|---|---|
| `applicant.film.ts` | Applicant: sign-up → form pages 1–4 → confirm email → apply → interview → documents → offer → help |
| `agency.film.ts` | HPSEDC super agency (`hpsedc_agency`): post job → pipeline → interview → outcome → pre-departure → welfare → messages → reports |
| `admin.film.ts` | Admin Console (`demo_admin`): import → professions → form fields → config → people → compliance → audit → communication → reports |
| `narration.json` | voice-over per chapter (the films assert chapter order against it) |
| `gen-narration.mjs` | Piper TTS → WAVs + `durations.json` (each chapter is padded to its voice-over) |
| `_postprocess.mjs` | narration mux + `.srt` subtitles (also embedded) + per-chapter clips |
| `build-guides.mjs` | guide sources (`source/*.html`) → styled HTML + A4 PDF |
| `make-fixtures.mjs` | the SAMPLE PDFs the films upload |

## Never record against a real portal

The films create accounts, applications, interviews and uploads. Record against
a **disposable copy** of the database served by the **production build** on
another port (the dev server films a blank screen while Vite compiles):

```bash
createdb -T hirestream_lite_video_base hirestream_lite_video    # or pg_dump | psql a fresh copy
cd <scratch dir>   # uploads/ is created relative to cwd — keep it out of the repo
NODE_ENV=production PORT=5099 SESSION_SECRET=<anything> \
  DATABASE_URL=postgresql://…/hirestream_lite_video node <repo>/dist/index.js
```

Prepare the copy once (all SQL against the COPY only): reopen jobs and give them
future deadlines; shift seeded interview/offer dates into the future; set
`feature.quick_login_enabled=false`; give `champa_devi` a pending reschedule
request; have two cast candidates send a support message (via the API). Then
snapshot it (`CREATE DATABASE … TEMPLATE …`) and restore from the snapshot
before every full recording. `applicant` depends on `agency` (it accepts the
offer whose appointment letter the agency film uploads), so record them in ONE
run — Playwright wipes its output dir per run, and alphabetical order
(admin → agency → applicant) is the right order.

## Run

```bash
export PIPER_DIR=/path/to/piper            # piper/piper + en_US-lessac-medium.onnx
export FFMPEG_PATH=/path/to/ffmpeg          # or install ffmpeg-static
export VIDEO_BUILD_DIR=/tmp/vbuild-lite FONTCONFIG_FILE=…  # emoji + Devanagari fonts if the host lacks them
node tests/video-lite/gen-narration.mjs
DRY=1 npx playwright test -c tests/video-lite/playwright.config.ts agency   # rehearse: no video, no padding
npx playwright test -c tests/video-lite/playwright.config.ts film           # all three, for real
node tests/video-lite/_postprocess.mjs
cp $VIDEO_BUILD_DIR/guide-images/*.png "A.PMD/User Guides and Videos - Lite/images/"
node tests/video-lite/build-guides.mjs
```

## Learned on this host (2 vCPU / 4 GB, no swap)

- Typing into the job-poster / register forms costs ~250 ms per keystroke under
  screencast (whole-form re-render per key). `typeText()` types the first words
  on camera and fills the rest.
- Clicks that open a dialog with an autofocused date input can hang in
  "performing click action" — use `{ noWaitAfter: true }`.
- `slowMo` applies per keystroke; keep it low (40).
- Hide the "Demo Mode" button and the UAT "Enable test mode" link (done in
  `setup()`); they are not part of the production sign-in page.
