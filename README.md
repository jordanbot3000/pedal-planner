# Pedal Planner — phone install / update

Self-contained web app. No build step, no server. Settings save in the browser on each device.

## Files to upload

Put **all of these at the top level** of the repo (not inside a folder):

- `index.html`
- `app.js`
- `manifest.json`
- `apple-touch-icon.png`
- `icon-152.png`, `icon-167.png`, `icon-180.png`, `icon-192.png`, `icon-512.png`

## First-time setup (GitHub Pages)

1. **github.com -> New repository.** Name `pedal-planner`, **Public**, create.
2. **Add file -> Upload files.** Drag in all the files above. Commit.
3. **Settings -> Pages.** Source = *Deploy from a branch*, Branch = `main`, Folder = `/ (root)`. Save.
4. Wait ~1 min, refresh -- copy the URL (`https://YOURNAME.github.io/pedal-planner/`).

## Put it on your home screen (iPhone / Safari)

1. Open the URL in **Safari**.
2. **Share -> Add to Home Screen -> Add.** It launches full-screen with the knob icon.

(Android/Chrome: menu -> **Add to Home screen**.)

## Updating later

Re-upload the changed files over the old ones (usually just `app.js`; also `index.html` / icons if those changed). On your phone, open the app and pull to refresh, or close and reopen it. If an old version seems stuck, open the URL fresh in Safari, or remove and re-add the home-screen shortcut.

## Notes

- Data is per-device, per-browser. Phone and laptop keep separate copies; clearing Safari data wipes it.
- Reference photos live in the browser too -- a lot of large photos can hit the browser's storage limit.
