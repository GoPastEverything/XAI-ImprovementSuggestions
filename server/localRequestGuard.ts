import type { RequestHandler } from 'express';

/** This prototype is local-only. Do not expose its unauthenticated stores publicly. */
export const localRequestGuard: RequestHandler = (req, res, next) => {
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(req.hostname)) {
    res.status(403).json({ error: 'Local host required' }); return;
  }
  const origin = req.get('Origin');
  const allowed = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3847', 'http://localhost:3847']);
  if ((origin && !allowed.has(origin)) || req.get('Sec-Fetch-Site') === 'cross-site') {
    res.status(403).json({ error: 'Local origin required' }); return;
  }
  next();
};
