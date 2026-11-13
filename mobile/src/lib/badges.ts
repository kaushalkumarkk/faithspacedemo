// Tiny pub/sub so any screen can tell the tab bar that unread counts changed
// (e.g. after "mark all read"), without waiting for the next 5s poll.
type Patch = { alerts?: number; messages?: number };
type Listener = (patch?: Patch) => void;

const listeners = new Set<Listener>();

export function onBadgesChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Optionally pass known new counts (applied instantly); the tab bar then re-polls to confirm. */
export function emitBadgesChanged(patch?: Patch) {
  listeners.forEach((fn) => fn(patch));
}
