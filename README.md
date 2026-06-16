# Pedal Planner — put it on your phone

You only need two files: **`index.html`** and **`app.js`**. They're a complete, self-contained web app (no build step, no server). Your settings save in the browser on whatever device you open it on.

## Get it online (GitHub Pages)

1. Go to **github.com** → **New repository**. Name it `pedal-planner`, set it **Public**, and create it.
2. On the repo page click **Add file → Upload files**. Drag in **`index.html`** and **`app.js`** (both at the top level, not inside a folder). Commit.
3. Open **Settings → Pages** (left sidebar).
4. Under **Build and deployment**, set **Source = Deploy from a branch**, **Branch = `main`**, **Folder = `/ (root)`**, then **Save**.
5. Wait ~1 minute, refresh the Pages settings page, and copy the live URL it shows — it'll look like `https://YOURNAME.github.io/pedal-planner/`.

## Put it on your home screen (iPhone / Safari)

1. Open that URL in **Safari** on your phone.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. It now launches full-screen from your home screen like a real app.

(Android/Chrome: same idea — menu → **Add to Home screen**.)

## Notes

- Data is stored **per device, in that browser**. The phone and your laptop keep separate copies; clearing Safari data wipes it.
- To update later, just re-upload a new `app.js` (and `index.html` if it changed) over the old ones; reload the page on your phone.
- Reference **photos** are stored in the browser too — if you add a lot of large ones you may hit the browser's storage limit. Keep it reasonable for now.
