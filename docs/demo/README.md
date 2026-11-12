# Demo video

`demo.html` is an animated replica of Earmark's screens. It's styled with the plugin's real `styles.css`, and every frame is a pure function of time (`seek(t)`). `render.mjs` steps through it at 30 fps in headless Chromium and pipes the frames to ffmpeg, so the video plays smoothly however slow the capture is.

The result is an **illustration**, not a screen recording. The surrounding Obsidian look (sidebar, tabs, modals) is approximated, and the budget table shows fewer columns than the plugin.

## Regenerate

You need Node, Chromium and ffmpeg. Set `CHROME_PATH` if Chromium isn't at `/usr/bin/chromium`.

```sh
cd docs/demo
npm ci
npm run stills   # a few PNG frames in out/stills/ for a quick check (seconds)
npm run render   # out/earmark-demo.mp4: 1920×1080, about 85 s (takes ~15 min)
```

`out/` is git-ignored. To update the README video, drag the new MP4 into a GitHub issue or PR comment, then replace the `user-attachments` link in the main README.

## Editing

The scenes are in the `scenes` array in `demo.html`. Each scene has:
- a duration
- a caption
- a `render(lt)` function returning its DOM at local time `lt`
- cursor keyframes `{ t, sel, click }`, meaning "be over `sel` at time `t`"

The budget numbers come from `totals()`, which mirrors `src/money.ts`. Keep them in step with the plugin when its UI or arithmetic changes.
