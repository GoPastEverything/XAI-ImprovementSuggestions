import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { fetchCompare } from "./api/compare";
import { fetchForYou } from "./api/forYou";
import { fetchLiveSessions } from "./api/liveSessions";
import { apiOrigin, apiUrlAbsolute } from "./api/base";
import { TwimgImg, TwimgVideo } from "./TwimgMedia";
import type { TweetResult, ComparePayload, MeResponse } from "./api/types";
import { AvatarWithFallbacks } from "./AvatarWithFallbacks";
import { persistComparePayload } from "./db/persistFeed";
import {
  clearAllSeenItems,
  liveSessionSeenKeyFromRow,
  loadSeenLiveKeys,
  loadSeenPostIds,
  markLiveSessionSeen,
  markPostSeen,
  syncCanonicalSeenFlagsFromSeenPostIds
} from "./db/seenItems";
import { GROK_LIVE_SNAPSHOT_KEY } from "./db/clearClientCaches";
import { loadPersistedMixerCorpus } from "./db/loadPersistedMixerCorpus";
import { wipeAllLocalRxDatabases } from "./db/wipeLocalDatabases";
import { purgeSyntheticPostsFromLocalDb } from "./db/purgeSyntheticPosts";
import { applyAfterWipeUrlIfNeeded, isRealDataOnly, setRealDataOnly } from "./realDataOnly";
import { filterLiveHomeTimelinePosts } from "./realTweetFilter";
import { dedupeLiveSessionRows } from "./liveSessionDedupe";
import { liveSessionDisplayMeta } from "./liveSessionQuality";
import { LiveSessionPreviewModal } from "./live/LiveSessionPreviewModal";
import { sortLiveSessionRows } from "./liveSessionRank";
import {
  HomeFeedSourceHelp,
  HomeFeedSourceSelect,
  parseHomeFeedModeFromUrl,
  readHomeFeedModeInitial,
  type HomeFeedMode
} from "./homeFeedSource";
import {
  IconBell,
  IconBookmark,
  IconChat,
  IconDocument,
  IconDots,
  IconGamepad,
  IconGear,
  IconHome,
  IconLogoX,
  IconPremiumBadge,
  IconSearch,
  IconShare,
  IconSparkles,
  IconViews,
  IconStudio,
  IconUser
} from "./icons";
import { ENTERED_KEY, XAuthLanding } from "./XAuthLanding";
import {
  XGamingPage,
  XGAMING_ALL_GAMES_ID,
  XGAMING_GAME_CHANGE_EVENT,
  XGAMING_SUPPORTED_GAMES,
  patchXGamingGameInUrl,
  readXGamingGameIdFromUrl
} from "./XGamingPage";
import { FeedtrixCategoryModal } from "./feedtrix/FeedtrixCategoryModal";
import {
  loadFeedtrixPostsForMergedFeed,
  loadFeedtrixPrefs,
  resetFeedtrixTopicPrefs,
  runSingleFeedtrixBackgroundTick,
  saveFeedtrixTopicEnabled,
  type FeedtrixPrefs
} from "./feedtrix/feedtrixService";
import { ingestCanonicalFromComparePayload } from "./feedtrix/canonicalIngest";
import { subscribeCanonicalMixerPosts } from "./feedtrix/canonicalMixerPosts";
import { runOneTimeLocalTweetDedupe } from "./db/dedupeLocalTweets";
import { runTwitterSpiderNow } from "./api/twitterSpider";
import { pullServerPipetrixIntoLocal } from "./feedtrix/serverPipetrixSync";
import { formatRelativeTweetAge, touchFeedtrixSessionClock } from "./feedtrix/feedtrixClock";
import { FEEDTRIX_TOPICS } from "./feedtrix/topics";
import { buildMixerFeedPostsBase } from "./mixer/buildFeedPosts";
import type { LatestWindow } from "./mixer/latestWindow";
import { fnv1aSeed, mergeFeedById, mergeFeedWithUnseenCanonicalFirst } from "./mixer/merge";
import { Trott, TrottRail } from "./trott/Trott";

type MainTab = "top" | "latest" | "people" | "media" | "lists";

function parseLatestWindowFromParam(v: string | null): LatestWindow | null {
  if (v === "day" || v === "week" || v === "month") return v;
  return null;
}

/** Per-tab corpus time scope (filters by createdAt). */
type TabWindowKey = "tw_top" | "tw_latest" | "tw_media";

function initTabWindow(sp: URLSearchParams, urlKey: TabWindowKey, legacyLatestOnly: boolean): LatestWindow {
  const d = parseLatestWindowFromParam(sp.get(urlKey));
  if (d) return d;
  if (legacyLatestOnly) {
    const l = parseLatestWindowFromParam(sp.get("latest"));
    if (l) return l;
  }
  return "all";
}

/** Posts per Grok request (initial + infinite scroll). */
const XAI_HOME_BATCH = 12;

function hasProfileFetchError(me: MeResponse | null): boolean {
  if (!me || me.connected !== true) return false;
  return Boolean(me.profileFetchError);
}

function homeDataSourceLabel(
  s: ComparePayload["homeDataSource"] | undefined
): string {
  switch (s) {
    case "following_timeline":
      return "following timeline";
    case "user_authored":
      return "your posts (API fallback)";
    case "user_authored_app":
      return "your posts via app Bearer";
    case "list_timeline":
      return "X List timeline";
    case "mock_seed":
      return "saved snapshot (offline)";
    case "xai_grok":
      return "Grok-generated timeline";
    case "recent_search_fallback":
      return "Recent Search feed (API fallback)";
    default:
      return "feed";
  }
}

function tweetTextPreview(t: TweetResult, maxLen: number): string {
  const raw = typeof t.text === "string" ? t.text : "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen).trim()}…`;
}

function tweetDedupeKey(t: TweetResult): string {
  const h = typeof t.handle === "string" ? t.handle.toLowerCase() : "";
  if (h) return h;
  const id = typeof t.id === "string" ? t.id : "";
  return id ? `id:${id}` : "_unknown";
}

function initials(name: string, handle: string): string {
  const a = name.trim().slice(0, 1);
  const b = handle.trim().slice(0, 1);
  return (a + b).slice(0, 2).toUpperCase();
}

function uniquePeople(posts: TweetResult[]): { author: string; handle: string }[] {
  const m = new Map<string, { author: string; handle: string }>();
  for (const p of posts) {
    const k = p.handle.toLowerCase();
    if (!m.has(k)) m.set(k, { author: p.author, handle: p.handle });
  }
  return [...m.values()];
}

function xProfileUrl(handle: string): string {
  return `https://x.com/${encodeURIComponent(handle.replace(/^@/, ""))}`;
}

function xStatusUrl(handle: string, id: string): string {
  return `${xProfileUrl(handle)}/status/${encodeURIComponent(id)}`;
}

function xSearchUrl(query: string): string {
  return `https://x.com/search?q=${encodeURIComponent(query)}`;
}

function xIntentReplyUrl(tweetId: string): string {
  return `https://x.com/intent/post?in_reply_to=${encodeURIComponent(tweetId)}`;
}

function xIntentRetweetUrl(tweetId: string): string {
  return `https://x.com/intent/retweet?tweet_id=${encodeURIComponent(tweetId)}`;
}

function xIntentLikeUrl(tweetId: string): string {
  return `https://x.com/intent/like?tweet_id=${encodeURIComponent(tweetId)}`;
}

