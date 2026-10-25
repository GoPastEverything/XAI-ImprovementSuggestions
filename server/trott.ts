import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { readXSnapshot, type SnapshotPost } from './xSnapshot.js';

type Reply = { id: string; parentId: string | null; body: string; createdAt: string };
type Discussion = { id: string; topic: string; title: string; body: string; createdAt: string; replies: Reply[]; sourcePost?: SnapshotPost };
const topics = ['Building TROTT', 'Technology', 'Science', 'Culture'];
const store = resolve(process.env.TROTT_DATA_FILE || 'data/trott.json');
mkdirSync(dirname(store), { recursive: true });
let discussions: Discussion[] = [];
try { discussions = JSON.parse(readFileSync(store, 'utf8')); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
if (!Array.isArray(discussions)) throw new Error('Invalid TROTT discussion store');
function persist(next: Discussion[]) {
  writeFileSync(store + '.tmp', JSON.stringify(next, null, 2));
  renameSync(store + '.tmp', store);
  discussions = next;
}
function field(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}
export function mountTrott(app: express.Express) {
app.use('/api/trott', (req, res, next) => {
  if (!['localhost', '127.0.0.1'].includes(req.hostname)) {
    res.status(403).json({ error: 'Local development only' }); return;
  }
  // A required custom header prevents cross-site form submissions to the local store.
  if (req.method !== 'GET' && req.get('X-Trott-Local') !== '1') {
    res.status(403).json({ error: 'Open TROTT locally to make changes' }); return;
  }
  const origin = req.get('Origin');
  if (req.method !== 'GET' && origin && !/^http:\/\/(127\.0\.0\.1|localhost):(5173|3847)$/.test(origin)) {
    res.status(403).json({ error: 'Local development origin required' }); return;
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
app.get('/api/trott', (_req, res) => res.json({ topics, discussions, mode: 'local', pulseEnabled: false, snapshot: readXSnapshot() }));
app.post('/api/trott/discussions', (req, res) => {
  const { topic, title, body, sourcePostId } = req.body || {};
  const sourcePost = sourcePostId ? readXSnapshot().posts.find(p => p.id === sourcePostId) : undefined;
  if (sourcePostId && !sourcePost) { res.status(400).json({ error: 'Source post not found in the local snapshot' }); return; }
  if (!topics.includes(topic) || !field(title, 3, 160) || !field(body, 1, 10000)) {
    res.status(400).json({ error: 'Choose a topic, a title (3–160 characters), and text (1–10,000 characters).' }); return;
  }
  const discussion: Discussion = { id: randomUUID(), topic, title: title.trim(), body: body.trim(), createdAt: new Date().toISOString(), replies: [] };
  if (sourcePost) discussion.sourcePost = sourcePost;
  persist([discussion, ...discussions]);
  res.status(201).json(discussion);
});
app.post('/api/trott/discussions/:id/replies', (req, res) => {
  const discussion = discussions.find(d => d.id === req.params.id);
  if (!discussion) { res.status(404).json({ error: 'Discussion not found' }); return; }
  const { body, parentId = null } = req.body || {};
  if (!field(body, 1, 10000) || (parentId !== null && !discussion.replies.some(r => r.id === parentId))) {
    res.status(400).json({ error: 'Enter a reply (1–10,000 characters) and select an existing branch.' }); return;
  }
  const reply: Reply = { id: randomUUID(), parentId, body: body.trim(), createdAt: new Date().toISOString() };
  persist(discussions.map(d => d.id === discussion.id ? { ...d, replies: [...d.replies, reply] } : d));
  res.status(201).json(reply);
});
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Unable to save this change. Your existing discussions are still on disk.' });
});
}
