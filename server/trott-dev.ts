// Isolated API entry for integration tests. Development uses server/index.ts.
import express from 'express';
import { mountTrott } from './trott.js';
import { localRequestGuard } from './localRequestGuard.js';
const app = express();
app.use(localRequestGuard);
mountTrott(app);
const port = Number(process.env.TROTT_PORT || 3847);
app.listen(port, '127.0.0.1', () => console.log(`TROTT local API http://127.0.0.1:${port}/api/trott`));
