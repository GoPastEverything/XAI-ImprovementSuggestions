import { useEffect, useState } from 'react';
import './trott.css';

type Reply = { id: string; parentId: string | null; body: string; createdAt: string };
type SourcePost = { id: string; sourceUrl: string; author: string; handle: string; text: string; createdAt: string; avatarUrl?: string; mediaUrls: string[]; likes: number; retweets: number; replyCount: number; viewCount: number; truncated: boolean; videoNotSaved: boolean; quote?: { author: string; handle: string; text: string } };
type Discussion = { id: string; topic: string; title: string; body: string; createdAt: string; replies: Reply[]; sourcePost?: SourcePost };
type State = { topics: string[]; discussions: Discussion[]; mode: string; pulseEnabled: boolean; snapshot?: { importedAt: string | null; posts: SourcePost[] } };
async function api<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch('/api/trott' + path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trott-Local': '1' }, body: JSON.stringify(body)
  } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to reach TROTT');
  return result;
}
export function Trott() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState('All topics');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(location.hash.slice(1));
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [newTopic, setNewTopic] = useState('Building TROTT');
  const [replyBody, setReplyBody] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [sourcePost, setSourcePost] = useState<SourcePost | null>(null);
  async function refresh() { setData(await api<State>()); }
  useEffect(() => { refresh().catch(e => setError(e.message));
    const onHash = () => { setSelectedId(location.hash.slice(1)); setParentId(null); setReplyBody(''); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const selected = data?.discussions.find(d => d.id === selectedId);
  const filtered = data?.discussions.filter(d => (topic === 'All topics' || d.topic === topic)
    && `${d.title} ${d.body} ${d.replies.map(r => r.body).join(' ')}`.toLowerCase().includes(search.toLowerCase())) || [];
  const snapshotPosts = (data?.snapshot?.posts || []).filter(p => `${p.author} ${p.handle} ${p.text} ${p.quote?.text || ''}`.toLowerCase().includes(search.toLowerCase()));
  function browse(nextTopic: string) { setTopic(nextTopic); location.hash = ''; setComposing(false); }
  async function create(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { const discussion = await api<Discussion>('/discussions', { topic: newTopic, title, body, sourcePostId: sourcePost?.id });
      await refresh(); setComposing(false); setTitle(''); setBody(''); setSourcePost(null); location.hash = discussion.id;
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  async function reply(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setSaving(true); setError('');
    try { await api(`/discussions/${selected.id}/replies`, { body: replyBody, parentId });
      await refresh(); setReplyBody(''); setParentId(null);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  function renderReplies(parent: string | null, depth = 0): React.ReactNode {
    return selected?.replies.filter(r => r.parentId === parent).map(r => <article className="tt-reply" key={r.id} style={{ marginLeft: depth > 6 ? 0 : undefined }}>
      <div className="tt-meta">Local developer · {new Date(r.createdAt).toLocaleString()}</div>
      <p className="tt-body">{r.body}</p>
      <button className="tt-text-button" onClick={() => { setParentId(r.id); document.getElementById('tt-reply-body')?.focus(); }}>↳ Reply to this branch</button>
      {renderReplies(r.id, depth + 1)}
    </article>);
  }
  return <div className="tt-app"><div className="tt-main">
      <header className="tt-topbar"><div><strong>TROTT</strong><span>The Rest Of The Thread</span></div><button className="tt-primary" disabled={!data} onClick={() => { setSourcePost(null); setTitle(''); setBody(''); setComposing(true); setError(''); }}>+ Start a discussion</button></header>
      <nav className="tt-topics" aria-label="TROTT topics">{["All topics", ...(data?.topics || [])].map(t => <button className={topic === t ? "active" : ""} key={t} onClick={() => browse(t)}>{t}</button>)}</nav>{error && <div className="tt-error" role="alert">{error} <button onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Retry connection</button></div>}
      {composing ? <section className="tt-content"><button className="tt-text-button" onClick={() => setComposing(false)}>← Back</button><h1>Start something worth following.</h1>
        {sourcePost && <SourcePostCard post={sourcePost} />}
        <form className="tt-form" onSubmit={create}>
          <label>Topic<select value={newTopic} onChange={e => setNewTopic(e.target.value)}>{data?.topics.map(t => <option key={t}>{t}</option>)}</select></label>
          <label>Discussion title<input required minLength={3} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="What’s the question behind the post?" /></label>
          <label>Give it some context<textarea required maxLength={10000} rows={8} value={body} onChange={e => setBody(e.target.value)} placeholder="Share an idea, ask a question, or bring a source." /></label>
          <button className="tt-primary" disabled={saving}>{saving ? 'Saving…' : 'Publish locally ↗'}</button>
        </form></section> : selected ? <section className="tt-content">
          <a className="tt-text-button" href="#">← All discussions</a><p className="tt-eyebrow">{selected.topic}</p><h1>{selected.title}</h1>
          <div className="tt-meta">Local developer · {new Date(selected.createdAt).toLocaleString()}</div>
          {selected.sourcePost && <SourcePostCard post={selected.sourcePost} />}
          <p className="tt-body tt-opening">{selected.body}</p>
          <div className="tt-section-title"><h2>The rest of the thread</h2><span>{selected.replies.length} replies</span></div>
          {renderReplies(null)}
          <form className="tt-form tt-reply-form" onSubmit={reply}><label htmlFor="tt-reply-body">{parentId ? 'Add to this branch' : 'Continue the discussion'}</label>
            {parentId && <><blockquote>{selected.replies.find(r => r.id === parentId)?.body.slice(0, 160)}</blockquote><button type="button" className="tt-text-button" onClick={() => setParentId(null)}>Reply to main discussion instead</button></>}
            <textarea id="tt-reply-body" rows={4} required maxLength={10000} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Bring something to the conversation…" />
            <button className="tt-primary" disabled={saving}>{saving ? 'Saving…' : 'Add reply ↗'}</button>
          </form>
        </section> : selectedId && data ? <section className="tt-content"><h1>Discussion not found.</h1><a href="#">Return to discovery</a></section> : <>
          <section className="tt-hero"><p className="tt-eyebrow">GOOD CONVERSATIONS KEEP GROWING</p><h1>You read the post.<br /><span>Now get into it.</span></h1><p>A place for the question behind the headline.<br />Start a discussion. Follow a branch. Go further.</p><div className="tt-hero-mark" aria-hidden="true">✳</div></section>
          <section className="tt-content tt-feed"><div className="tt-section-title"><h2>{topic === 'All topics' ? 'The conversation starts here' : topic}</h2><span>Latest</span></div>
            <input className="tt-search" aria-label="Search discussions" placeholder="Search discussions and replies…" value={search} onChange={e => setSearch(e.target.value)} />
            {!data ? <p>Connecting to your local workspace…</p> : filtered.length ? filtered.map(d => <a className="tt-card" key={d.id} href={'#' + d.id}><span className="tt-eyebrow">{d.topic}</span><h3>{d.title}</h3><p>{d.body.slice(0, 200)}{d.body.length > 200 ? '…' : ''}</p><div className="tt-meta">{d.replies.length} local replies <span>Open discussion ↗</span></div></a>) : <div className="tt-empty"><span>↗</span><h3>{search ? 'No matching conversations yet.' : 'Every good thread starts somewhere.'}</h3><p>{search ? 'Try another search or choose a different topic.' : 'This is your local TROTT workspace. Start the first discussion and give it a branch.'}</p><button className="tt-primary" onClick={() => { setSourcePost(null); if (topic !== 'All topics') setNewTopic(topic); setComposing(true); }}>Start a discussion</button></div>}
            {topic === 'All topics' && !!data?.snapshot?.posts.length && <section className="tt-snapshot"><div className="tt-section-title"><h2>From your X snapshot</h2><span>{data.snapshot.posts.length} saved posts</span></div><p className="tt-meta">Captured from your saved page. Counts belong to X; discussions and replies here stay local.</p><a href="?page=home&home=seed" className="tt-text-button">View these posts on Home →</a>{snapshotPosts.map(post => <SourcePostCard key={post.id} post={post} onBranch={() => { setSourcePost(post); setTitle(`Discuss @${post.handle}'s post`); setBody(''); setNewTopic('Culture'); setComposing(true); window.scrollTo(0, 0); }} />)}{!snapshotPosts.length && <p className="tt-meta">No saved posts match this search.</p>}</section>}
          </section>
        </>}
      <footer className="tt-footer">TROTT · The Rest Of The Thread <span>Local prototype · PULSE research is not active</span></footer>
    </div>

  </div>;
}

function SourcePostCard({ post, onBranch }: { post: SourcePost; onBranch?: () => void }) {
  return <article className="tt-source-post">
    <div className="tt-source-author">{post.avatarUrl && <img src={post.avatarUrl} alt="" width={40} height={40} />}<div><strong>{post.author}</strong><span>@{post.handle} · {new Date(post.createdAt).toLocaleDateString()}</span></div><span className="tt-source-badge">Saved from X</span></div>
    {post.text ? <p className="tt-body">{post.text}</p> : <p className="tt-meta">Media post · no caption in the saved page.</p>}
    {post.truncated && <p className="tt-meta">Only the text visible in the saved page is available.</p>}
    {post.quote && <blockquote><strong>{post.quote.author} @{post.quote.handle}</strong><p className="tt-body">{post.quote.text}</p></blockquote>}
    {!!post.mediaUrls.length && <div className="tt-source-media">{post.mediaUrls.map(src => <img key={src} src={src} alt="Media included in the saved X post" loading="lazy" />)}</div>}
    {post.videoNotSaved && <p className="tt-meta">Video wasn’t included in the save. Open the original to watch.</p>}
    <p className="tt-meta">X snapshot: {post.replyCount.toLocaleString()} replies · {post.retweets.toLocaleString()} reposts · {post.likes.toLocaleString()} likes · {post.viewCount.toLocaleString()} views</p>
    <div className="tt-source-actions"><a href={post.sourceUrl} target="_blank" rel="noreferrer" className="tt-text-button">Original post ↗</a>{onBranch && <button className="tt-primary" onClick={onBranch}>Branch into TROTT ↗</button>}</div>
  </article>;
}

export function TrottRail() { return (    <aside className="tt-rail"><div className="tt-note"><p className="tt-eyebrow">BEYOND THE SCROLL</p><h2>More depth.<br />Less noise.</h2><p>Threads that stick around. Branches that let an idea breathe.</p><hr /><h3>Build in the open</h3><p>Use “Building TROTT” to work through product ideas, one conversation at a time.</p></div><div className="tt-pulse"><span>◉ PULSE</span><p>Ranking integrity, in research.</p><small>Kept separate from discussion quality. No authenticity scores or automated ranking in this prototype.</small></div></aside>); }
