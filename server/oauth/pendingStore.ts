type Entry = {
  verifier: string;
  expires: number;
};

const store = new Map<string, Entry>();

const TTL_MS = 15 * 60 * 1000;

export function savePendingOAuth(state: string, verifier: string): void {
  prune();
  store.set(state, { verifier, expires: Date.now() + TTL_MS });
}

export function takePendingOAuth(state: string): string | null {
  prune();
  const e = store.get(state);
  if (!e || Date.now() > e.expires) {
    store.delete(state);
    return null;
  }
  store.delete(state);
  return e.verifier;
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires < now) store.delete(k);
  }
}
