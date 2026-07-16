# C1: Training Walkthrough Videos — {Project Name}
> **Template Version:** 2.0 | **Created By:** AI Agent Pipeline
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Purpose:** Plan, script, and AUTO-GENERATE all training walkthrough videos. These videos are the PRIMARY training tool — they teach users how to use the solution faster than any document.
> **Production Method:** 100% AI-generated. Zero human dependency.

---

## 1. AI-Driven Video Generation Strategy

### Why AI-Generated?
A human would open the app, click through features, record the screen, record voiceover, edit the video. **The AI agent can do all of this — faster, consistently, and repeatedly.** Every time the UI changes, the agent re-generates the video. No scheduling humans, no re-recording, no editing delays.

### How It Works — The Pipeline

```
Step 1: SCRIPT GENERATION (AI Agent)
  │  Agent reads: A5 (PRD), A3 (Modules), B7 (Admin Ops)
  │  Agent generates: Scene-by-scene script with voiceover text
  │  Output: V{XX}_script.json (structured script)
  │
Step 2: DEMO DATA SETUP (AI Agent)
  │  Agent seeds the database with realistic demo data
  │  No "test test test" — proper names, real-looking jobs, applications
  │  Output: Demo-ready application state
  │
Step 3: BROWSER AUTOMATION + SCREEN RECORDING (AI Agent)
  │  Agent uses Playwright to control the browser
  │  Agent navigates the UI step-by-step per the script
  │  Browser session is recorded as WebP/WebM video
  │  Agent adds deliberate pauses, highlights, mouse movements
  │  Output: V{XX}_recording.webm (raw screen recording)
  │
Step 4: VOICEOVER GENERATION (AI Agent)
  │  Agent sends voiceover script to TTS API
  │  Each scene's narration is generated as audio
  │  Output: V{XX}_voice.mp3 (narrated audio track)
  │
Step 5: VIDEO ASSEMBLY (AI Agent / ffmpeg)
  │  Agent combines: screen recording + voiceover + text overlays
  │  Agent adds: intro card, chapter markers, subtitles, outro card
  │  Agent exports: final MP4 at 1080p
  │  Output: V{XX}_{Title}.mp4 (final training video)
  │
Step 6: PUBLISH (AI Agent)
  │  Agent uploads to hosting platform
  │  Agent updates B5 (Training Guide) with video links
  │  Agent updates in-app Help page with embedded videos
  │  Output: Published and linked
```

### Tool Stack

| Step | Tool | Why | License |
|------|------|-----|---------|
| **Script Generation** | AI Agent (reads PRD → writes script) | Agent has full context of features, flows, user roles | — |
| **Demo Data** | Drizzle ORM seed scripts | Agent writes seed scripts with realistic data | MIT |
| **Browser Automation** | **Playwright** | Cross-browser, headless/headed, record video built-in, control mouse/keyboard precisely | Apache-2.0 |
| **Screen Recording** | Playwright `recordVideo` API | Built into Playwright — records browser session as WebM. No external tool needed | Apache-2.0 |
| **Mouse Visualization** | Custom cursor overlay via CSS injection | Agent injects a visible cursor during recording so viewers see where clicks happen | — |
| **Text-to-Speech** | **Google Cloud TTS** / **Edge TTS** / **Piper TTS** | Generate natural-sounding narration from script text | Google: Pay-per-use / Edge: Free / Piper: MIT (local) |
| **Video Assembly** | **ffmpeg** | Combine screen recording + audio + text overlays + subtitles into final MP4. Industry standard, free | LGPL |
| **Subtitles** | **Whisper** (OpenAI) or script-based SRT generation | Generate .srt subtitle files from voiceover text. Whisper for audio-based, or direct SRT from script | MIT |
| **Text Overlays** | ffmpeg `drawtext` filter | Add step numbers, feature names, callouts directly on video | LGPL |
| **Thumbnail** | Puppeteer screenshot + image manipulation | Capture a key frame, add title text overlay for video thumbnail | Apache-2.0 |

### TTS Options (Ranked)

| Option | Quality | Cost | Local/Cloud | Best For |
|--------|:-------:|:----:|:-----------:|---------|
| **Edge TTS** (`edge-tts` npm) | ⭐⭐⭐⭐ | Free | Cloud (Microsoft) | Default — high quality, zero cost, multiple languages (English + Hindi) |
| **Piper TTS** | ⭐⭐⭐ | Free | Local | Offline/air-gapped deployments. No API dependency. |
| **Google Cloud TTS** | ⭐⭐⭐⭐⭐ | ~$4/1M chars | Cloud | Premium quality if budget allows |
| **OpenAI TTS** | ⭐⭐⭐⭐⭐ | ~$15/1M chars | Cloud | Most natural, but expensive for bulk |

