# Spectacles preview

A WebXR page that places the Spectacles wireframes (Playthrough B0–C2, Pose D–E, Lookback I–M, Finish G–H2) in your room at real size, so you can check placement, scale and readability in Spectacles.

## Open it on Spectacles

WebXR needs an HTTPS address, so host this folder once:

1. Push this repo to GitHub.
2. In the repo on GitHub: Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. After a minute, the page is at `https://<your-username>.github.io/<repo-name>/spectacles-preview/`.
4. On Spectacles, open the Browser, go to that address, and tap **View in my room**. The video window appears about 25° to your right.

Every time you push a change, refresh the page in the Specs browser.

## In the headset

- Pinch the panels: they work like the prototype. The mode button cycles Playthrough → Pose → Lookback.
- Pose: pinch the thin bar under the video to open the scrub panel; pinch the video to close it.
- Lookback: + → Yes, record → 3, 2, 1 → the section plays with REC → the take appears. Tap it for side by side.
- Every run (a section tile, Replay, From the top, Full, Run it again) starts with a 5, 6, 7, 8 count-in beside the video: the starting pose for Section 1, Full and From the top, a dimmed lead-in from the previous section otherwise.
- From the top and Full show the same segmented section bar under the video.
- Finish: when Section 4 ends there's no pop-up. Finish routine on the control bar unlocks; tap it for Routine done → Record your dance → Start recording. The card closes, a REC banner counts in and runs, and recording stops on its own when the routine ends.
- Skip ›(tweak bar) or Skip ahead (desktop) jumps past count-ins and long runs.
- Pop-ups (Record lookback?, Routine done, Record your dance) open in front of you, not on the video, and the video behind them dims. If you turn more than 30° away, they glide back in front of you. Use Pop-up nearer/farther on the tweak bar to set their distance.
- The tweak bar below-left: switch screens, light/dark theme, move closer/farther, left/right, up/down, resize, recenter.
- If you hide the tweak bar, pinch empty space to bring it back.
- Write down the distance/angle/size the bar shows when it looks right.

## Making changes

- Layout, sizes and default placement: the `SCREENS`, `BARS`, `POPUP`, `ANCHOR` and `DEFAULTS` block at the top of the script in `index.html`. Positions are pixels from the 1280×800 prototype frames.
- You can also open with settings in the URL: `?screen=E&dist=1.2&yaw=30&scale=1.8&theme=dark`.
- On a laptop, the same page shows a desktop stand-in with sliders.
