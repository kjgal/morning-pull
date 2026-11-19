# Morning Pull

Morning Pull is an installable espresso coach and local coffee journal. The site is static and the app lives in `dist/`.

Open the site in a browser. In Chrome on Android, use **Add to home screen** or **Install app**. In Edge on Windows, open the menu and look under **Apps** for the install option. Installation is optional. The version is at the bottom of **Settings & backups**.

Equipment, bean bags, shots, and saved recipes stay in this browser. Use **Settings & backups** to export a backup when moving to a different browser or device. The initial journal is empty. The app includes curated café recipes.

Recipe links work for public HTTPS pages that allow cross-origin requests and contain structured recipe data. Paste recipe text when a link cannot be read. Photo label recognition and the espresso coach run in the browser.

## Development

Run `node --test checks/*.test.mjs` with Node 24. Serve `dist/` on localhost to preview. Keep the version in `dist/version.js` and the cache version in `dist/sw.js` in sync.

For GitHub Pages, select **GitHub Actions** as the publishing source. The Pages workflow tests the app and deploys `dist/` on pushes to `main`.
