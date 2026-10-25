import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type SnapshotPost = {
  id: string; sourceUrl: string; author: string; handle: string; text: string; createdAt: string;
  avatarUrl?: string; mediaUrls: string[]; hasMedia: boolean; likes: number; retweets: number;
  replyCount: number; viewCount: number; tags: string[]; truncated: boolean; videoNotSaved: boolean;
  quote?: { author: string; handle: string; text: string };
};
export function readXSnapshot(): { importedAt: string | null; posts: SnapshotPost[] } {
  try {
    const local = resolve(process.env.TROTT_SNAPSHOT_FILE || 'data/x-snapshot.json');
    const file = process.env.TROTT_SNAPSHOT_FILE || existsSync(local) ? local : resolve('sample-data/x-snapshot.json');
    const snapshot = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(snapshot.posts)) throw new Error('Invalid X snapshot');
    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { importedAt: null, posts: [] };
    throw error;
  }
}