> **Default recommendation: Edge TTS** — free, high quality, supports English + Hindi, no API key needed.

---

## 2. Video Standards

| Aspect | Standard |
|--------|---------|
| **Format** | MP4 (H.264 video + AAC audio) |
| **Resolution** | 1920×1080 (Full HD) |
| **Frame Rate** | 30 FPS |
| **Duration** | 3-7 minutes per video (max 10 min for complex features) |
| **Language** | {English / Hindi / Bilingual} — TTS supports both |
| **Browser** | Chromium via Playwright (consistent rendering) |
| **Viewport** | 1920×1080 (matches recording resolution) |
| **Mouse Speed** | Deliberate — 500ms pause before click, smooth movement |
| **Naming** | `{ProjectCode}_V{XX}_{Topic}.mp4` — e.g., `HS_V01_Registration.mp4` |
| **Hosting** | {YouTube (unlisted) / Internal portal / In-app Help page} |

---

## 3. Playwright Recording Script Structure

> *The AI agent generates a Playwright script per video. Structure:*

```typescript
// V{XX}_{Title}.playwright.ts
// Auto-generated by AI Agent from A5 PRD + video script

import { test } from '@playwright/test';

test('V01: Welcome & Registration Walkthrough', async ({ page, context }) => {
  // === SETUP ===
  // Start video recording (built into Playwright)
  await context.newPage(); // Playwright records via context config
  
  // Set viewport to 1080p
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  // Inject visible cursor CSS (so viewers see mouse position)
  await page.addStyleTag({ content: `
    * { cursor: url('data:image/svg+xml,...') 12 12, auto !important; }
  `});
  
  // === SCENE 1: Landing Page (0:00 - 0:15) ===
  // Voiceover: "Welcome to {Project Name}..."
  await page.goto('https://staging.domain.dev');
  await page.waitForTimeout(3000); // Pause — let viewer absorb the page
  
  // Highlight the Register button
  await highlightElement(page, 'button:has-text("Register")');
  await page.waitForTimeout(2000);
  
  // === SCENE 2: Registration Form (0:15 - 1:00) ===
  // Voiceover: "Click Register to create your account..."
  await page.click('button:has-text("Register")');
  await page.waitForTimeout(1500);
  
  // Type with realistic speed (50ms between keystrokes)
  await page.fill('#name', ''); // Clear first
  await typeSlowly(page, '#name', 'Priya Sharma', 50);
  await page.waitForTimeout(500);
  
  await typeSlowly(page, '#email', 'priya.sharma@example.com', 50);
  await page.waitForTimeout(500);
  
  await typeSlowly(page, '#phone', '+91 98765 43210', 50);
  await page.waitForTimeout(500);
  
  // ... continue scene by scene
  
  // === SCENE N: Confirmation ===
  // Voiceover: "That's it! Your account is ready..."
  await page.waitForTimeout(3000); // Final pause
});

// Helper: Highlight an element with a red border + glow
async function highlightElement(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.style.outline = '3px solid #ef4444';
      el.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.5)';
      setTimeout(() => {
        el.style.outline = '';
        el.style.boxShadow = '';
      }, 3000);
    }
  }, selector);
}

// Helper: Type slowly (visible keystroke by keystroke)
async function typeSlowly(page, selector, text, delay) {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay });
  }
}
```

### Playwright Config for Video Recording
```typescript
// playwright.config.ts — video recording settings
export default {
  use: {
    video: {
      mode: 'on',          // Always record
      size: { width: 1920, height: 1080 }
    },
    launchOptions: {
      slowMo: 100,          // Slow down all actions slightly for visibility
    },
    viewport: { width: 1920, height: 1080 },
  },
  outputDir: './C1_Training_Walkthrough_Videos/recordings/',
};
```

---

## 4. Voiceover Generation Process

### Step-by-Step

