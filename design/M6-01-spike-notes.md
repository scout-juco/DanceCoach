# M6-01 spike notes (issue 55)

Status: desk work done; on-device checks still open (marked TODO).

## Done
- **QR + URL at server start.** `npm run server` prints the phone URL and a terminal QR (`server/phoneUrl.ts`, tested).
  `PUBLIC_URL=https://...` overrides the LAN address; plain LAN prints an "http only" warning.

## HTTPS to the laptop (recommendation, unverified on device)
Tools already on this laptop: cloudflared, Tailscale (Funnel on), ngrok. No mkcert.
- **Recommended: Tailscale Funnel or a cloudflared quick tunnel.** Real public CA certificate, so iOS, Android and the
  Specs trust it with no per-device setup. Run `cloudflared tunnel --url http://localhost:8787`, then
  `PUBLIC_URL=<printed url> npm run server`.
- **Self-signed / mkcert:** every phone and the Specs need the root cert installed each time. Not recommended.
- **Caveat:** a tunnel makes the unauthenticated ingest server public. Pairing (M6-02) must land before this is used
  outside a test, or put Cloudflare Access / Tailscale ACLs in front. I did not open a tunnel in this session.
- 2026-11-24: Julianne opened a cloudflared quick tunnel (`*.trycloudflare.com`) and reported it works. Confirmed on iPhone, Android and the Specs.
- **Steps:** `cloudflared tunnel --url http://localhost:8787`; copy the printed `https://*.trycloudflare.com` URL; `PUBLIC_URL=<url> npm run server`; scan the QR. The URL changes each cloudflared restart. No per-device setup. Public until pairing (M6-02) lands.
- **Chosen:** cloudflared quick tunnel. Open: a stable URL (named tunnel or Tailscale Funnel) so the Lens doesn't need re-pointing each session.

## Phone web app checks (all TODO on device)
Install to home screen (manifest, standalone); front camera + MediaRecorder standalone; wake lock; Sora/Inter;
safe-area insets; Web Share of an mp4 to TikTok; Android share target for TikTok links.
Known: iOS has no share target for web apps (spec open item 5). Standalone iOS camera is the one most likely to fail.

## Dancer detection (run: spike/detect.py, YOLO11m person class, one frame at 5 points per clip)
Clips: group_katseye, groupdiff_dayoung, solo_user, P1Harmony Full, crop_demo1, crop_demo2 (annotated frames in `spike/detect/`).
- Every visible dancer got a box in the frames I looked at: KATSEYE 6 of 6 (one ghost duplicate at conf 0.38-0.55),
  P1Harmony 5 of 5 including one partly hidden dancer (0.81). Box counts per frame: 5-9 on group clips, up to 13-14 in crop_demo2 (audience).
- False positives: audience heads at the bottom of concert footage (conf 0.46-0.49), and duplicates on overlapping dancers.
  A filter of conf >= 0.5, box height >= 25% of the frame and NMS at IoU 0.5 would remove all I saw. Not yet tuned or measured on all frames.
- Only 3 annotated frames were reviewed by eye; counts for the rest are unchecked.
- **Decision (updated): skip server detection for M6.** It isn't fully functional yet (unmeasured filter, torch dependency), so P3 uses the dancer-drags-a-box fallback. The notes below are for a later milestone.
- Later option: server proposes rects (one `FocusRect` per box after the filter), dancer taps one. Fall back to the
  existing drag-a-box when the filter leaves 0, or more than 8, candidates. One candidate -> skip the pick step.
- Cost: Python + ultralytics + torch on the server for one frame per dance (the spike venv, `spike/.venv`, already has them).
  Runs at ingest time, not per frame. ONNX export via onnxruntime would drop torch if install weight matters (not tried).
- solo_user's first frame had 8 boxes and 0 kept: the filter above needs checking on title cards / intros; pick the frame
  by sampling several and taking the one with the most kept boxes.
