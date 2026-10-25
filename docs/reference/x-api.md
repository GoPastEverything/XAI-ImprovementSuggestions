# X API v2 (server)

Implementation: `server/xApiV2.ts`

## Recent Search

```
GET https://api.twitter.com/2/tweets/search/recent
```

Standard parameters used:

- `expansions=author_id`
- `tweet.fields=created_at,public_metrics,author_id,attachments,…`
- `user.fields=name,username,profile_image_url,verified`
- `next_token` pagination (up to configured page cap)
- **429** retry with `Retry-After`

Mapped to internal `Tweet` type with `avatarUrl` (TwIMG `_normal` → `_400x400`).

## Home / For You corpus

`server/forYouCorpus.ts` tries in order:

1. Reverse-chronological **following** timeline (user OAuth)
2. User-authored tweets
3. **List** timeline (`IFIXEDX_HOME_LIST_ID`)
4. Recent Search fallback

`homeDataSource` on the payload records which path succeeded (`following_timeline`, `list_timeline`, etc.).

## Explore

`server/corpus.ts` — Recent Search with user token, then app Bearer fallback on 401/403.
