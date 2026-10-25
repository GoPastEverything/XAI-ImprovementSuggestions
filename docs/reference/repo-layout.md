# Repository layout

```
ifixedx/
├── README.md             # Quick start → docs/
├── docs/                 # Sphinx site → docs.liveandletdev.com
├── src/                  # React SPA (Vite)
│   ├── App.tsx           # Shell, routing, feed orchestration
│   ├── api/              # fetch wrappers (compare, for-you, twitterSpider, …)
│   ├── mixer/            # merge, dedupe, buildFeedPosts, topic prefs
│   ├── feedtrix/         # Pipetrix ingest, prefs, canonical mixer subscription
│   ├── spider/           # TwitterSpider client pull → Pipetrix
│   ├── live/             # LiveSessionPreviewModal
│   ├── db/               # RxDB, persist, wipe, dedupeLocalTweets
│   └── homeFeedSource.tsx
├── server/               # Express API (:3847)
│   ├── index.ts          # Route registration + scheduler boot
│   ├── xApiV2.ts         # X API v2 Recent Search, timelines
│   ├── forYouCorpus.ts   # Home corpus fallbacks
│   ├── search.ts         # platform_style vs refined rank
│   ├── xaiTrendingTweets.ts
│   ├── feedtrixLivePipe.ts / feedtrixLiveScheduler.ts
│   ├── twitterSpiderPipe.ts / twitterSpiderScheduler.ts
│   ├── tweetDedupe.ts
│   ├── xLiveSessionDetail.ts
│   └── oauth/            # PKCE, session cookie, token files
├── data/                 # Server JSON pipes + oauth-sessions (gitignored secrets)
│   ├── feedtrix-spaces-pipe.json
│   ├── feedtrix-broadcasts-pipe.json
│   ├── twitter-spider-pipe.json
│   └── oauth-sessions/
├── dist/                 # Vite production build
├── dist-server/          # tsc server build (optional)
└── .env.example          # Env template (copy to .env)
```

Related research on the dev box (outside repo): `the-algorithm-main/` for X open-ranking inspiration.

## Related

- [API routes](api-routes.md)
- [Platform map](../explanation/platform-map.md)
