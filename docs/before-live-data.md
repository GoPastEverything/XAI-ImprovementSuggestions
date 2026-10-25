# Read this before connecting live data

**The timeline shipped here is a saved snapshot. It is not live X data, a live account connection, or a working replacement for X's production feed.**

You do not need an X developer account, API credentials, or a paid AI service to try the demo. Start the app and explore Home and TROTT first.

## If you are new to development

Use your coding assistant (`@bot`), or your own coding skills, to understand and adapt the data path **before** you enable an API integration. Adding a key is not a substitute for checking where the data goes.

Ask your assistant:

> Help me trace this project's saved timeline from `sample-data/x-snapshot.json` through `server/xSnapshot.ts` and `server/search.ts` into Home and TROTT. Explain the post format, local storage, author attribution, and the difference between original X counts and local replies. Keep the demo offline while we review it. Then propose and test an adapter for my authorized live data source. Keep credentials on the server and out of Git and frontend code.

## The current data path

1. `sample-data/x-snapshot.json` contains the bundled example posts. Images are in `public/demo-snapshot/`.
2. `server/xSnapshot.ts` loads your own `data/x-snapshot.json` if one exists, otherwise it uses the bundled example.
3. `server/search.ts` feeds these posts into the existing local ranking experiment for Home. This does not reproduce X's live production ranking.
4. `server/trott.ts` exposes the saved posts and stores separate local discussions. Clicking **Branch into TROTT** carries source attribution into a new discussion.
5. Imported X engagement numbers stay labeled as snapshot counts. They are not TROTT votes or imported reply bodies.

## Before you turn anything live

- Review the existing optional X integration code and adapt its input/output mapping for your use case. Confirm which source is selected and keep a visible **saved versus live** indicator.
- Use a data source you are authorized to access. Handle API permissions, rate limits, errors, and operating costs explicitly.
- Keep credentials in a local `.env` file on the server. Do not copy browser cookies, raw session exports, or credentials into sample data or client code.
- Keep background schedulers disabled until you deliberately configure and test them.
- Test with a small batch, check author/source attribution, and verify that stored data and fallback behavior are what you expect.
- Run `npm run typecheck`, `npm test`, `npm run build`, and `npm audit` before sharing changes.

If you want a publicly hosted multiuser app, authentication, durable shared storage, moderation, and a deployment security review are separate work. Do not expose the local development server as-is.