```bash
# 1. Agent generates the voiceover script as JSON
# Output: V01_script.json
{
  "video_id": "V01",
  "title": "Welcome & Registration",
  "language": "en",
  "scenes": [
    {
      "scene": 1,
      "timestamp": "0:00",
      "duration_sec": 15,
      "voiceover": "Welcome to HireStream, the overseas placement portal for Himachal Pradesh. In this video, we'll show you how to create your account and start exploring opportunities.",
      "action": "Show landing page"
    },
    {
      "scene": 2,
      "timestamp": "0:15",
      "duration_sec": 45,
      "voiceover": "Click the Register button to get started. You'll need your name, email address, phone number, and a password. Let's fill these in now.",
      "action": "Navigate to registration, fill form"
    }
  ]
}

# 2. Agent generates audio using Edge TTS
# Command (via edge-tts npm package or Python edge-tts):
edge-tts --voice "en-IN-NeerjaNeural" \
  --text "Welcome to HireStream..." \
  --write-media V01_scene1.mp3

# For Hindi:
edge-tts --voice "hi-IN-SwaraNeural" \
  --text "हायरस्ट्रीम में आपका स्वागत है..." \
  --write-media V01_scene1_hi.mp3

# 3. Agent combines all scene audio into single track
ffmpeg -i "concat:scene1.mp3|scene2.mp3|scene3.mp3" -c copy V01_voice.mp3
```

### Available Indian English & Hindi Voices (Edge TTS)
| Voice | Language | Gender | Quality |
|-------|----------|--------|:-------:|
| `en-IN-NeerjaNeural` | English (India) | Female | ⭐⭐⭐⭐⭐ |
| `en-IN-PrabhatNeural` | English (India) | Male | ⭐⭐⭐⭐ |
| `hi-IN-SwaraNeural` | Hindi | Female | ⭐⭐⭐⭐⭐ |
| `hi-IN-MadhurNeural` | Hindi | Male | ⭐⭐⭐⭐ |

---

## 5. Video Assembly (ffmpeg)

```bash
# Combine screen recording + voiceover + text overlays + subtitles

# Step 1: Merge video + audio
ffmpeg -i V01_recording.webm -i V01_voice.mp3 \
  -c:v libx264 -preset slow -crf 18 \
  -c:a aac -b:a 128k \
  -map 0:v -map 1:a \
  V01_merged.mp4

# Step 2: Add intro card (3 seconds)
ffmpeg -i intro_card.png -i V01_merged.mp4 \
  -filter_complex "[0:v]loop=loop=90:size=1[intro];[intro][1:v]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -map 1:a \
  V01_with_intro.mp4

# Step 3: Add subtitles
ffmpeg -i V01_with_intro.mp4 \
  -vf "subtitles=V01_subtitles.srt:force_style='FontSize=24,PrimaryColour=&HFFFFFF'" \
  V01_final.mp4

# Step 4: Add text overlay (step numbers, feature names)
ffmpeg -i V01_final.mp4 \
  -vf "drawtext=text='Step 1\: Register':fontsize=32:fontcolor=white:x=50:y=50:enable='between(t,15,60)'" \
  HS_V01_Registration.mp4
```

### Subtitle Generation (from script)
```python
# Agent generates SRT subtitles directly from the scene script
# No need for Whisper — we already have the exact text and timestamps

# V01_subtitles.srt
1
00:00:00,000 --> 00:00:15,000
Welcome to HireStream, the overseas placement portal
for Himachal Pradesh.

2
00:00:15,000 --> 00:01:00,000
Click the Register button to get started.
You'll need your name, email, and password.
```

---

## 6. Video Catalog

### 6.1 Getting Started Series
| # | Video ID | Title | Duration | Audience | Script | Recorded | Assembled |
|---|---------|-------|----------|----------|:------:|:--------:|:---------:|
| 1 | V01 | Welcome & Overview | ~3 min | All users | ☐ | ☐ | ☐ |
| 2 | V02 | Registration & Account Setup | ~4 min | New users | ☐ | ☐ | ☐ |
| 3 | V03 | First Login & Dashboard Tour | ~5 min | All users | ☐ | ☐ | ☐ |
| 4 | V04 | Completing Your Profile | ~4 min | {Role-specific} | ☐ | ☐ | ☐ |

### 6.2 Role-Specific Walkthroughs

#### Track A: {Role 1 — e.g., Candidate}
| # | Video ID | Title | Duration | Script | Recorded | Assembled |
|---|---------|-------|----------|:------:|:--------:|:---------:|
| 5 | V05 | Searching and Filtering Jobs | ~4 min | ☐ | ☐ | ☐ |
| 6 | V06 | Applying for a Job | ~5 min | ☐ | ☐ | ☐ |
| 7 | V07 | Tracking Application Status | ~3 min | ☐ | ☐ | ☐ |

