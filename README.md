# Receipt: split bills with friends

Plain HTML, CSS and JavaScript. Firebase Firestore for sync. Hosted on GitHub Pages. No paid plan needed.

## Set up (about 10 minutes)
1. **Firebase console** > Add project > register a Web app (</>) > copy the config into `js/firebase.js`.
2. **Authentication** > Sign-in method > turn on **Anonymous**. Settings > Authorized domains > add `YOURNAME.github.io`.
3. **Firestore Database** > Create database (pick `asia-southeast1`) > Rules tab > paste `firestore.rules` > Publish.
4. **GitHub**: put every file in this folder in a repo (so `index.html` is at the top), then Settings > Pages > Deploy from branch > `main` / `(root)`.
5. Open the Pages link on your phone, then Add to Home Screen.

Firebase Storage is not used. Open the app once online so it can work offline later.

## Updating
Change `V` in `sw.js` (for example `receipt-v3`) every time you redeploy, so phones refresh their cached copy.
