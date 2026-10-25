import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { request } from 'node:http';

test('bundled timeline has attributed posts and locally available image assets', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../sample-data/x-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.posts.length, 12);
  assert.equal(new Set(snapshot.posts.map(p => p.id)).size, 12);
  for (const post of snapshot.posts) {
    assert.match(post.sourceUrl, /^https:\/\/x\.com\/\w+\/status\/\d+$/);
    assert.ok(post.author && post.handle && post.createdAt);
    assert.equal('access_token' in post, false);
    assert.equal('auth_token' in post, false);
    for (const asset of [post.avatarUrl, ...post.mediaUrls].filter(Boolean)) {
      assert.match(asset, /^\/demo-snapshot\/[a-f0-9]+\.(jpg|png|webp)$/);
      await access(new URL('../public' + asset, import.meta.url));
    }
  }
});

test('local discussions, nested branches, validation, and persistence across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trott-test-'));
  const snapshotFile = join(directory, 'snapshot.json');
  await writeFile(snapshotFile, JSON.stringify({ importedAt: new Date().toISOString(), posts: [{ id: 'test-source', author: 'Saved author', handle: 'savedauthor', sourceUrl: 'https://x.com/savedauthor/status/123', text: 'Original source', mediaUrls: [], likes: 4 }] }));
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}/api/trott`;
  const probe = headers => new Promise((resolve, reject) => {
    const req = request(base, { headers }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  let child;
  async function start() {
    child = spawn(process.execPath, ['--import', 'tsx', 'server/trott-dev.ts'], {
      env: { ...process.env, TROTT_PORT: String(port), TROTT_DATA_FILE: join(directory, 'discussions.json'), TROTT_SNAPSHOT_FILE: snapshotFile },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    let logs = '';
    child.stdout.on('data', data => { logs += data; });
    child.stderr.on('data', data => { logs += data; });
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(base)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('API did not start: ' + logs);
  }
  async function stop() {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  }
  const post = (path, body, header = true) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(header ? { 'X-Trott-Local': '1' } : {}) }, body: JSON.stringify(body)
  });
  try {
    await start();
    assert.equal((await (await fetch(base)).json()).discussions.length, 0);
    assert.equal((await (await fetch(base)).json()).snapshot.posts[0].author, 'Saved author');
    assert.equal((await fetch(base, { headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal(await probe({ Host: 'attacker.example' }), 403);
    assert.equal(await probe({ 'Sec-Fetch-Site': 'cross-site' }), 403);
    assert.equal((await fetch(base, { headers: { Origin: 'http://127.0.0.1:5173' } })).status, 200);
    assert.equal((await post('/discussions', {}, false)).status, 403);
    const foreignOrigin = await fetch(base + '/discussions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trott-Local': '1', Origin: 'https://example.com' }, body: '{}'
    });
    assert.equal(foreignOrigin.status, 403);
    assert.equal((await post('/discussions', { topic: 'Unknown', title: 'Invalid', body: 'Test' })).status, 400);
    assert.equal((await post('/discussions', { topic: 'Building TROTT', title: 'Missing source', body: 'Test', sourcePostId: 'missing' })).status, 400);
    const created = await post('/discussions', { topic: 'Building TROTT', title: 'A persistent discussion', body: 'Context with a source.', sourcePostId: 'test-source' });
    assert.equal(created.status, 201);
    const discussion = await created.json();
    assert.equal((await post(`/discussions/${discussion.id}/replies`, { body: 'Missing parent', parentId: 'unknown' })).status, 400);
    assert.equal((await post('/discussions/missing/replies', { body: 'Hello' })).status, 404);
    const first = await (await post(`/discussions/${discussion.id}/replies`, { body: 'First reply' })).json();
    const nested = await post(`/discussions/${discussion.id}/replies`, { body: 'A deeper branch', parentId: first.id });
    assert.equal(nested.status, 201);
    await stop(); await start();
    const state = await (await fetch(base)).json();
    assert.equal(state.discussions[0].title, discussion.title);
    assert.equal(state.discussions[0].sourcePost.author, 'Saved author');
    assert.equal(state.discussions[0].sourcePost.likes, 4);
    assert.equal(state.discussions[0].replies.length, 2);
    assert.equal(state.discussions[0].replies[1].parentId, first.id);
    assert.equal(state.pulseEnabled, false);
  } finally { await stop(); await rm(directory, { recursive: true, force: true }); }
});