#### Track B: {Role 2 — e.g., Agency}
| # | Video ID | Title | Duration | Script | Recorded | Assembled |
|---|---------|-------|----------|:------:|:--------:|:---------:|
| 8 | V08 | Agency Registration & Verification | ~5 min | ☐ | ☐ | ☐ |
| 9 | V09 | Posting a Job | ~5 min | ☐ | ☐ | ☐ |
| 10 | V10 | Managing Applications | ~6 min | ☐ | ☐ | ☐ |

#### Track C: {Role 3 — e.g., Administrator}
| # | Video ID | Title | Duration | Script | Recorded | Assembled |
|---|---------|-------|----------|:------:|:--------:|:---------:|
| 11 | V11 | Admin Dashboard Overview | ~5 min | ☐ | ☐ | ☐ |
| 12 | V12 | System Config & Log Monitoring | ~6 min | ☐ | ☐ | ☐ |
| 13 | V13 | Managing Users & Roles | ~4 min | ☐ | ☐ | ☐ |

---

## 7. End-to-End Generation Command

> *The AI agent runs this pipeline for each video:*

```bash
# Full pipeline for one video — all automated

# 1. Generate script from PRD
ai-agent generate-script \
  --source A5_PRD_Phase1.md \
  --video-id V01 \
  --output V01_script.json

# 2. Seed demo data
npx tsx scripts/seed-demo-data.ts

# 3. Record browser session
npx playwright test V01_walkthrough.playwright.ts \
  --project chromium \
  --headed  # headed mode for clean recording

# 4. Generate voiceover
npx tsx scripts/generate-voiceover.ts \
  --script V01_script.json \
  --voice "en-IN-NeerjaNeural" \
  --output V01_voice.mp3

# 5. Generate subtitles
npx tsx scripts/generate-subtitles.ts \
  --script V01_script.json \
  --output V01_subtitles.srt

# 6. Assemble final video
npx tsx scripts/assemble-video.ts \
  --recording recordings/V01.webm \
  --audio V01_voice.mp3 \
  --subtitles V01_subtitles.srt \
  --intro assets/intro_card.png \
  --output HS_V01_Registration.mp4

# 7. Generate thumbnail
npx tsx scripts/generate-thumbnail.ts \
  --screenshot recordings/V01_keyframe.png \
  --title "How to Register" \
  --output HS_V01_thumb.jpg
```

---

## 8. Re-Generation Policy

> *UI changed? Feature updated? No problem — re-run the pipeline.*

| Trigger | Action | Scope |
|---------|--------|-------|
| UI redesign (major) | Re-generate ALL videos | Full catalog |
| Single feature change | Re-generate affected video(s) only | 1-3 videos |
| New feature added | Generate new video, add to catalog | 1 new video |
| New language needed | Re-run TTS with different voice | Full catalog (audio only) |
| Bug fix (no UI change) | No re-generation needed | None |

---

## 9. Production Checklist (Per Video)

| # | Step | Method | Status |
|---|------|--------|:------:|
| 1 | Script JSON generated from PRD | AI Agent | ☐ |
| 2 | Demo data seeded (realistic data) | Seed script | ☐ |
| 3 | Playwright walkthrough script written | AI Agent | ☐ |
| 4 | Browser session recorded (WebM) | Playwright `recordVideo` | ☐ |
| 5 | Voiceover audio generated (MP3) | Edge TTS | ☐ |
| 6 | Subtitles generated (SRT) | Script-based generation | ☐ |
| 7 | Video assembled (MP4) with intro + subtitles | ffmpeg | ☐ |
| 8 | Thumbnail generated | Puppeteer screenshot + overlay | ☐ |
| 9 | Video reviewed by PM | Human review (quality check) | ☐ |
| 10 | Uploaded to hosting platform | AI Agent / manual | ☐ |
| 11 | Linked in B5 Training Guide + in-app Help | AI Agent | ☐ |

---

## 10. Dependencies to Install

```bash
# Add to project devDependencies
npm install -D @playwright/test

# System dependencies (on the VM)
npx playwright install chromium         # Browser for recording
sudo apt install -y ffmpeg              # Video assembly
pip install edge-tts                    # Text-to-speech (or npm edge-tts)
```

---

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial video plan (manual process) |
| 2.0 | {YYYY-MM-DD} | | Rewritten for 100% AI-driven generation |

---

> *Every video is generated by AI — from script to recording to voiceover to assembly. When the UI changes, re-run the pipeline. No human recording, no human editing, no scheduling delays. The only human step is a quality review before publishing.*