function formatCompactCount(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Views shown in-feed; uses X impression_count when present, else a conservative mock estimate for seed data. */
function displayViewCount(tweet: TweetResult): number {
  if (typeof tweet.viewCount === "number" && tweet.viewCount >= 0) return tweet.viewCount;
  return Math.round(Math.max(400, tweet.likes * 42 + tweet.retweets * 180 + (tweet.hasMedia ? tweet.likes * 8 : 0)));
}

function TweetEngagementActions({ tweet, showLike }: { tweet: TweetResult; showLike?: boolean }) {
  const postUrl = xStatusUrl(tweet.handle, tweet.id);
  const replyUrl = xIntentReplyUrl(tweet.id);
  const rtxUrl = xIntentRetweetUrl(tweet.id);
  const likeUrl = xIntentLikeUrl(tweet.id);
  const replies = typeof tweet.replyCount === "number" && tweet.replyCount >= 0 ? tweet.replyCount : null;

  const onShare = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ url: postUrl, text: tweet.text.slice(0, 200) });
        return;
      }
    } catch {
      /* user dismissed or share failed */
    }
    try {
      await navigator.clipboard.writeText(postUrl);
    } catch {
      window.open(postUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="ix-eng-bar" onClick={(e) => e.stopPropagation()}>
      <a
        href={replyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ix-eng-action ix-eng-with-count"
        title={replies != null ? `${formatCompactCount(replies)} replies on X` : "Reply on X"}
        aria-label="Reply on X"
      >
        <IconChat width={18} height={18} />
        {replies != null ? (
          <span className="ix-eng-count" title={`${replies} replies`}>
            {formatCompactCount(replies)}
          </span>
        ) : null}
      </a>
      <a
        href={rtxUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ix-eng-rtx ix-eng-with-count"
        title={`${formatCompactCount(tweet.retweets)} reposts on X`}
        aria-label="Re-transmit (repost) on X"
      >
        [RTX]
        <span className="ix-eng-count">{formatCompactCount(tweet.retweets)}</span>
      </a>
      {showLike ? (
        <a
          href={likeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ix-eng-metric ix-eng-likes ix-eng-likes--action"
          title={`Like on X (${formatCompactCount(tweet.likes)} on post)`}
          aria-label="Like on X"
        >
          <span aria-hidden>♥</span>
          <span className="ix-eng-count">{formatCompactCount(tweet.likes)}</span>
        </a>
      ) : null}
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ix-eng-action"
        title="Open on X to bookmark"
        aria-label="Open on X to bookmark"
      >
        <IconBookmark width={18} height={18} />
      </a>
      <button type="button" className="ix-eng-action ix-eng-share" onClick={onShare} title="Share or copy link" aria-label="Share post">
        <IconShare />
      </button>
      <span className="ix-eng-views" title="Times viewed on X (impressions)">
        <span className="ix-eng-views-ico" aria-hidden>
          <IconViews />
        </span>
        <span className="ix-eng-views-num">{formatCompactCount(displayViewCount(tweet))}</span>
        <span className="ix-eng-views-label">viewed</span>
      </span>
    </div>
  );
}

type AppPage = "home" | "explore" | "account" | "ranking" | "spaces" | "broadcasts" | "xgaming" | "trott";

function parseAppPage(sp: URLSearchParams): AppPage {
  const p = sp.get("page");
  if (p === "trott") return "trott";
  if (p === "explore" || p === "search") return "explore";
  if (p === "account") return "account";
  if (p === "ranking") return "ranking";
  if (p === "spaces") return "spaces";
  if (p === "broadcasts") return "broadcasts";
  if (p === "xgaming") return "xgaming";
  if (p === "home") return "home";
  return "home";
}

const TEXT_PREVIEW_CHARS = 260;
/** Used only by `TweetCard` tile variant (optional compact cards; home feed uses classic/stream). */
const TILE_TEXT_PREVIEW_CHARS = 168;

function ExpandableText({
  text,
  className,
  previewChars = TEXT_PREVIEW_CHARS
}: {
  text: string;
  className?: string;
  previewChars?: number;
}) {
  const [open, setOpen] = useState(false);
  const needToggle = text.length > previewChars;
  const preview = needToggle && !open ? `${text.slice(0, previewChars).trim()}…` : text;
  return (
    <div className="ix-expandable">
      <p className={className}>{preview}</p>
      {needToggle ? (
        <button type="button" className="ix-show-more" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

type LiveKind = "space" | "broadcast";

type LiveSessionRow = {
  id: string;
  kind: LiveKind;
  handle: string;
  author: string;
  title: string;
  live: boolean;
  listeners: number;
  endedAgo?: string;
  /** Open on X (Space peek / Broadcast URL) when from Grok */
  linkUrl?: string;
};

const LIVE_RAIL_MAX = 6;

/** Home / Explore: render this many tweet tiles first; load more as the user scrolls. */
const FEED_RENDER_BATCH = 50;
const LIVE_SESSION_RENDER_BATCH = 12;

type GrokLiveSnapshotV1 = {
  v: 1;
  fetchedAt: number;
  spaces: LiveSessionRow[];
  broadcasts: LiveSessionRow[];
  meta: { liveSearch: boolean; model?: string } | null;
  warning: string | null;
};

function formatRelativeMsAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function readGrokLiveSnapshot(): GrokLiveSnapshotV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GROK_LIVE_SNAPSHOT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as GrokLiveSnapshotV1;
    if (p?.v !== 1 || !Array.isArray(p.spaces) || !Array.isArray(p.broadcasts)) return null;
    return p;
  } catch {
    return null;
  }
}

function mergeLiveSessionRowsLocal(prev: LiveSessionRow[], add: LiveSessionRow[]): LiveSessionRow[] {
  return dedupeLiveSessionRows([...prev, ...add]);
}

function buildGrokLiveRailRows(spaces: LiveSessionRow[], broadcasts: LiveSessionRow[]): LiveSessionRow[] {
  const merged = dedupeLiveSessionRows([
    ...sortLiveSessionRows(spaces),
    ...sortLiveSessionRows(broadcasts)
  ]);
  return merged.slice(0, LIVE_RAIL_MAX);
}

function LiveSessionTile({
  row,
  onSelect,
  onOpenOnX
}: {
  row: LiveSessionRow;
  onSelect?: (row: LiveSessionRow) => void;
  onOpenOnX?: (row: LiveSessionRow) => void;
}) {
  const display = liveSessionDisplayMeta(row);
  const profileHref = xProfileUrl(display.handle === "space" ? row.handle : display.handle);
  const primaryHref = row.linkUrl?.trim() || profileHref;
  const mark = () => onOpenOnX?.(row);
  const openPreview = () => onSelect?.(row);
  return (
    <article
      className={`ix-tile ix-tile--live-session ix-tile--clickable ${row.live ? "ix-tile--live-on" : ""}`}
      role="button"
      tabIndex={0}
      onClick={openPreview}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPreview();
        }
      }}
    >
      <header className="ix-tile-head">
        <a
          href={primaryHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ix-avatar ix-avatar-link ix-avatar--tile"
          aria-label={`Open ${row.kind} on X`}
          onClick={(e) => {
            e.stopPropagation();
            mark();
          }}
        >
          {initials(display.author, display.handle)}
        </a>
        <div className="ix-tile-meta">
          <a
            href={primaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ix-name ix-link-plain"
            onClick={mark}
          >
            {display.author}
          </a>
          <a href={profileHref} target="_blank" rel="noopener noreferrer" className="ix-handle ix-link-plain">
            @{display.handle}
          </a>
          <span className="ix-dot">·</span>
          <span className={`ix-live-badge ix-live-badge--compact ${row.live ? "ix-live-badge--on" : ""}`}>
            {row.live ? "LIVE" : "RECENT"}
          </span>
          <span className="ix-live-inline-kind">{row.kind === "space" ? "Space" : "Broadcast"}</span>
        </div>
      </header>
      <div className="ix-tile-bodylink">
        <p className="ix-tile-text">{row.title}</p>
      </div>
      <footer className="ix-tile-foot ix-tile-foot--live">
        <span className="ix-muted ix-fineprint">
          {row.live
            ? `${row.listeners.toLocaleString()} listening`
            : row.endedAgo
              ? `Ended ${row.endedAgo}`
              : "Recently on-air"}
        </span>
      </footer>
    </article>
  );
}

function TransmissionBadge({ tweet }: { tweet: TweetResult }) {
  const k = tweet.transmission ?? "tx";
  const label =
    k === "rtx"
      ? "Re-Transmission (retweet) · RetweetX"
      : k === "qtx"
        ? "Quoted Transmission (quote tweet)"
        : "Transmission (original post)";
  const code = k === "rtx" ? "RTX" : k === "qtx" ? "QTX" : "TX";
  return (
    <span className="ix-tx-badge" title={label}>
      {code}
    </span>
  );
}

function RepostContextLine({
  tweet,
  variant
}: {
  tweet: TweetResult;
  variant: "classic" | "stream" | "tile";
}) {
  const rc = tweet.repostContext;
  if (!rc) return null;
  const href = xProfileUrl(rc.byHandle);
  const mod =
    variant === "classic"
      ? "ix-repost-context--classic"
      : variant === "stream"
        ? "ix-repost-context--stream"
        : "ix-repost-context--tile";
  return (
    <div className={`ix-repost-context ${mod}`} role="note">
      <span className="ix-repost-context-icon" aria-hidden>
        ↻
      </span>
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {rc.byAuthor} <span className="ix-repost-suffix">reposted</span>
      </a>
    </div>
  );
}

function isTweetCardInnerInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("a, button, video, textarea, input, select, [contenteditable='true']"));
}

function TweetCard({
  tweet,
  variant = "classic",
  engagementShowLike = false,
  onOpenDetail
}: {
  tweet: TweetResult;
  variant?: "classic" | "stream" | "tile";
  /** When true (e.g. focus modal), show heart / like entry point. Hidden in the main feed. */
  engagementShowLike?: boolean;
  onOpenDetail?: (tweet: TweetResult) => void;
}) {
  const profileUrl = xProfileUrl(tweet.handle);
  const postUrl = xStatusUrl(tweet.handle, tweet.id);
  const mediaUrlsRaw = tweet.mediaUrls ?? [];
  const mediaCount = mediaUrlsRaw.length;
  const hasVideo = Boolean(tweet.videoUrl?.trim());
  const streamThumbSrc = mediaUrlsRaw[0];
  const streamVideoOnly = Boolean(hasVideo && mediaCount === 0);
  const hasTileMedia = mediaCount > 0 || hasVideo;

  const onCardActivate = (e: MouseEvent<HTMLElement>) => {
    if (!onOpenDetail) return;
    if (isTweetCardInnerInteractiveTarget(e.target)) return;
    onOpenDetail(tweet);
  };

  const focusableClass = onOpenDetail ? " ix-tweet-card--focusable" : "";

  if (variant === "tile") {
    const visible = mediaUrlsRaw.slice(0, 4);
    const moreExtra = mediaCount > 4 ? mediaCount - 4 : 0;
    const mediaTier = Math.min(mediaCount, 4);

    return (
      <article
        className={`ix-tile ${hasTileMedia ? "ix-tile--media" : "ix-tile--text"}${
          tweet.repostContext ? " ix-tile--repost" : ""
        }${focusableClass}`}
        onClick={onOpenDetail ? onCardActivate : undefined}
      >
        <RepostContextLine tweet={tweet} variant="tile" />
        <TransmissionBadge tweet={tweet} />
        <header className="ix-tile-head">
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ix-avatar ix-avatar-link ix-avatar--tile"
            aria-label={`Open @${tweet.handle} on X`}
            onClick={(e) => e.stopPropagation()}
          >
            <AvatarWithFallbacks
              author={tweet.author}
              handle={tweet.handle}
              avatarUrl={tweet.avatarUrl}
              className="ix-avatar-img"
              imgLoading="eager"
              initialsFallback={initials(tweet.author, tweet.handle)}
            />
          </a>
          <div className="ix-tile-meta">
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="ix-name ix-link-plain">
              {tweet.author}
            </a>
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="ix-handle ix-link-plain">
              @{tweet.handle}
            </a>
            <span className="ix-dot">·</span>
            <a href={postUrl} target="_blank" rel="noopener noreferrer" className="ix-time ix-link-plain">
              <time dateTime={tweet.createdAt}>{formatRelativeTweetAge(tweet.createdAt)}</time>
            </a>
          </div>
        </header>
        <div className="ix-tile-bodylink">
          <ExpandableText text={tweet.text} className="ix-tile-text" previewChars={TILE_TEXT_PREVIEW_CHARS} />
          {tweet.mixerNote ? (
            <p className="ix-tile-mixernote ix-muted ix-fineprint">{tweet.mixerNote}</p>
          ) : null}
          {hasTileMedia && mediaCount > 0 ? (
            <div className={`ix-tile-media ix-tile-media--${mediaTier}`}>
              {visible.map((src, i) => (
                <div
                  key={`${tweet.id}-m${i}`}
                  className={`ix-tile-media-cell${mediaTier === 3 && i === 0 ? " ix-tile-media-cell--tall" : ""}`}
                >
                  <TwimgImg originalSrc={src} alt="" loading="lazy" />
                  {i === 3 && moreExtra > 0 ? (
                    <span className="ix-tile-media-more">+{moreExtra}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <footer className="ix-tile-foot">
          <TweetEngagementActions tweet={tweet} showLike={engagementShowLike} />
        </footer>
      </article>
    );
  }

  if (variant === "stream") {
    const main = (
      <div className="ix-post-stream-main">
        <TransmissionBadge tweet={tweet} />
        <header className="ix-post-stream-top">
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ix-avatar ix-avatar--stream ix-avatar-link"
            aria-label={`Open @${tweet.handle} on X`}
            onClick={(e) => e.stopPropagation()}
          >
            <AvatarWithFallbacks
              author={tweet.author}
              handle={tweet.handle}
              avatarUrl={tweet.avatarUrl}
              className="ix-avatar-img"
              imgLoading="eager"
              initialsFallback={initials(tweet.author, tweet.handle)}
            />
          </a>
          <div className="ix-post-stream-meta">
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="ix-name ix-link-plain">
              {tweet.author}
            </a>
            <span className="ix-stream-dot">·</span>
            <a href={postUrl} target="_blank" rel="noopener noreferrer" className="ix-time ix-link-plain">
              <time dateTime={tweet.createdAt}>{formatRelativeTweetAge(tweet.createdAt)}</time>
            </a>
          </div>
        </header>
        <div className="ix-post-stream-titlelink">
          <ExpandableText text={tweet.text} className="ix-post-stream-preview" />
          {tweet.mixerNote ? (
            <p className="ix-post-stream-mixernote ix-muted ix-fineprint">{tweet.mixerNote}</p>
          ) : null}
        </div>
        <footer className="ix-post-meta ix-post-stream-foot">
          <TweetEngagementActions tweet={tweet} showLike={engagementShowLike} />
        </footer>
      </div>
    );

    if (!streamThumbSrc && !streamVideoOnly) {
      return (
        <article
          className={`ix-post ix-post--stream ix-post--stream-nothumb${focusableClass}`}
          onClick={onOpenDetail ? onCardActivate : undefined}
        >
          <RepostContextLine tweet={tweet} variant="stream" />
          {main}
        </article>
      );
    }

    return (
      <article
        className={`ix-post ix-post--stream${focusableClass}`}
        onClick={onOpenDetail ? onCardActivate : undefined}
      >
        <RepostContextLine tweet={tweet} variant="stream" />
        <div className="ix-post-stream-media-row">
          {streamVideoOnly ? (
            <div className="ix-post-stream-thumb ix-post-stream-thumb--video">
              <TwimgImg originalSrc={streamThumbSrc || mediaUrlsRaw[0]} alt="" loading="lazy" />
                  <div className="ix-video-play-overlay">
                    <div className="ix-play-icon" />
                  </div>
            </div>
          ) : (
            <div className="ix-post-stream-thumb">
              <TwimgImg originalSrc={streamThumbSrc} alt="" loading="lazy" />
            </div>
          )}
          {main}
        </div>
      </article>
    );
  }

  return (
    <article className={`ix-post${focusableClass}`} onClick={onOpenDetail ? onCardActivate : undefined}>
      <RepostContextLine tweet={tweet} variant="classic" />
      <div className="ix-post-cols">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ix-avatar ix-avatar-link"
          aria-label={`Open @${tweet.handle} on X`}
          title={tweet.author}
          onClick={(e) => e.stopPropagation()}
        >
          <AvatarWithFallbacks
            author={tweet.author}
            handle={tweet.handle}
            avatarUrl={tweet.avatarUrl}
            className="ix-avatar-img"
            imgLoading="eager"
            initialsFallback={initials(tweet.author, tweet.handle)}
          />
        </a>
        <div className="ix-post-body">
          <TransmissionBadge tweet={tweet} />
          <header className="ix-post-head">
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ix-name ix-link-plain"
              onClick={(e) => e.stopPropagation()}
            >
              {tweet.author}
            </a>
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ix-handle ix-link-plain"
              onClick={(e) => e.stopPropagation()}
            >
              @{tweet.handle}
            </a>
            <span className="ix-dot">·</span>
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ix-time ix-link-plain"
              onClick={(e) => e.stopPropagation()}
            >
              <time dateTime={tweet.createdAt}>{formatRelativeTweetAge(tweet.createdAt)}</time>
            </a>
          </header>
          <div className="ix-post-mainlink">
            <ExpandableText text={tweet.text} className="ix-post-text" />
            {tweet.mixerNote ? (
              <p className="ix-post-mixernote ix-muted ix-fineprint">{tweet.mixerNote}</p>
            ) : null}
            {hasVideo ? (
              <div className="ix-post-media ix-post-media--video">
                <TwimgVideo originalUrl={tweet.videoUrl} controls playsInline preload="metadata" className="ix-post-video" />
              </div>
            ) : null}
            {mediaCount ? (
              <div className="ix-post-media">
                {mediaUrlsRaw.map((src, i) => (
                  <TwimgImg key={`${tweet.id}-m${i}`} originalSrc={src} alt="" loading="lazy" />
                ))}
              </div>
            ) : null}
          </div>
          <footer className="ix-post-meta">
            <TweetEngagementActions tweet={tweet} showLike={engagementShowLike} />
            {tweet.hasMedia || mediaCount > 0 || tweet.videoUrl ? (
              <a href={postUrl} target="_blank" rel="noopener noreferrer" className="ix-media-badge ix-meta-link">
                Media
              </a>
            ) : null}
          </footer>
        </div>
      </div>
    </article>
  );
}

function TweetFocusModal({ tweet, onClose }: { tweet: TweetResult; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const titleId = `ix-tweet-focus-${tweet.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div
      className="ix-tweet-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ix-tweet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ix-tweet-modal-chrome">
          <button type="button" className="ix-tweet-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <h2 id={titleId} className="ix-tweet-modal-heading">
            Post <span className="ix-muted">· @{tweet.handle.replace(/^@/, "")}</span>
          </h2>
        </div>
        <TweetCard tweet={tweet} variant="classic" engagementShowLike />
      </div>
    </div>
  );
}

type NavDef =
  | { kind: "page"; id: string; label: string; Icon: typeof IconHome; page: AppPage }
  | { kind: "stub"; id: string; label: string; Icon: typeof IconHome };

const NAV_ITEMS: NavDef[] = [
  { kind: "page", id: "nav-home", label: "Home", Icon: IconHome, page: "home" },
  { kind: "page", id: "nav-trott", label: "TROTT", Icon: IconChat, page: "trott" },
  { kind: "page", id: "nav-explore", label: "Explore", Icon: IconSearch, page: "explore" },
  { kind: "page", id: "nav-xgaming", label: "XGaming", Icon: IconGamepad, page: "xgaming" },
  { kind: "stub", id: "nav-notifications", label: "Notifications", Icon: IconBell },
  { kind: "stub", id: "nav-messages", label: "Messages", Icon: IconChat },
  { kind: "stub", id: "nav-grok", label: "Grok", Icon: IconSparkles },
  { kind: "stub", id: "nav-premium", label: "Premium", Icon: IconPremiumBadge },
  { kind: "stub", id: "nav-bookmarks", label: "Bookmarks", Icon: IconBookmark },
  { kind: "stub", id: "nav-studio", label: "Creator Studio", Icon: IconStudio },
  { kind: "stub", id: "nav-articles", label: "Articles", Icon: IconDocument },
  { kind: "stub", id: "nav-profile", label: "Profile", Icon: IconUser }
];

function LiveSpacesRail({
  goPage,
  railRows,
  loading,
  liveSearch,
  errorNote,
  warnNote,
  onSessionOpened,
  onSessionSelect,
  lastUpdatedAt,
  xaiConfigured
}: {
  goPage: (next: AppPage) => void;
  railRows: LiveSessionRow[];
  loading: boolean;
  liveSearch: boolean | null;
  errorNote?: string | null;
  warnNote?: string | null;
  onSessionOpened?: (row: LiveSessionRow) => void;
  onSessionSelect?: (row: LiveSessionRow) => void;
  /** When live data was last fetched (directory pages) or rehydrated from snapshot (Home). */
  lastUpdatedAt?: number | null;
  xaiConfigured?: boolean | null;
}) {
  return (
    <div className="ix-widget ix-widget-live">
      <h3 className="ix-widget-title">Live &amp; Spaces</h3>
      <p className="ix-muted ix-fineprint" style={{ marginTop: 0 }}>
        Live X Spaces and Broadcasts via Grok (xAI live / X search when enabled). Links open the Space or Broadcast on X.
        {liveSearch === true ? " · Grounded with live search." : liveSearch === false ? " · Static model only (enable XAI_LIVE_SEARCH or pass live=1)." : null}{" "}
        <strong>Home</strong> shows the last snapshot only — open <strong>All Spaces</strong> / <strong>All Broadcasts</strong> to
        refresh from Grok.
      </p>
      {errorNote ? (
        <p className="ix-muted ix-fineprint" style={{ marginTop: 4 }}>
          {errorNote}
        </p>
      ) : null}
      {warnNote ? (
        <p className="ix-muted ix-fineprint" style={{ marginTop: 4 }}>
          {warnNote}
        </p>
      ) : null}
      {lastUpdatedAt && railRows.length > 0 ? (
        <p className="ix-muted ix-fineprint" style={{ marginTop: 4 }}>
          Snapshot · updated {formatRelativeMsAgo(lastUpdatedAt)}
        </p>
      ) : null}
      {xaiConfigured === true && !loading && !railRows.length && !errorNote ? (
        <p className="ix-muted ix-fineprint" style={{ marginTop: 4 }}>
          No snapshot yet. Open <strong>All Spaces</strong> or <strong>All Broadcasts</strong> to fetch listings; they&apos;ll
          appear here on Home afterward.
        </p>
      ) : null}
      <ul className="ix-live-list">
        {loading && !railRows.length ? (
          <li className="ix-muted ix-fineprint">Loading live sessions…</li>
        ) : null}
        {railRows.map((row) => {
          return (
            <li key={row.id}>
              <button
                type="button"
                className="ix-live-row"
                onClick={() => {
                  onSessionSelect?.(row);
                  onSessionOpened?.(row);
                }}
              >
                <span className={`ix-live-badge ${row.live ? "ix-live-badge--on" : ""}`}>
                  {row.live ? "LIVE" : "RECENT"}
                </span>
                <div className="ix-live-body">
                  <p className="ix-live-title">
                    <span className="ix-live-row-kind">{row.kind === "space" ? "Space" : "Broadcast"}</span>
                    {row.title}
                  </p>
                  <span className="ix-live-sub">
                    @{row.handle.replace(/^@/, "")}
                    {row.live
                      ? ` · ${row.listeners.toLocaleString()} listening`
                      : ` · ended ${row.endedAgo ?? "recently"}`}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ix-live-rail-footer">
        <button type="button" className="ix-link-btn" onClick={() => goPage("spaces")}>
          All Spaces
        </button>
        <span className="ix-live-rail-sep" aria-hidden>
          |
        </span>
        <button type="button" className="ix-link-btn" onClick={() => goPage("broadcasts")}>
          All Broadcasts
        </button>
      </div>
    </div>
  );
}

type WhoToFollowRow = {
  author: string;
  handle: string;
  blurb?: string;
  avatarUrl?: string;
};

const WHO_TO_FOLLOW_SEED: WhoToFollowRow[] = [
  { author: "X", handle: "X", blurb: "What’s happening, and what people are talking about." },
  { author: "NASA", handle: "NASA", blurb: "Exploring the universe and our home planet." },
  { author: "OpenAI", handle: "OpenAI", blurb: "OpenAI builds safe and beneficial AGI." }
];

function buildWhoToFollowRows(posts: TweetResult[], max: number): WhoToFollowRow[] {
  const out: WhoToFollowRow[] = [];
  const seen = new Set<string>();
  for (const t of posts) {
    const handle = typeof t.handle === "string" ? t.handle : "";
    if (!handle.trim()) continue;
    const k = tweetDedupeKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    const blurb = tweetTextPreview(t, 52);
    out.push({
      author: typeof t.author === "string" ? t.author : handle || "Account",
      handle,
      blurb,
      avatarUrl: t.avatarUrl
    });
    if (out.length >= max) return out;
  }
  for (const s of WHO_TO_FOLLOW_SEED) {
    const k = s.handle.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function WhoToFollowAvatar({ row }: { row: WhoToFollowRow }) {
  const href = xProfileUrl(row.handle);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ix-avatar ix-avatar-link ix-wtf-avatar"
      aria-label={`Open @${row.handle} on X`}
    >
      <AvatarWithFallbacks
        author={row.author}
        handle={row.handle}
        avatarUrl={row.avatarUrl}
        className="ix-avatar-img"
        imgLoading="eager"
        initialsFallback={initials(row.author, row.handle)}
      />
    </a>
  );
}

function WhoToFollowRail({ posts }: { posts: TweetResult[] }) {
  const rows = useMemo(() => buildWhoToFollowRows(posts, 3), [posts]);

  return (
    <div className="ix-widget ix-widget-wtf">
      <h3 className="ix-widget-title ix-widget-title--wtf">Who to follow</h3>
      <ul className="ix-wtf-list">
        {rows.map((row) => {
          const href = xProfileUrl(row.handle);
          const h = row.handle.replace(/^@/, "");
          return (
            <li key={`wtf-${h}`} className="ix-wtf-row">
              <WhoToFollowAvatar row={row} />
              <div className="ix-wtf-meta">
                <a href={href} target="_blank" rel="noopener noreferrer" className="ix-wtf-name">
                  {row.author}
                </a>
                <a href={href} target="_blank" rel="noopener noreferrer" className="ix-wtf-handle">
                  @{h}
                </a>
                {row.blurb ? <p className="ix-wtf-blurb">{row.blurb}</p> : null}
              </div>
              <a className="ix-follow ix-wtf-follow" href={href} target="_blank" rel="noopener noreferrer">
                Follow
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function App() {
  const defaultQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("q")?.trim() || ""
      : "";

  const [q, setQ] = useState(defaultQuery || "test");
  const [recencyWeight, setRecencyWeight] = useState(0.78);
  const [strictMatch, setStrictMatch] = useState(true);
  const [source, setSource] = useState<"mock" | "live">(() =>
    typeof window !== "undefined" && isRealDataOnly() ? "live" : "mock"
  );
  const [maxResults, setMaxResults] = useState(35);
  const [omitRetweets, setOmitRetweets] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [platform, setPlatform] = useState<TweetResult[] | null>(null);
  const [refined, setRefined] = useState<TweetResult[] | null>(null);
  const [meta, setMeta] = useState<
    | (Pick<ComparePayload, "corpusSize" | "note" | "omitRetweets" | "homeDataSource"> & {
        liveAuth?: ComparePayload["liveAuth"];
        source?: ComparePayload["source"];
        feed?: ComparePayload["feed"];
      })
    | null
  >(null);
  const [bearerConfigured, setBearerConfigured] = useState<boolean | null>(null);
  const [liveSearchReady, setLiveSearchReady] = useState<boolean | null>(null);
  const [oauthClientConfigured, setOauthClientConfigured] = useState<boolean | null>(null);
  const [xaiConfigured, setXaiConfigured] = useState<boolean | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  /** null = still checking */
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  /** Session-persisted: user passed X-style landing or OAuth */
  const [enteredApp, setEnteredApp] = useState(
    () => typeof window !== "undefined" && (sessionStorage.getItem(ENTERED_KEY) === "1" || import.meta.env.VITE_LOCAL_SNAPSHOT === '1')
  );

  const [mainTab, setMainTab] = useState<MainTab>("top");
  const [twTop, setTwTop] = useState<LatestWindow>(() =>
    typeof window === "undefined" ? "all" : initTabWindow(new URLSearchParams(window.location.search), "tw_top", false)
  );
  const [twLatest, setTwLatest] = useState<LatestWindow>(() =>
    typeof window === "undefined"
      ? "all"
      : initTabWindow(new URLSearchParams(window.location.search), "tw_latest", true)
  );
  const [twMedia, setTwMedia] = useState<LatestWindow>(() =>
    typeof window === "undefined" ? "all" : initTabWindow(new URLSearchParams(window.location.search), "tw_media", false)
  );
  const [feedtrixModalOpen, setFeedtrixModalOpen] = useState(false);
  const [feedtrixPrefs, setFeedtrixPrefs] = useState<FeedtrixPrefs>({});
  const feedtrixPrefsRef = useRef<FeedtrixPrefs>({});
  /** Canonical TheFeedtrix rows merged into Home candidates (live RxDB subscription). */
  const [canonicalMixerPosts, setCanonicalMixerPosts] = useState<TweetResult[]>([]);
  /** Top / Latest / Media: time-scope menu opens only after clicking the already-active tab */
  const [tabTimeMenuKey, setTabTimeMenuKey] = useState<"top" | "latest" | "media" | null>(null);
  const homeExploreTabsNavRef = useRef<HTMLDivElement | null>(null);

  const [topRank, setTopRank] = useState<"platform" | "refined">("platform");
  const [page, setPage] = useState<AppPage>(() =>
    typeof window !== "undefined" ? parseAppPage(new URLSearchParams(window.location.search)) : "home"
  );
  /** Home: live X (default) vs Grok-front-loaded timeline vs offline seed corpus */
  const [homeFeedMode, setHomeFeedMode] = useState<HomeFeedMode>(readHomeFeedModeInitial);
  const [xaiLiveSearch, setXaiLiveSearch] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("ix_xai_live_search") === "1"
  );
  const [grokLiveSpaces, setGrokLiveSpaces] = useState<LiveSessionRow[]>([]);
  const [grokLiveBroadcasts, setGrokLiveBroadcasts] = useState<LiveSessionRow[]>([]);
  const [grokLiveSessionsLoading, setGrokLiveSessionsLoading] = useState(false);
  const [grokLiveSessionsError, setGrokLiveSessionsError] = useState<string | null>(null);
  const [grokLiveSessionsWarning, setGrokLiveSessionsWarning] = useState<string | null>(null);
  const [grokLiveSessionsMeta, setGrokLiveSessionsMeta] = useState<{ liveSearch: boolean; model?: string } | null>(
    null
  );
  /** Wall-clock ms when Grok live data last succeeded (persisted in sessionStorage for rail). */
  const [grokLiveSessionsFetchedAt, setGrokLiveSessionsFetchedAt] = useState<number | null>(null);
  const [loadingMoreGrok, setLoadingMoreGrok] = useState(false);
  const grokScrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const feedInfiniteSentinelRef = useRef<HTMLDivElement | null>(null);
  const liveSessionsSentinelRef = useRef<HTMLDivElement | null>(null);
  /** One-shot per tab session: auto-fetch Live/Grok when Home has no persisted corpus. */
  const homeMixerAutoFetchRef = useRef(false);
  /** New UUID each full page load (F5) — Home mixer churn uses this so refresh always remixes order. */
  const feedPageLoadRemixSaltRef = useRef("");
  if (!feedPageLoadRemixSaltRef.current) {
    feedPageLoadRemixSaltRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
  /** Bumps when you pull a fresh Home timeline (Grok/seed/live refresh) so order remixes without a full tab reload. */
  const [feedRemixEpoch, setFeedRemixEpoch] = useState(0);
  const [feedVisibleCap, setFeedVisibleCap] = useState(FEED_RENDER_BATCH);
  const [homeTimelineNextToken, setHomeTimelineNextToken] = useState<string | null>(null);
  const [loadingMoreHome, setLoadingMoreHome] = useState(false);
  const [liveSessionsVisibleCap, setLiveSessionsVisibleCap] = useState(LIVE_SESSION_RENDER_BATCH);
  const [liveSessionsTotalSpaces, setLiveSessionsTotalSpaces] = useState(0);
  const [liveSessionsTotalBroadcasts, setLiveSessionsTotalBroadcasts] = useState(0);
  const [loadingMoreLiveSessions, setLoadingMoreLiveSessions] = useState(false);
  /** Classic X three-column vs wide feed + thumbs (YouTube / Kick style) */
  const [layoutMode, setLayoutMode] = useState<"classic" | "stream">(() => {
    if (typeof window === "undefined") return "classic";
    return sessionStorage.getItem("ix_layout_mode") === "stream" ? "stream" : "classic";
  });
  /** Right-rail selection for XGaming “Supported games”; URL key `xggame`. */
  const [xgGameRail, setXgGameRail] = useState<string>(() =>
    typeof window === "undefined" ? XGAMING_ALL_GAMES_ID : readXGamingGameIdFromUrl()
  );
  const [meMenuOpen, setMeMenuOpen] = useState(false);
  const meMenuRef = useRef<HTMLDivElement | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [twitterSpiderBusy, setTwitterSpiderBusy] = useState(false);
  const [twitterSpiderNote, setTwitterSpiderNote] = useState<string | null>(null);
  const [focusTweet, setFocusTweet] = useState<TweetResult | null>(null);
  const [seenPostIds, setSeenPostIds] = useState<Set<string>>(() => new Set());
  const [seenLiveKeys, setSeenLiveKeys] = useState<Set<string>>(() => new Set());
  const [includeSeenInFeed, setIncludeSeenInFeed] = useState(() =>
    typeof window !== "undefined" && (sessionStorage.getItem("ix_include_seen_in_feed") === "1" || import.meta.env.VITE_LOCAL_SNAPSHOT === '1')
  );

  const loadApiStatus = useCallback(async () => {
    try {
      const h = await fetch(apiUrlAbsolute("/api/health"), { credentials: "include" });
      if (!h.ok) throw new Error(`health_http_${h.status}`);
      const ht = await h.text();
      let hj: {
        ok?: boolean;
        error?: string;
        twitterBearerConfigured?: boolean;
        twitterLiveSearchReady?: boolean;
        twitterOAuthClientConfigured?: boolean;
        xaiConfigured?: boolean;
      };
      try {
        hj = JSON.parse(ht) as typeof hj;
      } catch {
        throw new Error("health_not_json");
      }
      if (hj?.ok === false) throw new Error(hj.error || "health_failed");

      setApiReachable(true);
      setBearerConfigured(Boolean(hj.twitterBearerConfigured));
      setLiveSearchReady(Boolean(hj.twitterLiveSearchReady));
      setOauthClientConfigured(Boolean(hj.twitterOAuthClientConfigured));
      setXaiConfigured(Boolean(hj.xaiConfigured));

      if (
        hj.twitterLiveSearchReady &&
        typeof window !== "undefined" &&
        !new URLSearchParams(window.location.search).has("source")
      ) {
        setSource("live");
      }

      const mr = await fetch(apiUrlAbsolute("/api/me"), { credentials: "include" });
      if (!mr.ok) throw new Error(`me_http_${mr.status}`);
      const mt = await mr.text();
      try {
        setMe(mt ? (JSON.parse(mt) as MeResponse) : null);
      } catch {
        setMe({ connected: false });
      }
    } catch {
      setApiReachable(false);
      setMe(null);
      setBearerConfigured(null);
      setLiveSearchReady(null);
      setOauthClientConfigured(null);
      setXaiConfigured(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    setErr(null);
    try {
      const r = await fetch(apiUrlAbsolute("/api/auth/x/logout"), {
        method: "POST",
        credentials: "include"
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t.trim().slice(0, 160) || `Sign out failed (${r.status})`);
      }
      setPlatform(null);
      setRefined(null);
      setMeta(null);
      await loadApiStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign out failed");
    } finally {
      setSigningOut(false);
    }
  }, [loadApiStatus]);

  const loadGrokLiveSessions = useCallback(async () => {
    if (xaiConfigured !== true) {
      setGrokLiveSpaces([]);
      setGrokLiveBroadcasts([]);
      setGrokLiveSessionsMeta(null);
      setGrokLiveSessionsError(null);
      setGrokLiveSessionsWarning(null);
      setGrokLiveSessionsFetchedAt(null);
      return;
    }
    setGrokLiveSessionsLoading(true);
    setGrokLiveSessionsError(null);
    setGrokLiveSessionsWarning(null);
    try {
      const d = await fetchLiveSessions({
        nSpaces: 100,
        nBroadcasts: 100,
        live: xaiLiveSearch
      });
      const spaces = dedupeLiveSessionRows((d.spaces ?? []) as LiveSessionRow[]);
      const broadcasts = dedupeLiveSessionRows((d.broadcasts ?? []) as LiveSessionRow[]);
      setGrokLiveSpaces(spaces);
      setGrokLiveBroadcasts(broadcasts);
      setLiveSessionsTotalSpaces(d.totalSpaces ?? spaces.length);
      setLiveSessionsTotalBroadcasts(d.totalBroadcasts ?? broadcasts.length);
      setLiveSessionsVisibleCap(LIVE_SESSION_RENDER_BATCH);
      setGrokLiveSessionsMeta({ liveSearch: Boolean(d.liveSearch), model: d.model });
      const pipeHint =
        d.pipeStats && d.fromFeedtrixPipe
          ? `Feedtrix pipe: ${d.pipeStats.spaces.active} live Spaces (${d.pipeStats.spaces.total} tracked) · ${d.pipeStats.broadcasts.active} live Broadcasts (${d.pipeStats.broadcasts.total} tracked).`
          : null;
      const cacheHint =
        typeof d.fetchedAt === "number" && d.fetchedAt > 0
          ? `Last hunt ${Math.max(1, Math.round((Date.now() - d.fetchedAt) / 60_000))}m ago · validate ~90s.`
          : null;
      const warnParts = [
        typeof d.warning === "string" && d.warning.trim() ? d.warning.trim() : null,
        pipeHint,
        cacheHint
      ].filter(Boolean);
      setGrokLiveSessionsWarning(warnParts.length ? warnParts.join(" ") : null);
      const fetchedAt = Date.now();
      setGrokLiveSessionsFetchedAt(fetchedAt);
      try {
        const snap: GrokLiveSnapshotV1 = {
          v: 1,
          fetchedAt,
          spaces,
          broadcasts,
          meta: { liveSearch: Boolean(d.liveSearch), model: d.model },
          warning: typeof d.warning === "string" && d.warning.trim() ? d.warning.trim() : null
        };
        sessionStorage.setItem(GROK_LIVE_SNAPSHOT_KEY, JSON.stringify(snap));
      } catch {
        /* ignore quota */
      }
    } catch (e) {
      setGrokLiveSessionsMeta(null);
      setGrokLiveSessionsWarning(null);
      setGrokLiveSessionsError(e instanceof Error ? e.message : "Could not load live sessions");
      const snap = readGrokLiveSnapshot();
      if (snap) {
        setGrokLiveSpaces(snap.spaces);
        setGrokLiveBroadcasts(snap.broadcasts);
        setGrokLiveSessionsMeta(snap.meta ?? null);
        setGrokLiveSessionsWarning(snap.warning ?? null);
        setGrokLiveSessionsFetchedAt(snap.fetchedAt);
      }
    } finally {
      setGrokLiveSessionsLoading(false);
    }
  }, [xaiConfigured, xaiLiveSearch]);

  useEffect(() => {
    if (page !== "spaces" && page !== "broadcasts") return;
    if (xaiConfigured !== true) return;
    setLiveSessionsVisibleCap(LIVE_SESSION_RENDER_BATCH);
    void loadGrokLiveSessions();
  }, [page, xaiConfigured, loadGrokLiveSessions]);

  useEffect(() => {
    sessionStorage.setItem("ix_layout_mode", layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    sessionStorage.setItem("ix_xai_live_search", xaiLiveSearch ? "1" : "0");
  }, [xaiLiveSearch]);

  useEffect(() => {
    sessionStorage.setItem("ix_include_seen_in_feed", includeSeenInFeed ? "1" : "0");
  }, [includeSeenInFeed]);

  const reloadSeenFromDb = useCallback(async () => {
    const [p, l] = await Promise.all([loadSeenPostIds(), loadSeenLiveKeys()]);
    setSeenPostIds(p);
    setSeenLiveKeys(l);
    void syncCanonicalSeenFlagsFromSeenPostIds(p);
  }, []);

  useEffect(() => {
    void reloadSeenFromDb();
  }, [reloadSeenFromDb]);

  /** One-shot: `?reset_seen=1` clears local seen + TheFeedtrix canonical seen flags, then strips the param. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("reset_seen") !== "1") return;
    sp.delete("reset_seen");
    const qs = sp.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    void clearAllSeenItems().then(() => {
      void reloadSeenFromDb();
    });
  }, [reloadSeenFromDb]);

  /** One-shot: `?wipe_local=1` strips the param, asks for confirmation, then wipes RxDB + avatar blob cache and reloads. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("wipe_local") !== "1") return;
    sp.delete("wipe_local");
    const qs = sp.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    if (
      !window.confirm(
        "Delete ALL offline data (RxDB, Pipetrix, seen_items, avatars, Grok snapshots) and reload in REAL-DATA-ONLY mode?\n\n" +
          "• Home = Live X API only (no seed / no fake Grok tweet IDs)\n" +
          "• Spaces/Broadcasts = fresh Grok live-sessions only\n" +
          "• Background topic filler paused until you enable demo data in Ranking lab\n\n" +
          "This cannot be undone."
      )
    ) {
      return;
    }
    void wipeAllLocalRxDatabases().then(() => {
      window.location.reload();
    });
  }, []);

  useEffect(() => {
    applyAfterWipeUrlIfNeeded();
  }, []);

  useEffect(() => {
    if (!enteredApp) return;
    touchFeedtrixSessionClock();
  }, [enteredApp]);

  useEffect(() => {
    if (!enteredApp || typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState === "visible") touchFeedtrixSessionClock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enteredApp]);

  useEffect(() => {
    if (!enteredApp) return;
    if (xaiConfigured === false) {
      setGrokLiveSpaces([]);
      setGrokLiveBroadcasts([]);
      setGrokLiveSessionsMeta(null);
      setGrokLiveSessionsWarning(null);
      setGrokLiveSessionsFetchedAt(null);
      return;
    }
    if (xaiConfigured !== true) return;
    const snap = readGrokLiveSnapshot();
    if (!snap) return;
    setGrokLiveSpaces(snap.spaces);
    setGrokLiveBroadcasts(snap.broadcasts);
    setGrokLiveSessionsMeta(snap.meta ?? null);
    setGrokLiveSessionsWarning(snap.warning ?? null);
    setGrokLiveSessionsFetchedAt(snap.fetchedAt);
  }, [enteredApp, xaiConfigured]);

  useEffect(() => {
    feedtrixPrefsRef.current = feedtrixPrefs;
  }, [feedtrixPrefs]);

  useEffect(() => {
    if (!enteredApp) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void subscribeCanonicalMixerPosts(() => feedtrixPrefs, (posts) => {
      if (!cancelled) setCanonicalMixerPosts(posts);
    }).then((u) => {
      if (!cancelled) unsub = u;
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [enteredApp, feedtrixPrefs]);

  useEffect(() => {
    if (!enteredApp) return;
    void loadFeedtrixPrefs().then(setFeedtrixPrefs);
  }, [enteredApp]);

  useEffect(() => {
    if (!enteredApp) return;
    void runOneTimeLocalTweetDedupe();
  }, [enteredApp]);

  useEffect(() => {
    if (!enteredApp || apiReachable !== true) return;
    void pullServerPipetrixIntoLocal();
    const id = window.setInterval(() => {
      void pullServerPipetrixIntoLocal();
    }, 300_000);
    return () => window.clearInterval(id);
  }, [enteredApp, apiReachable]);

  /** One-shot: re-fetch when IndexedDB predates media URLs or corpus schema bump. */
  const homeStaleMediaRefreshRef = useRef(false);
  const POSTS_MEDIA_SCHEMA_KEY = "ix_posts_media_schema_v2";
  const PURGE_SYNTHETIC_POSTS_KEY = "ix_purge_synthetic_posts_v1";

  /** One-time: drop Grok/seed rows from IndexedDB so Live Home cannot rehydrate 404 status IDs. */
  useEffect(() => {
    if (!enteredApp || !isRealDataOnly()) return;
    if (sessionStorage.getItem(PURGE_SYNTHETIC_POSTS_KEY) === "1") return;
    void purgeSyntheticPostsFromLocalDb().then((n) => {
      sessionStorage.setItem(PURGE_SYNTHETIC_POSTS_KEY, "1");
      if (n > 0 && page === "home") {
        setPlatform(null);
        setRefined(null);
        homeMixerAutoFetchRef.current = false;
      }
    });
  }, [enteredApp, page]);

  /** Restore mixer live layer from `ifixedx_local.posts` whenever Home is opened (no manual “Load timeline”). */
  useEffect(() => {
    if (!enteredApp || page !== "home" || (homeFeedMode === 'seed' && import.meta.env.VITE_LOCAL_SNAPSHOT === '1')) return;
    void loadPersistedMixerCorpus({ liveHomeOnly: homeFeedMode === "live" && isRealDataOnly() }).then(
      (persisted) => {
      if (!persisted?.platform_style.length) {
        if (
          homeFeedMode === "live" &&
          isRealDataOnly() &&
          me?.connected === true &&
          !hasProfileFetchError(me) &&
          !homeMixerAutoFetchRef.current
        ) {
          homeMixerAutoFetchRef.current = true;
          void runForYou();
        }
        return;
      }
      const schemaStale = sessionStorage.getItem(POSTS_MEDIA_SCHEMA_KEY) !== "2";
      const staleLiveMedia =
        homeFeedMode === "live" &&
        persisted.homeDataSource !== "mock_seed" &&
        !homeStaleMediaRefreshRef.current &&
        (schemaStale ||
          persisted.platform_style.some((t) => t.hasMedia && !(t.mediaUrls?.length ?? 0)));
      if (staleLiveMedia && me?.connected === true && !hasProfileFetchError(me)) {
        homeStaleMediaRefreshRef.current = true;
        void runForYou();
        return;
      }
      const plat =
        homeFeedMode === "live" && isRealDataOnly()
          ? filterLiveHomeTimelinePosts(persisted.platform_style)
          : persisted.platform_style;
      const ref =
        homeFeedMode === "live" && isRealDataOnly()
          ? filterLiveHomeTimelinePosts(persisted.refined)
          : persisted.refined;
      if (!plat.length) {
        if (me?.connected === true && !hasProfileFetchError(me)) void runForYou();
        return;
      }
      setPlatform(plat);
      setRefined(ref);
      setMeta({
        corpusSize: plat.length,
        source: persisted.homeDataSource === "mock_seed" ? "mock" : "live",
        note: persisted.note,
        feed: "home_reverse_chronological",
        homeDataSource: persisted.homeDataSource
      });
      setFeedRemixEpoch((e) => e + 1);
    }
    );
  }, [enteredApp, page, homeFeedMode, me]);

  useEffect(() => {
    if (!enteredApp || xaiConfigured !== true || isRealDataOnly()) return;
    const id = window.setInterval(() => {
      void runSingleFeedtrixBackgroundTick(feedtrixPrefsRef.current, xaiLiveSearch);
    }, 12_500);
    return () => window.clearInterval(id);
  }, [enteredApp, xaiConfigured, xaiLiveSearch]);

  useEffect(() => {
    if (!enteredApp) setFocusTweet(null);
  }, [enteredApp]);

  useEffect(() => {
    if (!focusTweet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [focusTweet]);

  useEffect(() => {
    if (!focusTweet) return;
    const id = String(focusTweet.id);
    void markPostSeen(id).then(() => {
      setSeenPostIds((prev) => new Set(prev).add(id));
    });
  }, [focusTweet?.id]);

  useEffect(() => {
    if (!meMenuOpen) return;
    function closeOnOutside(ev: globalThis.MouseEvent) {
      if (meMenuRef.current && !meMenuRef.current.contains(ev.target as Node)) {
        setMeMenuOpen(false);
      }
    }
    document.addEventListener("click", closeOnOutside);
    return () => document.removeEventListener("click", closeOnOutside);
  }, [meMenuOpen]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    let strip = false;
    if (sp.has("x_connected")) {
      strip = true;
      sp.delete("x_connected");
      sessionStorage.setItem(ENTERED_KEY, "1");
      setEnteredApp(true);
    }
    if (sp.has("x_auth_error")) {
      const m = sp.get("x_auth_error");
      if (m) setErr(decodeURIComponent(m));
      else setErr("Sign-in failed");
      sp.delete("x_auth_error");
      strip = true;
    }
    if (strip) {
      const qs = sp.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
    void loadApiStatus();
  }, [loadApiStatus]);

  useEffect(() => {
    if (me?.connected === true) {
      sessionStorage.setItem(ENTERED_KEY, "1");
      setEnteredApp(true);
    }
  }, [me]);

  const applyLocationSearchParams = useCallback(() => {
    const sp = new URLSearchParams(window.location.search);
    const nextPage = parseAppPage(sp);
    if (nextPage !== "explore") {
      sp.delete("q");
      sp.delete("source");
      const nu = new URL(window.location.href);
      nu.search = sp.toString();
      if (nu.search !== window.location.search) {
        window.history.replaceState({}, "", nu.toString());
      }
    }
    const qs = sp.get("source");
    if (nextPage === "explore") {
      if (qs === "live" || qs === "mock") setSource(isRealDataOnly() ? "live" : qs);
      else if (isRealDataOnly()) setSource("live");
    }
    const qt = nextPage === "explore" ? sp.get("q")?.trim() : "";
    if (qt) setQ(qt);
    const mt = sp.get("tab") as MainTab | null;
    if (mt && ["top", "latest", "people", "media", "lists"].includes(mt)) setMainTab(mt);

    const tTop = parseLatestWindowFromParam(sp.get("tw_top"));
    if (tTop) setTwTop(tTop);
    const tLat = parseLatestWindowFromParam(sp.get("tw_latest"));
    if (tLat) setTwLatest(tLat);
    else if (!sp.has("tw_latest")) {
      const legacyLatest = parseLatestWindowFromParam(sp.get("latest"));
      if (legacyLatest) setTwLatest(legacyLatest);
    }
    const tMed = parseLatestWindowFromParam(sp.get("tw_media"));
    if (tMed) setTwMedia(tMed);

    const home = parseHomeFeedModeFromUrl(sp);
    if (home) {
      setHomeFeedMode(home);
      sessionStorage.setItem("ix_home_feed_mode", home);
    }
    setPage(nextPage);
  }, []);

  useEffect(() => {
    applyLocationSearchParams();
    function onPopState() {
      applyLocationSearchParams();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyLocationSearchParams]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function closeMore(ev: globalThis.MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(ev.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener("click", closeMore);
    return () => document.removeEventListener("click", closeMore);
  }, [moreMenuOpen]);

  useEffect(() => {
    if (tabTimeMenuKey === null) return;
    function onDocMouseDown(ev: globalThis.MouseEvent) {
      if (
        homeExploreTabsNavRef.current &&
        !homeExploreTabsNavRef.current.contains(ev.target as Node)
      ) {
        setTabTimeMenuKey(null);
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setTabTimeMenuKey(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [tabTimeMenuKey]);

  useEffect(() => {
    setTabTimeMenuKey(null);
  }, [mainTab]);

  const [liveSessionPreview, setLiveSessionPreview] = useState<LiveSessionRow | null>(null);

  const onLiveSessionOpened = useCallback((row: LiveSessionRow) => {
    void markLiveSessionSeen(row).then(() => {
      setSeenLiveKeys((prev) => new Set(prev).add(liveSessionSeenKeyFromRow(row)));
    });
  }, []);

  const onLiveSessionSelect = useCallback((row: LiveSessionRow) => {
    setLiveSessionPreview(row);
  }, []);

  const corpusTimeScope: LatestWindow =
    mainTab === "top"
      ? twTop
      : mainTab === "latest"
        ? twLatest
        : mainTab === "media"
          ? twMedia
          : "all";

  const canonLen = canonicalMixerPosts.length;
  const canonFirstId = canonLen > 0 ? String(canonicalMixerPosts[0]?.id ?? "") : "";
  const canonLastId = canonLen > 0 ? String(canonicalMixerPosts[canonLen - 1]?.id ?? "") : "";

  /**
   * `feedPageLoadRemixSaltRef` changes every browser refresh → tail shuffle (and unseen-head shuffle) never
   * repeats the previous permutation. Corpus shape is mixed in so async Grok/IndexedDB hydration still
   * applies a new ordering once data arrives.
   */
  const homeFeedChurnSeed = useMemo(() => {
    if (page !== "home") return undefined;
    return fnv1aSeed([
      feedPageLoadRemixSaltRef.current,
      String(feedRemixEpoch),
      String(platform?.length ?? 0),
      String(refined?.length ?? 0),
      String(canonLen),
      `${canonFirstId}:${canonLastId}`,
      includeSeenInFeed ? "1" : "0"
    ]);
  }, [page, feedRemixEpoch, platform?.length, refined?.length, canonLen, canonFirstId, canonLastId, includeSeenInFeed]);

  const preferLiveTimelineFirst =
    page === "home" && (homeFeedMode === "live" || homeFeedMode === "seed");

  const platformForMixer = useMemo(() => {
    const live = platform ?? [];
    if (page === "home" && isRealDataOnly()) {
      return mergeFeedWithUnseenCanonicalFirst(live, canonicalMixerPosts, seenPostIds, {
        includeSeen: includeSeenInFeed,
        churnSeed: homeFeedChurnSeed,
        preferLiveFirst: preferLiveTimelineFirst
      });
    }
    if (page !== "home") return mergeFeedById(live, canonicalMixerPosts);
    return mergeFeedWithUnseenCanonicalFirst(live, canonicalMixerPosts, seenPostIds, {
      includeSeen: includeSeenInFeed,
      churnSeed: homeFeedChurnSeed,
      preferLiveFirst: preferLiveTimelineFirst
    });
  }, [
    platform,
    canonicalMixerPosts,
    page,
    seenPostIds,
    includeSeenInFeed,
    homeFeedChurnSeed,
    preferLiveTimelineFirst
  ]);

  const refinedForMixer = useMemo(() => {
    const live = refined ?? [];
    if (page === "home" && isRealDataOnly()) {
      return mergeFeedWithUnseenCanonicalFirst(live, canonicalMixerPosts, seenPostIds, {
        includeSeen: includeSeenInFeed,
        churnSeed: homeFeedChurnSeed,
        preferLiveFirst: preferLiveTimelineFirst
      });
    }
    if (page !== "home") return mergeFeedById(live, canonicalMixerPosts);
    return mergeFeedWithUnseenCanonicalFirst(live, canonicalMixerPosts, seenPostIds, {
      includeSeen: includeSeenInFeed,
      churnSeed: homeFeedChurnSeed,
      preferLiveFirst: preferLiveTimelineFirst
    });
  }, [
    refined,
    canonicalMixerPosts,
    page,
    seenPostIds,
    includeSeenInFeed,
    homeFeedChurnSeed,
    preferLiveTimelineFirst
  ]);

  const feedPostsBase = useMemo(
    () =>
      buildMixerFeedPostsBase({
        platform: platformForMixer,
        refined: refinedForMixer,
        mainTab,
        corpusTimeScope,
        topRank,
        topicPrefs: feedtrixPrefs
      }),
    [platformForMixer, refinedForMixer, mainTab, topRank, corpusTimeScope, feedtrixPrefs]
  );

  const feedPosts = useMemo(() => {
    if (includeSeenInFeed) return feedPostsBase;
    return feedPostsBase.filter((t) => !seenPostIds.has(String(t.id)));
  }, [feedPostsBase, seenPostIds, includeSeenInFeed]);

  const feedPagingNonce = useMemo(() => {
    if (page !== "home" && page !== "explore") return "off";
    const f = feedPosts;
    if (!f.length) return `${page}|${mainTab}|0`;
    return `${page}|${mainTab}|${corpusTimeScope}|${topRank}|${f.length}|${String(f[0]?.id)}|${String(f[f.length - 1]?.id)}`;
  }, [page, mainTab, corpusTimeScope, topRank, feedPosts]);

  useEffect(() => {
    setFeedVisibleCap(FEED_RENDER_BATCH);
  }, [feedPagingNonce]);

  const feedPostsWindowed = useMemo(
    () => feedPosts.slice(0, feedVisibleCap),
    [feedPosts, feedVisibleCap]
  );

  const loadMoreHomeTimeline = useCallback(async () => {
    if (loadingMoreHome || loading) return;
    if (page !== "home") return;

    if (feedVisibleCap < feedPosts.length) {
      setFeedVisibleCap((c) => Math.min(c + FEED_RENDER_BATCH, feedPosts.length));
      return;
    }

    if (homeFeedMode !== "live" || !homeTimelineNextToken || me?.connected !== true) return;

    setLoadingMoreHome(true);
    setErr(null);
    try {
      const payloadRaw = await fetchForYou({
        recencyWeight,
        strictMatch,
        maxResults,
        paginationToken: homeTimelineNextToken
      });
      const payload = await attachFeedtrixCorpus(payloadRaw);
      const plat = filterLiveHomeTimelinePosts(payload.platform_style ?? []);
      const ref = filterLiveHomeTimelinePosts(payload.refined ?? []);
      setPlatform((p) => mergeFeedById(p ?? [], plat));
      setRefined((r) => mergeFeedById(r ?? [], ref));
      setHomeTimelineNextToken(payload.homeTimelineNextToken ?? null);
      void persistComparePayload(payload);
      setFeedRemixEpoch((e) => e + 1);
      setFeedVisibleCap((c) => c + FEED_RENDER_BATCH);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load more timeline");
    } finally {
      setLoadingMoreHome(false);
    }
  }, [
    loadingMoreHome,
    loading,
    page,
    feedVisibleCap,
    feedPosts.length,
    homeFeedMode,
    xaiConfigured,
    homeTimelineNextToken,
    me,
    recencyWeight,
    strictMatch,
    maxResults
  ]);

  const loadMoreLiveSessionsPage = useCallback(async () => {
    const list = page === "spaces" ? grokLiveSpaces : grokLiveBroadcasts;
    const total = page === "spaces" ? liveSessionsTotalSpaces : liveSessionsTotalBroadcasts;
    if (liveSessionsVisibleCap < list.length) {
      setLiveSessionsVisibleCap((c) => Math.min(c + LIVE_SESSION_RENDER_BATCH, list.length));
      return;
    }
    if (list.length >= total && total > 0) return;
    if (loadingMoreLiveSessions || grokLiveSessionsLoading || xaiConfigured !== true) return;
    setLoadingMoreLiveSessions(true);
    try {
      const d = await fetchLiveSessions({
        nSpaces: 100,
        nBroadcasts: 100,
        live: xaiLiveSearch
      });
      const spaces = (d.spaces ?? []) as LiveSessionRow[];
      const broadcasts = (d.broadcasts ?? []) as LiveSessionRow[];
      setGrokLiveSpaces((prev) => mergeLiveSessionRowsLocal(prev, spaces));
      setGrokLiveBroadcasts((prev) => mergeLiveSessionRowsLocal(prev, broadcasts));
      setLiveSessionsTotalSpaces(d.totalSpaces ?? spaces.length);
      setLiveSessionsTotalBroadcasts(d.totalBroadcasts ?? broadcasts.length);
      setLiveSessionsVisibleCap((c) => c + LIVE_SESSION_RENDER_BATCH);
    } finally {
      setLoadingMoreLiveSessions(false);
    }
  }, [
    page,
    grokLiveSpaces,
    grokLiveBroadcasts,
    liveSessionsTotalSpaces,
    liveSessionsTotalBroadcasts,
    liveSessionsVisibleCap,
    loadingMoreLiveSessions,
    grokLiveSessionsLoading,
    xaiConfigured,
    xaiLiveSearch
  ]);

  useEffect(() => {
    if (page !== "home" && page !== "explore") return;
    if (mainTab !== "top" && mainTab !== "latest" && mainTab !== "media") return;
    const el = feedInfiniteSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (page === "home") void loadMoreHomeTimeline();
        else {
          setFeedVisibleCap((c) => {
            if (c >= feedPosts.length) return c;
            return Math.min(c + FEED_RENDER_BATCH, feedPosts.length);
          });
        }
      },
      { root: null, rootMargin: "480px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [page, mainTab, feedPosts.length, feedVisibleCap, loadMoreHomeTimeline]);

  useEffect(() => {
    if (page !== "spaces" && page !== "broadcasts") return;
    const el = liveSessionsSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMoreLiveSessionsPage();
      },
      { root: null, rootMargin: "480px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [page, loadMoreLiveSessionsPage, grokLiveSpaces.length, grokLiveBroadcasts.length, liveSessionsVisibleCap]);

  const grokLiveRailRows = useMemo(() => {
    const base = buildGrokLiveRailRows(grokLiveSpaces, grokLiveBroadcasts);
    if (includeSeenInFeed) return base;
    return base.filter((r) => !seenLiveKeys.has(liveSessionSeenKeyFromRow(r)));
  }, [grokLiveSpaces, grokLiveBroadcasts, seenLiveKeys, includeSeenInFeed]);

  const grokLiveSpacesVisible = useMemo(() => {
    const base = includeSeenInFeed
      ? grokLiveSpaces
      : grokLiveSpaces.filter((r) => !seenLiveKeys.has(liveSessionSeenKeyFromRow(r)));
    return base.slice(0, liveSessionsVisibleCap);
  }, [grokLiveSpaces, seenLiveKeys, includeSeenInFeed, liveSessionsVisibleCap]);

  const grokLiveBroadcastsVisible = useMemo(() => {
    const base = includeSeenInFeed
      ? grokLiveBroadcasts
      : grokLiveBroadcasts.filter((r) => !seenLiveKeys.has(liveSessionSeenKeyFromRow(r)));
    return base.slice(0, liveSessionsVisibleCap);
  }, [grokLiveBroadcasts, seenLiveKeys, includeSeenInFeed, liveSessionsVisibleCap]);

  const liveRailLiveSearchHint = useMemo(() => {
    if (xaiConfigured !== true) return null;
    if (grokLiveSessionsMeta) return grokLiveSessionsMeta.liveSearch;
    return xaiLiveSearch;
  }, [xaiConfigured, grokLiveSessionsMeta, xaiLiveSearch]);

  const liveRailErrorNote = useMemo(() => {
    if (xaiConfigured === false) {
      return "Add XAI_API_KEY on the server to load live Spaces and Broadcasts from Grok.";
    }
    if (xaiConfigured === null) return null;
    return grokLiveSessionsError;
  }, [xaiConfigured, grokLiveSessionsError]);

  const subtitle = useMemo(
    () =>
      "Stronger textual + phrase match + recency versus engagement-heavy ordering—same corpus, transparent scores.",
    []
  );

  async function attachFeedtrixCorpus(pl: ComparePayload): Promise<ComparePayload> {
    if (isRealDataOnly() && pl.feed === "home_reverse_chronological") return pl;
    try {
      const prefs = await loadFeedtrixPrefs();
      setFeedtrixPrefs(prefs);
      const fx = await loadFeedtrixPostsForMergedFeed(prefs);
      if (!fx.length) return pl;
      const platform_style = mergeFeedById(fx, pl.platform_style ?? []);
      const refinedIn = mergeFeedById(fx, pl.refined ?? []);
      return {
        ...pl,
        platform_style,
        refined: refinedIn,
        corpusSize: platform_style.length
      };
    } catch {
      return pl;
    }
  }

  async function run() {
    const query = q.trim();
    if (!query) return;

    setLoading(true);
    setErr(null);

    try {
      const payload = await fetchCompare({
        q: query,
        source,
        recencyWeight,
        strictMatch,
        maxResults,
        omitRetweets
      });
      setPlatform(payload.platform_style ?? []);
      setRefined(payload.refined ?? []);
      setMeta({
        corpusSize: payload.corpusSize,
        source: payload.source,
        note: payload.note,
        omitRetweets: payload.omitRetweets,
        liveAuth: payload.liveAuth,
        feed: undefined
      });
      setPage("explore");
      const nu = new URL(window.location.href);
      nu.searchParams.set("q", query);
      nu.searchParams.set("source", source);
      nu.searchParams.set("tab", mainTab);
      nu.searchParams.set("page", "explore");
      window.history.replaceState({}, "", nu.toString());
      void persistComparePayload(payload);
      void ingestCanonicalFromComparePayload(payload, {
        rankingLab: { recencyWeight, strictMatch, maxResults }
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function runForYou() {
    if (homeFeedMode === "xai") {
      if (xaiConfigured === false) {
        setErr("xAI is not configured on this API server. Add XAI_API_KEY to the server .env (see .env.example).");
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const payloadRaw = await fetchForYou({
          recencyWeight,
          strictMatch,
          maxResults: XAI_HOME_BATCH,
          xai: true,
          xaiLive: xaiLiveSearch
        });
      const payload = await attachFeedtrixCorpus(payloadRaw);
      const plat = filterLiveHomeTimelinePosts(payload.platform_style ?? []);
      const ref = filterLiveHomeTimelinePosts(payload.refined ?? []);
      setPlatform(plat);
      setRefined(ref);
      setMeta({
        corpusSize: plat.length,
        source: "mock",
        note: payload.note,
        omitRetweets: undefined,
        liveAuth: payload.liveAuth,
        feed: "home_reverse_chronological",
        homeDataSource: payload.homeDataSource
      });
      const nu = new URL(window.location.href);
      nu.searchParams.set("page", "home");
      nu.searchParams.set("tab", mainTab);
      nu.searchParams.set("home", "xai");
        nu.searchParams.set("source", "mock");
        nu.searchParams.delete("q");
        window.history.replaceState({}, "", nu.toString());
        sessionStorage.setItem("ix_home_feed_mode", "xai");
        void persistComparePayload(payload);
        void ingestCanonicalFromComparePayload(payload, {
          rankingLab: { recencyWeight, strictMatch, maxResults: XAI_HOME_BATCH }
        });
        setFeedRemixEpoch((e) => e + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
      return;
    }

    const useSeed = homeFeedMode === "seed";
    if (!useSeed) {
      if (me?.connected !== true) {
        setErr("Sign in with X to load your home timeline.");
        return;
      }
      if (me.connected === true && me.profileFetchError) {
        setErr(me.profileFetchError);
        return;
      }
    }
    setLoading(true);
    setErr(null);
    setHomeTimelineNextToken(null);
    try {
      const payloadRaw = await fetchForYou({
        recencyWeight,
        strictMatch,
        maxResults,
        mock: useSeed
      });
      const payload = await attachFeedtrixCorpus(payloadRaw);
      const platRaw = payload.platform_style ?? [];
      const refRaw = payload.refined ?? [];
      const plat =
        !useSeed && isRealDataOnly() ? filterLiveHomeTimelinePosts(platRaw) : platRaw;
      const ref = !useSeed && isRealDataOnly() ? filterLiveHomeTimelinePosts(refRaw) : refRaw;
      setPlatform(plat);
      setRefined(ref);
      setMeta({
        corpusSize: plat.length,
        source: useSeed ? "mock" : "live",
        note: payload.note,
        omitRetweets: undefined,
        liveAuth: payload.liveAuth,
        feed: "home_reverse_chronological",
        homeDataSource: payload.homeDataSource
      });
      setHomeTimelineNextToken(payload.homeTimelineNextToken ?? null);
      const nu = new URL(window.location.href);
      nu.searchParams.set("page", "home");
      nu.searchParams.set("tab", mainTab);
      nu.searchParams.set("home", useSeed ? "seed" : "live");
      nu.searchParams.set("source", useSeed ? "mock" : "live");
      nu.searchParams.delete("q");
      window.history.replaceState({}, "", nu.toString());
      sessionStorage.setItem("ix_home_feed_mode", useSeed ? "seed" : "live");
      void persistComparePayload(payload);
      void ingestCanonicalFromComparePayload(payload, {
        rankingLab: { recencyWeight, strictMatch, maxResults }
      });
      setFeedRemixEpoch((e) => e + 1);
      /* Live X is the fast path; kick Pipetrix (Grok topic batches) once so interest posts start filling canonical. */
      if (!useSeed && !isRealDataOnly() && xaiConfigured === true) {
        void runSingleFeedtrixBackgroundTick(feedtrixPrefsRef.current, xaiLiveSearch);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  /** First visit to Home with an empty local corpus: pull once from the selected timeline source. */
  useEffect(() => {
    if (!enteredApp || page !== "home" || homeMixerAutoFetchRef.current) return;
    if (loading || (platform?.length ?? 0) > 0) return;
    if (apiReachable !== true) return;

    if (homeFeedMode === 'seed') {
      homeMixerAutoFetchRef.current = true;
      void runForYou();
      return;
    }

    if (homeFeedMode === "live" && me?.connected === true && !hasProfileFetchError(me)) {
      homeMixerAutoFetchRef.current = true;
      void runForYou();
      return;
    }
    if (homeFeedMode === "xai" && xaiConfigured === true) {
      homeMixerAutoFetchRef.current = true;
      void runForYou();
    }
  }, [
    enteredApp,
    page,
    loading,
    platform?.length,
    canonicalMixerPosts.length,
    apiReachable,
    homeFeedMode,
    me,
    xaiConfigured
  ]);

  const loadMoreGrok = useCallback(async () => {
    if (homeFeedMode !== "xai" || loading || loadingMoreGrok || xaiConfigured === false) return;
    setLoadingMoreGrok(true);
    setErr(null);
    try {
      const payload = await fetchForYou({
        recencyWeight,
        strictMatch,
        maxResults: XAI_HOME_BATCH,
        xai: true,
        xaiLive: xaiLiveSearch
      });
      const addP = payload.platform_style ?? [];
      const addR = payload.refined ?? [];
      setPlatform((p) => mergeFeedById(p ?? [], addP));
      setRefined((r) => mergeFeedById(r ?? [], addR));
      void persistComparePayload(payload);
      void ingestCanonicalFromComparePayload(payload, {
        sourceOverride: "grok_mixer",
        rankingLab: { recencyWeight, strictMatch, maxResults: XAI_HOME_BATCH }
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load more posts");
    } finally {
      setLoadingMoreGrok(false);
    }
  }, [
    homeFeedMode,
    loading,
    loadingMoreGrok,
    xaiConfigured,
    recencyWeight,
    strictMatch,
    xaiLiveSearch
  ]);

  useEffect(() => {
    if (homeFeedMode !== "xai" || !meta || !platform) return;
    if (meta.corpusSize === platform.length) return;
    setMeta((m) => (m ? { ...m, corpusSize: platform.length } : null));
  }, [homeFeedMode, meta, platform]);

  useEffect(() => {
    const syncXgGame = () => setXgGameRail(readXGamingGameIdFromUrl());
    syncXgGame();
    window.addEventListener("popstate", syncXgGame);
    window.addEventListener(XGAMING_GAME_CHANGE_EVENT, syncXgGame as EventListener);
    return () => {
      window.removeEventListener("popstate", syncXgGame);
      window.removeEventListener(XGAMING_GAME_CHANGE_EVENT, syncXgGame as EventListener);
    };
  }, []);

  useEffect(() => {
    if (page === "xgaming") setXgGameRail(readXGamingGameIdFromUrl());
  }, [page]);

  useEffect(() => {
    if (page !== "home" || homeFeedMode !== "xai") return;
    const el = grokScrollSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMoreGrok();
      },
      { root: null, rootMargin: "480px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [page, homeFeedMode, loadMoreGrok, platform?.length]);

  function patchTabWindowInUrl(which: TabWindowKey, value: LatestWindow) {
    const nu = new URL(window.location.href);
    if (value === "all") nu.searchParams.delete(which);
    else nu.searchParams.set(which, value);
    if (which !== "tw_latest") {
      nu.searchParams.delete("latest");
    }
    window.history.replaceState({}, "", nu.toString());
  }

  function setTabWindow(which: TabWindowKey, value: LatestWindow) {
    if (which === "tw_top") setTwTop(value);
    else if (which === "tw_latest") setTwLatest(value);
    else setTwMedia(value);
    patchTabWindowInUrl(which, value);
  }

  function syncUrlQueryForPage(nu: URL, targetPage: AppPage) {
    if (targetPage === "explore") {
      if (q.trim()) nu.searchParams.set("q", q.trim());
    } else {
      nu.searchParams.delete("q");
      nu.searchParams.delete("source");
    }
  }

  function updateUrlTab(tab: MainTab) {
    setMainTab(tab);
    const nu = new URL(window.location.href);
    nu.searchParams.set("page", page);
    syncUrlQueryForPage(nu, page);
    nu.searchParams.set("tab", tab);
    window.history.replaceState({}, "", nu.toString());
  }

  function goPage(next: AppPage) {
    if (page === "trott") {
      sessionStorage.setItem(ENTERED_KEY, "1");
      setEnteredApp(true);
    }
    setPage(next);
    setMoreMenuOpen(false);
    setMeMenuOpen(false);
    const nu = new URL(window.location.href);
    nu.searchParams.set("page", next);
    nu.hash = '';
    syncUrlQueryForPage(nu, next);
    if (next === "xgaming") {
      if (!nu.searchParams.get("xgtab")) nu.searchParams.set("xgtab", "ladder");
    }
    nu.searchParams.set("tab", mainTab);
    window.history.replaceState({}, "", nu.toString());
  }

  const TAB_LABELS: { key: MainTab; label: string }[] = [
    { key: "top", label: "Top" },
    { key: "latest", label: "Latest" },
    { key: "people", label: "People" },
    { key: "media", label: "Media" },
    { key: "lists", label: "Lists" }
  ];

  const TAB_WINDOW_MENU_OPTIONS: { value: LatestWindow; label: string }[] = [
    { value: "all", label: "All corpus" },
    { value: "day", label: "Past 24 hours" },
    { value: "week", label: "Past 7 days" },
    { value: "month", label: "Past 30 days" }
  ];

  const corpusForDerivatives = mergeFeedById(platform ?? refined ?? [], canonicalMixerPosts);

  const hasApiTimelinePosts = (platform?.length ?? 0) > 0;
  const hasMixerCanonicalPool = canonicalMixerPosts.length > 0;
  /** Grok/For-You HTTP corpus or local TheFeedtrix canonical rows (whichever is present). */
  const hasMixerEligibleCorpus = hasApiTimelinePosts || hasMixerCanonicalPool;
  /**
   * Don’t trap the UI behind “Load timeline” when RxDB already has canonical posts merged into the mixer.
   * (Older gate was `!platform?.length`, which ignored TheFeedtrix until the first API load.)
   */
  const showTimelineEmptyCta =
    (page === "home" || page === "explore") && !hasApiTimelinePosts && !hasMixerCanonicalPool;

  const showFeedTimeline =
    page === "home" || page === "explore" || page === "spaces" || page === "broadcasts";

  const peopleRows = corpusForDerivatives.length ? uniquePeople(corpusForDerivatives) : [];

  return (
    <>
      {apiReachable === false ? (
        <div className="ix-api-banner" role="alert">
          <strong className="ix-api-banner-title">API server not reachable.</strong>
          <span className="ix-api-banner-body">
            {apiOrigin() ? (
              <>
                The UI is calling <code>{apiUrlAbsolute("/api/health")}</code> but got no response. Confirm your API
                host is up and CORS is allowed for <code>{typeof window !== "undefined" ? window.location.origin : ""}</code>
                .
              </>
            ) : (
              <>
                This app proxies <code>/api</code> to <code>http://localhost:3847</code>. From the project root run{" "}
                <code>npm run dev</code> (starts Vite + API). If you only started the frontend, run{" "}
                <code>npm run dev:server</code> in another terminal.
              </>
            )}
          </span>
        </div>
      ) : null}
      {!enteredApp && page !== "trott" ? (
        <XAuthLanding
          apiReachable={apiReachable}
          oauthClientConfigured={oauthClientConfigured}
          authError={err}
          onDismissAuthError={() => setErr(null)}
          onContinue={() => {
            sessionStorage.setItem(ENTERED_KEY, "1");
            setEnteredApp(true);
          }}
        />
      ) : (
        <div className={layoutMode === "stream" ? "ix-app ix-app--stream" : "ix-app ix-app--classic"}>
      <aside className="ix-rail ix-rail--left">
        <div className="ix-rail-scroll">
          <div className="ix-brand">
            <span className="ix-logo-mark" title="iFixedX">
              <IconLogoX />
            </span>
            <span className="ix-wordmark">iFixedX</span>
          </div>
          <nav className="ix-nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const active = item.kind === "page" && page === item.page;
              if (item.kind === "stub") {
                return (
                  <a key={item.id} href="#" className="ix-nav-link" onClick={(e) => e.preventDefault()}>
                    <span className="ix-nav-icon">
                      <item.Icon />
                    </span>
                    <span className="ix-nav-label">{item.label}</span>
                  </a>
                );
              }
              return (
                <a
                  key={item.id}
                  href={`?page=${item.page}`}
                  className={`ix-nav-link ${active ? "ix-nav-link--active" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goPage(item.page);
                  }}
                >
                  <span className="ix-nav-icon">
                    <item.Icon />
                  </span>
                  <span className="ix-nav-label">{item.label}</span>
                </a>
              );
            })}
          </nav>
        </div>
        <div className="ix-rail-pinned">
          <div className="ix-more-wrap" ref={moreMenuRef}>
            <button
              type="button"
              className="ix-more ix-nav-link"
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setMeMenuOpen(false);
                setMoreMenuOpen((o) => !o);
              }}
            >
              <span className="ix-nav-icon">
                <IconDots />
              </span>
              <span className="ix-nav-label">More</span>
            </button>
            {moreMenuOpen ? (
              <div className="ix-me-dropdown ix-me-dropdown--up" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="ix-me-dropdown-item"
                  onClick={() => {
                    goPage("account");
                    setMoreMenuOpen(false);
                  }}
                >
                  Account
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="ix-me-dropdown-item"
                  onClick={() => {
                    goPage("ranking");
                    setMoreMenuOpen(false);
                  }}
                >
                  Ranking lab
                </button>
                <div className="ix-more-feedtrix-divider ix-muted ix-fineprint" aria-hidden>
                  The Pipetrix (local DB)
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="ix-me-dropdown-item"
                  onClick={() => {
                    setFeedtrixModalOpen(true);
                    setMoreMenuOpen(false);
                  }}
                >
                  Category settings…
                </button>
                <div className="ix-more-topics" role="group" aria-label="Topic toggles">
                  {FEEDTRIX_TOPICS.map((tp) => {
                    const checked = feedtrixPrefs[tp.id] !== false;
                    return (
                      <label key={tp.id} className="ix-more-topic-line">
                        <span className="ix-more-topic-text">
                          <span aria-hidden>{tp.icon}</span> {tp.label}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            setFeedtrixPrefs((prev) => ({ ...prev, [tp.id]: enabled }));
                            void saveFeedtrixTopicEnabled(tp.id, enabled);
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="ix-me-dropdown-item"
                  disabled={twitterSpiderBusy}
                  onClick={() => {
                    setTwitterSpiderBusy(true);
                    setTwitterSpiderNote(null);
                    void (async () => {
                      try {
                        const hunt = await runTwitterSpiderNow();
                        const pulled = await pullServerPipetrixIntoLocal();
                        setTwitterSpiderNote(
                          `${hunt.summary}${pulled > 0 ? ` · ${pulled} into Pipetrix` : ""}`
                        );
                      } catch (e) {
                        setTwitterSpiderNote(
                          e instanceof Error ? e.message : "TwitterSpider failed"
                        );
                      } finally {
                        setTwitterSpiderBusy(false);
                        setMoreMenuOpen(false);
                      }
                    })();
                  }}
                >
                  {twitterSpiderBusy ? "TwitterSpider hunting…" : "Run TwitterSpider now"}
                </button>
                {twitterSpiderNote ? (
                  <p className="ix-muted ix-fineprint ix-more-spider-note">{twitterSpiderNote}</p>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="ix-me-dropdown-item"
                  onClick={() => {
                    setLayoutMode((m) => (m === "stream" ? "classic" : "stream"));
                    setMoreMenuOpen(false);
                  }}
                >
                  {layoutMode === "stream" ? "Classic X layout" : "Stream layout (Explore)"}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="ix-post-big">
            Post
          </button>
        </div>
        <div className="ix-rail-account">
          <div className="ix-me-shelf">
            <div
              className={`ix-me${me?.connected === true ? "" : " ix-me--guest"}`}
              role={me?.connected === true ? undefined : "button"}
              tabIndex={me?.connected === true ? -1 : 0}
              onClick={() => {
                if (me?.connected === true) return;
                window.location.href = apiUrlAbsolute("/api/auth/x/login");
              }}
              onKeyDown={(e) => {
                if (me?.connected === true) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  window.location.href = apiUrlAbsolute("/api/auth/x/login");
                }
              }}
            >
              {me?.connected === true ? (
                <>
                  <div className="ix-avatar ix-avatar--sm">
                    {"username" in me && me.username ? (
                      <AvatarWithFallbacks
                        author={me.name ?? me.username}
                        handle={me.username}
                        avatarUrl={me.profile_image_url?.replace(
                          /_normal(\.(jpg|jpeg|png|webp))$/i,
                          "_400x400$1"
                        )}
                        className="ix-avatar-img"
                        imgLoading="eager"
                        initialsFallback={initials(me.name ?? "", me.username)}
                      />
                    ) : (
                      "✓"
                    )}
                  </div>
                  <div className="ix-me-text">
                    <div className="ix-name">
                      {"username" in me && me.username ? me.name || me.username : "Signed in"}
                    </div>
                    <div className="ix-handle">
                      {"username" in me && me.username ? `@${me.username}` : "OAuth tokens on this machine"}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="ix-avatar ix-avatar--sm">+</div>
                  <div className="ix-me-text">
                    <div className="ix-name">Guest</div>
                    <div className="ix-handle">Sign in with X</div>
                  </div>
                </>
              )}
            </div>
            <div className="ix-me-kebab-wrap" ref={meMenuRef}>
              <button
                type="button"
                className="ix-me-kebab"
                aria-expanded={meMenuOpen}
                aria-haspopup="menu"
                aria-label="Account and timeline menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoreMenuOpen(false);
                  setMeMenuOpen((o) => !o);
                }}
              >
                <IconDots />
              </button>
              {meMenuOpen ? (
                <div className="ix-me-dropdown" role="menu">
                  {page === "home" ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="ix-me-dropdown-item"
                      disabled={
                        loading ||
                        (homeFeedMode === "live" &&
                          (me?.connected !== true || hasProfileFetchError(me))) ||
                        (homeFeedMode === "xai" && xaiConfigured === false)
                      }
                      onClick={() => {
                        setMeMenuOpen(false);
                        void runForYou();
                      }}
                    >
                      {loading ? "Loading timeline…" : "Load timeline"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="ix-me-dropdown-item"
                    onClick={() => {
                      goPage("ranking");
                      setMeMenuOpen(false);
                    }}
                  >
                    Ranking lab
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="ix-me-dropdown-item"
                    onClick={() => {
                      goPage("account");
                      setMeMenuOpen(false);
                    }}
                  >
                    Account
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {me?.connected === true ? (
            <button
              type="button"
              className="ix-signout ix-signout--rail"
              disabled={signingOut || apiReachable === false}
              onClick={() => void signOut()}
            >
              {signingOut ? "…" : "Sign out"}
            </button>
          ) : null}
        </div>
      </aside>

      <main className="ix-main">
        {(page === "explore" ||
          page === "account" ||
          page === "ranking" ||
          page === "spaces" ||
          page === "broadcasts" ||
          page === "xgaming" ||
          page === "home") ? (
        <header className={`ix-main-head${page === "home" ? " ix-main-head--home" : ""}`}>
          {page === "explore" ? (
            <div className="ix-search-shell">
              <IconSearch />
              <input
                className="ix-search-input"
                type="text"
                value={q}
                placeholder="Search"
                aria-label="Search query"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void run();
                }}
              />
              <button
                type="button"
                className="ix-search-go"
                disabled={loading || !q.trim()}
                onClick={() => void run()}
              >
                {loading ? "…" : "Search"}
              </button>
            </div>
          ) : page === "account" || page === "ranking" ? (
            <div className="ix-search-shell ix-home-bar">
              {page === "account" ? <IconUser /> : <IconSparkles />}
              <div className="ix-home-bar-text">
                <span className="ix-home-bar-title">{page === "account" ? "Account" : "Ranking lab"}</span>
                <span className="ix-home-bar-sub ix-muted">
                  {page === "account"
                    ? "Linked X session and sign-out"
                    : "Tune recency, corpus size, and anti-spam for your feeds"}
                </span>
              </div>
            </div>
          ) : page === "xgaming" ? (
            <div className="ix-search-shell ix-home-bar">
              <IconGamepad />
              <div className="ix-home-bar-text">
                <span className="ix-home-bar-title">XGaming</span>
                <span className="ix-home-bar-sub ix-muted">
                  Ladders, classic server directory, and Heat.net-style skill ranks — nostalgia lane for LAN-era MP.
                </span>
              </div>
            </div>
          ) : page === "spaces" || page === "broadcasts" ? (
            <div className="ix-search-shell ix-home-bar">
              <IconSparkles />
              <div className="ix-home-bar-text">
                <span className="ix-home-bar-title">{page === "spaces" ? "All Spaces" : "All Broadcasts"}</span>
                <span className="ix-home-bar-sub ix-muted">
                  {page === "spaces" ? (
                    <>
                      Live X Spaces from Grok (xAI). Links open the Space on X; enable live search in Ranking lab for
                      fresher results when your server supports it.
                    </>
                  ) : (
                    <>
                      Live X Broadcasts from Grok (xAI). Links open the broadcast on X; live search follows the same toggle
                      as the Grok timeline.
                    </>
                  )}
                </span>
              </div>
            </div>
          ) : page === "home" ? (
            <div className="ix-search-shell ix-home-bar">
              <IconHome />
              <div className="ix-home-bar-text">
                <span className="ix-home-bar-title">Home</span>
                <span className="ix-home-bar-sub ix-muted">For You — pick a timeline source under the tabs</span>
              </div>
            </div>
          ) : null}
          {(page === "home" || page === "explore") && meta ? (
            <p className="ix-corpus-hint">
              {meta.feed === "home_reverse_chronological" ? (
                <>
                  Home · {homeDataSourceLabel(meta.homeDataSource)}{" "}
                  · {meta.corpusSize} posts
                  {meta.liveAuth === "user_oauth" ? " · your OAuth session" : null}
                </>
              ) : (
                <>
                  {meta.source === "live" ? "Live API" : "Mock"} · {meta.corpusSize} posts
                  {meta.source === "live" && meta.liveAuth === "user_oauth"
                    ? " · token: your X session"
                    : meta.source === "live" && meta.liveAuth === "app_bearer"
                      ? " · token: app bearer"
                      : null}
                  {meta.omitRetweets ? " · −RT" : ""}
                </>
              )}
              {meta.note ? <> · {meta.note}</> : null}
            </p>
          ) : null}
        </header>
        ) : null}

        {(page === "home" || page === "explore") ? (
          <>
            <nav
              ref={homeExploreTabsNavRef}
              className="ix-tabs ix-tabs--timed"
              role="tablist"
              aria-label={page === "home" ? "Home feed" : "Search filters"}
            >
              {TAB_LABELS.map(({ key, label }) => {
                const timed = key === "top" || key === "latest" || key === "media";
                const wk: TabWindowKey | null =
                  key === "top"
                    ? "tw_top"
                    : key === "latest"
                      ? "tw_latest"
                      : key === "media"
                        ? "tw_media"
                        : null;
                const currentWindow =
                  key === "top"
                    ? twTop
                    : key === "latest"
                      ? twLatest
                      : key === "media"
                        ? twMedia
                        : "all";
                const menuOpen = timed && tabTimeMenuKey === key;
                return (
                  <div
                    key={key}
                    className={`ix-tab-pack ${mainTab === key ? "ix-tab-pack--on" : ""}${menuOpen ? " ix-tab-pack--menu-open" : ""}`}
                  >
                    <button
                      role="tab"
                      type="button"
                      className={`ix-tab ${timed ? "ix-tab--timed" : ""} ${mainTab === key ? "ix-tab--on" : ""}`}
                      aria-selected={mainTab === key}
                      aria-haspopup={timed ? "menu" : undefined}
                      aria-expanded={timed ? menuOpen : undefined}
                      onClick={() => {
                        if (!timed || !wk) {
                          updateUrlTab(key);
                          setTabTimeMenuKey(null);
                          return;
                        }
                        if (mainTab !== key) {
                          updateUrlTab(key);
                          setTabTimeMenuKey(null);
                          return;
                        }
                        setTabTimeMenuKey((open) => (open === key ? null : key));
                      }}
                    >
                      <span className="ix-tab-label">{label}</span>
                      {timed ? (
                        <span className="ix-tab-chevron" aria-hidden>
                          ▼
                        </span>
                      ) : null}
                    </button>
                    {timed && wk && menuOpen ? (
                      <div className="ix-tab-time-menu" role="menu" aria-label={`${label} time range`}>
                        {TAB_WINDOW_MENU_OPTIONS.map(({ value: v, label: optLabel }) => (
                          <button
                            key={v}
                            type="button"
                            role="menuitemradio"
                            aria-checked={currentWindow === v}
                            className={
                              currentWindow === v ? "ix-tab-time-option ix-tab-time-option--on" : "ix-tab-time-option"
                            }
                            onClick={() => {
                              setTabWindow(wk, v);
                              setTabTimeMenuKey(null);
                            }}
                          >
                            {optLabel}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            {page === "home" ? (
              <div className="ix-home-source-strip">
                <label className="ix-home-source-field" htmlFor="ix-home-feed-source">
                  <span className="ix-home-source-label">Timeline source</span>
                  <HomeFeedSourceSelect
                    id="ix-home-feed-source"
                    className="ix-latest-select ix-home-source-select"
                    value={homeFeedMode}
                    onChange={setHomeFeedMode}
                    syncUrl
                    xaiConfigured={xaiConfigured}
                    ariaLabel="Home timeline source: Live X, Grok, or offline seed"
                  />
                </label>
                <button
                  type="button"
                  className="ix-link-btn ix-home-source-advanced"
                  onClick={() => goPage("ranking")}
                >
                  Ranking lab — weights &amp; more
                </button>
                {xaiConfigured === false ? (
                  <span className="ix-home-source-hint ix-muted ix-fineprint">
                    Grok needs <code>XAI_API_KEY</code> on the API server.
                  </span>
                ) : null}
              </div>
            ) : null}

            {mainTab === "top" ? (
              <div className="ix-rank-strip">
                <span className="ix-rank-strip-label">Ranking for Top:</span>
                <button
                  type="button"
                  className={topRank === "platform" ? "ix-chip ix-chip--on" : "ix-chip"}
                  onClick={() => setTopRank("platform")}
                >
                  Default (engagement-style)
                </button>
                <button
                  type="button"
                  className={topRank === "refined" ? "ix-chip ix-chip--ifix" : "ix-chip"}
                  onClick={() => setTopRank("refined")}
                >
                  iFixedX rank
                </button>
                {topRank === "refined" && (
                  <div className="ix-refined-stats" style={{ marginTop: 6, fontSize: 12, color: "#888" }}>
                    Refined scoring active — {feedPosts.filter((p: any) => p.refinedScoring).length} / {feedPosts.length} posts have refinedScoring data
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {page === "spaces" || page === "broadcasts" ? (
          <nav className="ix-tabs" role="tablist" aria-label="Live directory">
            <button
              type="button"
              role="tab"
              className={`ix-tab ${page === "spaces" ? "ix-tab--on" : ""}`}
              aria-selected={page === "spaces"}
              onClick={() => goPage("spaces")}
            >
              All Spaces
            </button>
            <button
              type="button"
              role="tab"
              className={`ix-tab ${page === "broadcasts" ? "ix-tab--on" : ""}`}
              aria-selected={page === "broadcasts"}
              onClick={() => goPage("broadcasts")}
            >
              All Broadcasts
            </button>
          </nav>
        ) : null}

        <div
          key={page}
          className={`ix-feed${
            page === "ranking"
              ? " ix-feed--ranking-lab"
              : page === "spaces" || page === "broadcasts"
                ? " ix-feed--masonry"
                : page === "home" && (mainTab === "top" || mainTab === "latest" || mainTab === "media")
                  ? " ix-feed--home-shell"
                  : ""
          }`}
        >
          {page === "trott" ? <Trott /> : page === "account" ? (
            <div className="ix-page-panel">
              <div className="ix-widget">
                <h3 className="ix-widget-title">X account</h3>
                {apiReachable === false ? (
                  <p className="ix-muted" style={{ marginTop: 0 }}>
                    Start the API (<code>npm run dev</code>) to enable sign-in and live search checks.
                  </p>
                ) : me?.connected === true ? (
                  <>
                    {me.profileFetchError ? (
                      <p className="ix-warn" style={{ marginTop: 0, marginBottom: 8 }}>
                        {me.profileFetchError}
                      </p>
                    ) : null}
                    <p className="ix-muted" style={{ marginTop: 0 }}>
                      Linked as{" "}
                      {"username" in me && me.username ? (
                        <strong style={{ color: "var(--ix-text)" }}>@{me.username}</strong>
                      ) : (
                        <span>X (OAuth on server)</span>
                      )}
                    </p>
                    <p className="ix-muted ix-fineprint">
                      Tokens are stored <strong>on this API server</strong>, not in your browser. Use{" "}
                      <strong>Sign out</strong> to clear the server session for this site.
                    </p>
                    <button
                      type="button"
                      className="ix-widget-cta"
                      style={{
                        background: "var(--ix-chip)",
                        color: "var(--ix-text)",
                        border: "1px solid var(--ix-border)"
                      }}
                      disabled={signingOut}
                      onClick={() => void signOut()}
                    >
                      {signingOut ? "…" : "Sign out"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="ix-muted" style={{ marginTop: 0 }}>
                      Sign in with X stores OAuth tokens <strong>on this server</strong> (one linked account for this
                      deployment).
                    </p>
                    <p className="ix-muted ix-fineprint" style={{ marginBottom: "10px" }}>
                      Needed for <code>tweet.read</code> / <code>users.read</code> / <code>offline.access</code> (and list
                      reads when configured).
                    </p>
                    <button
                      type="button"
                      className="ix-widget-cta"
                      style={{ background: "var(--ix-accent)", color: "#fff" }}
                      disabled={oauthClientConfigured === false}
                      onClick={() => {
                        window.location.href = apiUrlAbsolute("/api/auth/x/login");
                      }}
                    >
                      Sign in with X
                    </button>
                    {oauthClientConfigured === false ? (
                      <p className="ix-warn" style={{ marginBottom: 0 }}>
                        Add <code>TWITTER_CLIENT_ID</code> (and callback URL in the developer portal) — see{" "}
                        <code>.env.example</code>.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : page === "ranking" ? (
            <div className="ix-page-panel ix-page-panel--ranking">
              <p className="ix-muted ix-fineprint" style={{ margin: "0 0 12px" }}>
                Settings only — timeline posts stay on <strong>Home</strong>. Use the buttons below to refresh Live X or
                Explore after changing weights.
              </p>
              <div className="ix-widget">
                <h3 className="ix-widget-title">For You timeline</h3>
                <p className="ix-muted ix-fineprint" style={{ marginTop: 0, marginBottom: 10 }}>
                  <strong>Refresh source</strong> — what API fills the live mixer layer on refresh. Home also auto-merges{" "}
                  <strong>The Pipetrix</strong> (<code>tf_canonical_posts</code>) and rehydrates from <code>posts</code> on open.
                </p>
                <label className="ix-field">
                  <span>Refresh source</span>
                  <HomeFeedSourceSelect
                    value={homeFeedMode}
                    onChange={setHomeFeedMode}
                    syncUrl
                    xaiConfigured={xaiConfigured}
                  />
                </label>
                <HomeFeedSourceHelp
                  mode={homeFeedMode}
                  xaiHomeBatch={XAI_HOME_BATCH}
                  xaiLiveSearch={xaiLiveSearch}
                  onXaiLiveSearchChange={setXaiLiveSearch}
                />
                <button
                  type="button"
                  className="ix-widget-cta"
                  disabled={
                    loading ||
                    (homeFeedMode === "live" && (me?.connected !== true || hasProfileFetchError(me))) ||
                    (homeFeedMode === "xai" && xaiConfigured === false)
                  }
                  onClick={() => void runForYou()}
                >
                  {loading ? "…" : "Refresh For You timeline"}
                </button>
                <label className="ix-check" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={includeSeenInFeed}
                    onChange={(e) => setIncludeSeenInFeed(e.target.checked)}
                  />
                  <span>Include already-seen posts &amp; Spaces/Broadcasts</span>
                </label>
                <p className="ix-muted ix-fineprint" style={{ marginTop: 8, marginBottom: 0 }}>
                  Seen items live in <code>seen_items</code>; Pipetrix canonical <code>tf_canonical_posts.seen</code> is kept in
                  sync. Clearing resets both so canonical backlog surfaces as unseen again. Add{" "}
                  <code>?reset_seen=1</code> to the URL for a one-shot reset. Tweet corpora still persist in{" "}
                  <code>posts</code> regardless.
                </p>
                <button
                  type="button"
                  className="ix-link-btn"
                  style={{ marginTop: 10, display: "block" }}
                  onClick={() =>
                    void clearAllSeenItems().then(() => {
                      void reloadSeenFromDb();
                    })
                  }
                >
                  Clear seen history + Pipetrix canonical flags
                </button>
                <label className="ix-check" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={!isRealDataOnly()}
                    onChange={(e) => {
                      setRealDataOnly(!e.target.checked);
                      if (!e.target.checked) void runForYou();
                    }}
                  />
                  <span>Allow demo data (offline seed + Grok mixer / fake tweet IDs)</span>
                </label>
                <p className="ix-muted ix-fineprint" style={{ marginTop: 6, marginBottom: 0 }}>
                  Off by default after wipe. Real-data-only keeps Home on Live X, skips synthetic Grok posts, and pauses
                  background topic filler.
                </p>
                <button
                  type="button"
                  className="ix-link-btn"
                  style={{ marginTop: 8, display: "block" }}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Delete ALL offline data and reload in real-data-only mode? (Live X + real Spaces/Broadcasts only.)"
                      )
                    ) {
                      return;
                    }
                    void wipeAllLocalRxDatabases().then(() => {
                      window.location.reload();
                    });
                  }}
                >
                  Wipe offline IndexedDB &amp; reload
                </button>
                <p className="ix-muted ix-fineprint" style={{ marginTop: 6, marginBottom: 0 }}>
                  Clears <code>ifixedx_local</code>, <code>thefeedtrix_local</code>, avatars, Grok rail snapshot. Shortcut:{" "}
                  <code>?wipe_local=1</code>
                </p>
              </div>

              <div className="ix-widget">
                <h3 className="ix-widget-title">Live &amp; Spaces (Grok)</h3>
                <p className="ix-muted ix-fineprint" style={{ marginTop: 0 }}>
                  Real Spaces/Broadcasts load when you visit the directory pages (not mixed into the post feed here).
                </p>
                {xaiConfigured === false ? (
                  <p className="ix-warn" style={{ marginBottom: 0 }}>
                    Set <code>XAI_API_KEY</code> on the server.
                  </p>
                ) : (
                  <>
                    <label className="ix-check">
                      <input
                        type="checkbox"
                        checked={xaiLiveSearch}
                        onChange={(e) => setXaiLiveSearch(e.target.checked)}
                      />
                      <span>Prefer xAI live search</span>
                    </label>
                    <button
                      type="button"
                      className="ix-link-btn"
                      style={{ display: "block", marginTop: 8 }}
                      onClick={() => {
                        void loadGrokLiveSessions();
                        goPage("spaces");
                      }}
                    >
                      Fetch Spaces now
                    </button>
                    <button
                      type="button"
                      className="ix-link-btn"
                      style={{ display: "block", marginTop: 6 }}
                      onClick={() => {
                        void loadGrokLiveSessions();
                        goPage("broadcasts");
                      }}
                    >
                      Fetch Broadcasts now
                    </button>
                  </>
                )}
              </div>

              <div className="ix-widget">
                <h3 className="ix-widget-title">Explore search corpus</h3>
                <label className="ix-field">
                  <span>Corpus</span>
                  <select value={source} onChange={(e) => setSource(e.target.value === "live" ? "live" : "mock")}>
                    {!isRealDataOnly() ? <option value="mock">Mock (offline)</option> : null}
                    <option value="live">X API Recent Search</option>
                  </select>
                </label>
                {source === "mock" && liveSearchReady === true ? (
                  <p className="ix-muted ix-fineprint" style={{ marginTop: 0, marginBottom: "10px" }}>
                    Real X posts may be available — switch to <strong>X API Recent Search</strong>, then run from Explore.
                  </p>
                ) : null}
                {source === "live" && liveSearchReady === false ? (
                  <p className="ix-warn">
                    Live search unavailable: Sign in with X <strong>or</strong> set <code>TWITTER_BEARER_TOKEN</code> in
                    server <code>.env</code>.
                  </p>
                ) : null}
                <label className="ix-check">
                  <input
                    type="checkbox"
                    checked={omitRetweets}
                    onChange={(e) => setOmitRetweets(e.target.checked)}
                  />
                  <span>Omit retweets</span>
                </label>
                <button
                  type="button"
                  className="ix-widget-cta"
                  style={{ marginTop: 12, background: "var(--ix-chip)", color: "var(--ix-text)", border: "1px solid var(--ix-border)" }}
                  disabled={loading || !q.trim()}
                  onClick={() => void run()}
                >
                  {loading ? "…" : "Refresh Explore ranking"}
                </button>
                <p className="ix-muted ix-fineprint" style={{ marginBottom: 0 }}>
                  Set your query on the{" "}
                  <a
                    href="#"
                    className="ix-link"
                    onClick={(e) => {
                      e.preventDefault();
                      goPage("explore");
                    }}
                  >
                    Explore
                  </a>{" "}
                  page first; this re-runs the same search with the shared weight sliders on this page.
                </p>
              </div>

              <div className="ix-widget">
                <h3 className="ix-widget-title">Shared ranker weights</h3>
                <label className="ix-field ix-field-inline">
                  <span>Posts (max results)</span>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={maxResults}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setMaxResults(Math.min(100, Math.max(5, n)));
                    }}
                  />
                </label>
                <label className="ix-field">
                  <span>Recency {recencyWeight.toFixed(2)}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={recencyWeight}
                    onChange={(e) => setRecencyWeight(Number(e.target.value))}
                  />
                </label>
                <label className="ix-check">
                  <input
                    type="checkbox"
                    checked={strictMatch}
                    onChange={(e) => setStrictMatch(e.target.checked)}
                  />
                  <span>Strict anti-spam</span>
                </label>
                <p className="ix-muted ix-fineprint" style={{ marginTop: 10, marginBottom: 0 }}>
                  When timelines ingest into Pipetrix <strong>canonical</strong> (<code>tf_canonical_posts</code>), these slider values are snapshotted
                  into each row&apos;s <code>mixerMetaJson</code> (<code>rankingLab</code>) so offline analysis matches what
                  produced the corpus.
                </p>
              </div>
            </div>
          ) : page === "spaces" ? (
            <>
              {xaiConfigured === false ? (
                <p className="ix-muted ix-fineprint">
                  Configure <code>XAI_API_KEY</code> on the server to list live Spaces from Grok.
                </p>
              ) : null}
              {grokLiveSessionsLoading && grokLiveSpaces.length === 0 ? (
                <p className="ix-muted ix-fineprint">Loading Spaces…</p>
              ) : null}
              {grokLiveSessionsError ? <p className="ix-warn">{grokLiveSessionsError}</p> : null}
              {grokLiveSessionsWarning ? <p className="ix-muted ix-fineprint">{grokLiveSessionsWarning}</p> : null}
              {xaiConfigured === true &&
              !grokLiveSessionsLoading &&
              grokLiveSpaces.length === 0 &&
              !grokLiveSessionsError ? (
                <div className="ix-empty">No Spaces returned. Try enabling live search in Ranking lab, or try again shortly.</div>
              ) : null}
              {grokLiveSpaces.length > 0 && grokLiveSpacesVisible.length === 0 && !includeSeenInFeed ? (
                <p className="ix-muted ix-fineprint">
                  Every Space in this batch is already marked seen locally. Enable <strong>Include already-seen</strong> in
                  Ranking lab or clear seen history.
                </p>
              ) : null}
              {grokLiveSpacesVisible.map((row) => (
                <LiveSessionTile
                  key={`${row.kind}-${row.id}`}
                  row={row}
                  onSelect={onLiveSessionSelect}
                  onOpenOnX={onLiveSessionOpened}
                />
              ))}
              {grokLiveSpaces.length > 0 ? (
                <div className="ix-feed-trailer">
                  {grokLiveSpacesVisible.length < grokLiveSpaces.length ? (
                    <p className="ix-muted ix-fineprint">
                      Showing {grokLiveSpacesVisible.length} of {grokLiveSpaces.length} Spaces — scroll for more.
                    </p>
                  ) : null}
                  {loadingMoreLiveSessions ? (
                    <p className="ix-muted ix-fineprint">Loading more Spaces…</p>
                  ) : null}
                  <div ref={liveSessionsSentinelRef} className="ix-feed-infinite-sentinel" aria-hidden />
                </div>
              ) : null}
            </>
          ) : page === "broadcasts" ? (
            <>
              {xaiConfigured === false ? (
                <p className="ix-muted ix-fineprint">
                  Configure <code>XAI_API_KEY</code> on the server to list live Broadcasts from Grok.
                </p>
              ) : null}
              {grokLiveSessionsLoading && grokLiveBroadcasts.length === 0 ? (
                <p className="ix-muted ix-fineprint">Loading Broadcasts…</p>
              ) : null}
              {grokLiveSessionsError ? <p className="ix-warn">{grokLiveSessionsError}</p> : null}
              {grokLiveSessionsWarning ? <p className="ix-muted ix-fineprint">{grokLiveSessionsWarning}</p> : null}
              {xaiConfigured === true &&
              !grokLiveSessionsLoading &&
              grokLiveBroadcasts.length === 0 &&
              !grokLiveSessionsError ? (
                <div className="ix-empty">No Broadcasts returned. Try enabling live search in Ranking lab, or try again shortly.</div>
              ) : null}
              {grokLiveBroadcasts.length > 0 && grokLiveBroadcastsVisible.length === 0 && !includeSeenInFeed ? (
                <p className="ix-muted ix-fineprint">
                  Every Broadcast in this batch is already marked seen locally. Enable <strong>Include already-seen</strong> in
                  Ranking lab or clear seen history.
                </p>
              ) : null}
              {grokLiveBroadcastsVisible.map((row) => (
                <LiveSessionTile
                  key={`${row.kind}-${row.id}`}
                  row={row}
                  onSelect={onLiveSessionSelect}
                  onOpenOnX={onLiveSessionOpened}
                />
              ))}
              {grokLiveBroadcasts.length > 0 ? (
                <div className="ix-feed-trailer">
                  {grokLiveBroadcastsVisible.length < grokLiveBroadcasts.length ? (
                    <p className="ix-muted ix-fineprint">
                      Showing {grokLiveBroadcastsVisible.length} of {grokLiveBroadcasts.length} Broadcasts — scroll for
                      more.
                    </p>
                  ) : null}
                  {loadingMoreLiveSessions ? (
                    <p className="ix-muted ix-fineprint">Loading more Broadcasts…</p>
                  ) : null}
                  <div ref={liveSessionsSentinelRef} className="ix-feed-infinite-sentinel" aria-hidden />
                </div>
              ) : null}
            </>
          ) : page === "xgaming" ? (
            <div className="ix-page-panel ix-page-panel--xgaming">
              <XGamingPage layoutMode={layoutMode} />
            </div>
          ) : err ? (
            <div className="ix-empty ix-error">{err}</div>
          ) : showTimelineEmptyCta ? (
            <div className="ix-empty">
              {page === "home" ? (
                <>
                  <h2 className="ix-empty-title">For you</h2>
                  <p className="ix-empty-body">
                    {homeFeedMode === "seed" ? (
                      <>
                        <strong>Seed timeline</strong> loads the curated offline feed (real-style avatars + media URLs) for
                        layout and ranking — no X API quota. Use the <strong>Timeline source</strong> menu above to switch to{" "}
                        <strong>Live X API</strong> or <strong>Grok-generated timeline</strong>.
                      </>
                    ) : homeFeedMode === "xai" ? (
                      <>
                        <strong>Grok-generated timeline</strong> uses your API server (<code>XAI_API_KEY</code>).{" "}
                        <strong>The Pipetrix</strong> canonical posts in this browser appear as soon as they sync from IndexedDB;
                        use <strong>Load timeline</strong> to add a fresh Grok batch on top. Optional: live search in{" "}
                        <a href="#" className="ix-link" onClick={(e) => { e.preventDefault(); goPage("ranking"); }}>Ranking lab</a>.
                      </>
                    ) : (
                      <>
                        Load posts from people you follow via the official home timeline API (primary path). With{" "}
                        <code>XAI_API_KEY</code> on your server, <strong>The Pipetrix</strong> also ingests Grok topic batches in
                        the background and remixes unseen posts into Home. Sign in with X is required for Live.
                      </>
                    )}
                  </p>
                  {homeFeedMode === "seed" || homeFeedMode === "xai" || me?.connected === true ? (
                    <button
                      type="button"
                      className="ix-widget-cta ix-empty-cta"
                      disabled={
                        loading ||
                        (homeFeedMode === "live" &&
                          (me?.connected !== true || hasProfileFetchError(me))) ||
                        (homeFeedMode === "xai" && xaiConfigured === false)
                      }
                      onClick={() => void runForYou()}
                    >
                      {loading ? "Loading…" : "Load timeline"}
                    </button>
                  ) : (
                    <p className="ix-muted">
                      Use <strong>Sign in with X</strong> in the sidebar, or choose <strong>Offline demo</strong> in{" "}
                      <a href="#" className="ix-link" onClick={(e) => { e.preventDefault(); goPage("ranking"); }}>Ranking lab</a>.
                    </p>
                  )}
                </>
              ) : page === "explore" ? (
                <>
                  <h2 className="ix-empty-title">Search X (reimagined)</h2>
                  <p className="ix-empty-body">
                    Enter a query and press Search — we pull a corpus (mock or X API v2 Recent Search), then re-rank with
                    iFixedX. Use Top → iFixed rank to compare ordering.
                  </p>
                </>
              ) : null}
            </div>
          ) : mainTab === "people" ? (
            peopleRows.length === 0 ? (
              <div className="ix-empty">No people in this corpus.</div>
            ) : (
              <ul className="ix-people">
                {peopleRows.map((p) => {
                  const href = xProfileUrl(p.handle);
                  return (
                  <li key={p.handle} className="ix-people-row">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ix-avatar ix-avatar-link"
                      aria-hidden
                    >
                      {initials(p.author, p.handle)}
                    </a>
                    <div>
                      <a href={href} target="_blank" rel="noopener noreferrer" className="ix-name ix-link-plain">
                        {p.author}
                      </a>
                      <div>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ix-handle ix-link-plain"
                        >
                          @{p.handle}
                        </a>
                      </div>
                    </div>
                    <a className="ix-follow" href={href} target="_blank" rel="noopener noreferrer">
                      Profile
                    </a>
                  </li>
                  );
                })}
              </ul>
            )
          ) : mainTab === "lists" ? (
            <div className="ix-placeholder">
              <strong>Lists</strong>
              <p> parity later — wired for layout only.</p>
            </div>
          ) : (mainTab === "top" || mainTab === "latest" || mainTab === "media") &&
            feedPostsBase.length > 0 &&
            feedPosts.length === 0 &&
            !includeSeenInFeed ? (
            <div className="ix-empty">
              <p className="ix-empty-body">
                All posts in this view are already marked <strong>seen</strong> in local RxDB. Enable{" "}
                <strong>Include already-seen</strong> in Ranking lab, or clear seen history to see them again. Full rows stay
                in the <code>posts</code> store.
              </p>
            </div>
          ) : (mainTab === "top" || mainTab === "latest" || mainTab === "media") &&
            hasMixerEligibleCorpus &&
            !feedPosts.length &&
            corpusTimeScope !== "all" ? (
            <div className="ix-empty">
              Nothing in{" "}
              {corpusTimeScope === "day"
                ? "the past 24 hours"
                : corpusTimeScope === "week"
                  ? "the past 7 days"
                  : "the past 30 days"}{" "}
              for this tab&apos;s corpus. Widen that tab&apos;s time menu (&quot;All corpus&quot;) or load more tweets.
            </div>
          ) : mainTab === "media" && hasMixerEligibleCorpus && !feedPosts.length ? (
            <div className="ix-empty">No posts with media in this result set.</div>
          ) : page === "home" && (mainTab === "top" || mainTab === "latest" || mainTab === "media") ? (
            <>
              <div className="ix-feed ix-feed--masonry ix-feed--masonry-home">
                {feedPostsWindowed.map((t) => (
                  <TweetCard
                    key={`${mainTab}-${t.id}`}
                    tweet={t}
                    variant="tile"
                    onOpenDetail={setFocusTweet}
                  />
                ))}
              </div>
              <div className="ix-feed-trailer">
                {feedVisibleCap < feedPosts.length ? (
                  <p className="ix-muted ix-fineprint ix-feed-window-hint">
                    Showing {feedPostsWindowed.length} of {feedPosts.length} posts — scroll to load more.
                  </p>
                ) : homeFeedMode === "live" && homeTimelineNextToken ? (
                  <p className="ix-muted ix-fineprint ix-feed-window-hint">
                    End of loaded batch — scroll to pull older posts from your X following timeline.
                  </p>
                ) : null}
                {loadingMoreHome ? (
                  <p className="ix-muted ix-fineprint ix-grok-loading-more">Loading more from X…</p>
                ) : null}
                {feedPosts.length > 0 ? (
                  <div
                    ref={feedInfiniteSentinelRef}
                    className="ix-feed-infinite-sentinel"
                    aria-hidden
                    style={{ minHeight: 1 }}
                  />
                ) : null}
                {homeFeedMode === "xai" && xaiConfigured === true && hasMixerEligibleCorpus ? (
                  <>
                    <div
                      ref={grokScrollSentinelRef}
                      className="ix-grok-scroll-sentinel"
                      aria-hidden
                      style={{ minHeight: 4 }}
                    />
                    {loadingMoreGrok ? (
                      <p className="ix-muted ix-fineprint ix-grok-loading-more">Loading more from Grok…</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          ) : showFeedTimeline ? (
            <>
              {feedPostsWindowed.map((t) => (
                <TweetCard
                  key={`${mainTab}-${t.id}`}
                  tweet={t}
                  variant={layoutMode === "stream" ? "stream" : "classic"}
                  onOpenDetail={setFocusTweet}
                />
              ))}
              {feedVisibleCap < feedPosts.length ? (
                <p className="ix-muted ix-fineprint ix-feed-window-hint ix-feed-window-hint--solo">
                  Showing {feedPostsWindowed.length} of {feedPosts.length} posts — scroll to load more.
                </p>
              ) : null}
              {(mainTab === "top" || mainTab === "latest" || mainTab === "media") && feedPosts.length > 0 ? (
                <div
                  ref={feedInfiniteSentinelRef}
                  className="ix-feed-infinite-sentinel"
                  aria-hidden
                  style={{ minHeight: 1 }}
                />
              ) : null}
            </>
          ) : null}
        </div>

        {(page === "home" || page === "explore") &&
        mainTab === "top" &&
        platform?.length &&
        refined?.length ? (
          <aside className="ix-compare-mini" aria-label="Legend">
            <span className="ix-legend-muted">{subtitle}</span>
          </aside>
        ) : null}
      </main>

      <aside className="ix-rail ix-rail--right">
        {page === "trott" ? <TrottRail /> : null}
        {page === "home" ? (
          <div className="ix-home-right-stack">
            <LiveSpacesRail
              goPage={goPage}
              railRows={grokLiveRailRows}
              loading={grokLiveSessionsLoading}
              liveSearch={liveRailLiveSearchHint}
              errorNote={liveRailErrorNote}
              warnNote={grokLiveSessionsWarning}
              onSessionOpened={onLiveSessionOpened}
              onSessionSelect={onLiveSessionSelect}
              lastUpdatedAt={grokLiveSessionsFetchedAt}
              xaiConfigured={xaiConfigured}
            />
            <WhoToFollowRail posts={feedPosts} />
          </div>
        ) : null}

        {page === "explore" ? (
          <>
            <div className="ix-widget">
              <h3 className="ix-widget-title">Ranking lab</h3>
              <label className="ix-field">
                <span>Corpus</span>
                <select value={source} onChange={(e) => setSource(e.target.value === "live" ? "live" : "mock")}>
                  {!isRealDataOnly() ? <option value="mock">Mock (offline)</option> : null}
                  <option value="live">X API Recent Search</option>
                </select>
              </label>
              {source === "mock" && liveSearchReady === true ? (
                <p className="ix-muted ix-fineprint" style={{ marginTop: 0, marginBottom: "10px" }}>
                  Real X posts are available — switch Corpus to <strong>X API Recent Search</strong>, then press Search (
                  free tier is usually Recent Search + your own tweets/lists, not full home).
                </p>
              ) : null}
              {source === "live" && liveSearchReady === false ? (
                <p className="ix-warn">
                  Live search unavailable: Sign in with X <strong>or</strong> set <code>TWITTER_BEARER_TOKEN</code> in
                  server <code>.env</code>.
                </p>
              ) : null}
              <label className="ix-field ix-field-inline">
                <span>Posts</span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={maxResults}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setMaxResults(Math.min(100, Math.max(10, n)));
                  }}
                />
              </label>
              <label className="ix-check">
                <input
                  type="checkbox"
                  checked={omitRetweets}
                  onChange={(e) => setOmitRetweets(e.target.checked)}
                />
                <span>Omit retweets</span>
              </label>
              <label className="ix-field">
                <span>Recency {recencyWeight.toFixed(2)}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={recencyWeight}
                  onChange={(e) => setRecencyWeight(Number(e.target.value))}
                />
              </label>
              <label className="ix-check">
                <input
                  type="checkbox"
                  checked={strictMatch}
                  onChange={(e) => setStrictMatch(e.target.checked)}
                />
                <span>Strict anti-spam</span>
              </label>
              <button
                type="button"
                className="ix-widget-cta"
                disabled={loading || !q.trim()}
                onClick={() => void run()}
              >
                {loading ? "…" : "Refresh ranking"}
              </button>
              <p className="ix-muted ix-fineprint" style={{ marginBottom: 0 }}>
                Home timeline defaults live in{" "}
                <a
                  href="#"
                  className="ix-link"
                  onClick={(e) => {
                    e.preventDefault();
                    goPage("ranking");
                  }}
                >
                  Ranking lab
                </a>
                .
              </p>
            </div>

            <div className="ix-widget ix-widget-soft">
              <h3 className="ix-widget-title">Search filters</h3>
              <p className="ix-muted">People: Anyone</p>
              <p className="ix-muted">Location: Anywhere</p>
              <a className="ix-link" href="https://developer.x.com/" target="_blank" rel="noreferrer">
                X API docs
              </a>
            </div>

            <div className="ix-widget ix-widget-soft">
              <h3 className="ix-widget-title">What’s fixing</h3>
              <p className="ix-muted">
                Typed search mixes tabs and graphs; Earlybird OSS covers index ideas, not this UI. Here we fetch a corpus
                and own the rank — starting point for tighter relevance.
              </p>
            </div>
          </>
        ) : null}

        {page === "account" ? (
          <div className="ix-widget ix-widget-soft">
            <h3 className="ix-widget-title">Navigate</h3>
            <p className="ix-muted" style={{ marginTop: 0 }}>
              Open the timeline mixer or search when you’re done here.
            </p>
            <button type="button" className="ix-widget-cta" onClick={() => goPage("home")}>
              Home
            </button>
            <button
              type="button"
              className="ix-widget-cta"
              style={{
                marginTop: 10,
                background: "var(--ix-chip)",
                color: "var(--ix-text)",
                border: "1px solid var(--ix-border)"
              }}
              onClick={() => goPage("explore")}
            >
              Explore
            </button>
            <button
              type="button"
              className="ix-widget-cta"
              style={{
                marginTop: 10,
                background: "var(--ix-chip)",
                color: "var(--ix-text)",
                border: "1px solid var(--ix-border)"
              }}
              onClick={() => goPage("ranking")}
            >
              Ranking lab
            </button>
          </div>
        ) : null}

        {page === "ranking" ? (
          <div className="ix-widget ix-widget-soft">
            <h3 className="ix-widget-title">Using this page</h3>
            <p className="ix-muted" style={{ marginTop: 0 }}>
              This page is <strong>controls only</strong> — no post feed. Tune weights, then use <strong>Refresh For You</strong> or{" "}
              <strong>Refresh Explore ranking</strong>. View results on <strong>Home</strong> or <strong>Explore</strong>. Spaces and
              Broadcasts load from Grok on their directory pages.
            </p>
          </div>
        ) : page === "xgaming" ? (
          <div className="ix-widget ix-widget-soft">
            <h3 className="ix-widget-title">XGaming</h3>
            <p className="ix-muted ix-fineprint" style={{ marginTop: 0 }}>
              Rank badge images: copy from <code>/home/xdeploy/ranks</code> into <code>public/xgaming/ranks/</code> when
              you rotate art.
              {layoutMode === "stream" ? (
                <>
                  {" "}
                  In Stream layout, game lobbies sit in the <strong>center column</strong> beside Ladder / Ranked; Classic
                  layout uses the <strong>XChat</strong> sub-tab.
                </>
              ) : (
                <>
                  {" "}
                  In Classic layout, game lobbies use the <strong>XChat</strong> sub-tab so Ranked / Unranked stays one
                  column.
                </>
              )}
            </p>
            <div className="ix-xg-games-rail" role="group" aria-label="Supported games">
              <h4 className="ix-xg-games-rail-title">Supported games</h4>
              <p className="ix-muted ix-fineprint" style={{ marginTop: 0 }}>
                Filters <strong>Top players</strong> on the Ranked / Unranked tab.
              </p>
              <ul className="ix-xg-games-rail-list">
                <li>
                  <button
                    type="button"
                    className={`ix-xg-game-pill${xgGameRail === XGAMING_ALL_GAMES_ID ? " ix-xg-game-pill--on" : ""}`}
                    onClick={() => patchXGamingGameInUrl(XGAMING_ALL_GAMES_ID)}
                  >
                    All games
                  </button>
                </li>
                {XGAMING_SUPPORTED_GAMES.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={`ix-xg-game-pill${xgGameRail === g.id ? " ix-xg-game-pill--on" : ""}`}
                      onClick={() => patchXGamingGameInUrl(g.id)}
                    >
                      {g.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="ix-widget-cta"
              style={{
                marginTop: 10,
                background: "var(--ix-chip)",
                color: "var(--ix-text)",
                border: "1px solid var(--ix-border)"
              }}
              onClick={() => goPage("home")}
            >
              Back to Home
            </button>
          </div>
        ) : null}
      </aside>
    </div>
      )}
      {enteredApp && feedtrixModalOpen ? (
        <FeedtrixCategoryModal
          open={feedtrixModalOpen}
          onClose={() => setFeedtrixModalOpen(false)}
          prefs={feedtrixPrefs}
          onToggle={(topicId, enabled) => {
            setFeedtrixPrefs((prev) => ({ ...prev, [topicId]: enabled }));
            void saveFeedtrixTopicEnabled(topicId, enabled);
          }}
          onReset={() =>
            void resetFeedtrixTopicPrefs().then(() =>
              loadFeedtrixPrefs().then((p) => {
                setFeedtrixPrefs(p);
              })
            )
          }
        />
      ) : null}
      {enteredApp && liveSessionPreview ? (
        <LiveSessionPreviewModal
          row={liveSessionPreview}
          onClose={() => setLiveSessionPreview(null)}
          onJoin={() => onLiveSessionOpened(liveSessionPreview)}
        />
      ) : null}
      {enteredApp && focusTweet ? (
        <TweetFocusModal tweet={focusTweet} onClose={() => setFocusTweet(null)} />
      ) : null}
    </>
  );
}
