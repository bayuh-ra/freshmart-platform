'use client';

// Shared live data store for the demo.
// One data set is shared by Admin, Order Desk, Shopper App and Rider App.
// It is saved in localStorage and broadcast to every open tab, so an order
// placed in the Shopper App tab appears on the Order Desk tab within a second.
// In production this is the PostgreSQL/MySQL database + WebSocket channel.

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { AppState, AuditLog, AppNotification } from './types';
import { createSeed, STATE_VERSION } from './seed';

const KEY = 'freshmart-demo-state';
let state: AppState | null = null;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    /* ignore */
  }
  const s = createSeed();
  persist(s);
  return s;
}

function persist(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors in demo */
  }
}

function emit() {
  for (const l of listeners) l();
}

function init() {
  if (state || typeof window === 'undefined') return;
  state = load();
  try {
    channel = new BroadcastChannel('freshmart-demo');
    channel.onmessage = () => {
      state = load();
      emit();
    };
  } catch {
    /* ignore */
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load();
      emit();
    }
  });
}

export function getState(): AppState {
  init();
  return state!;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Read the whole store (re-renders on any change). */
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
}

/**
 * Change the store. The recipe receives a deep copy ("draft") it may mutate freely.
 * Example: mutate((s) => { s.products.find(p => p.id === id)!.basePrice = 99; });
 */
export function mutate(recipe: (draft: AppState) => void) {
  const draft = structuredClone(getState());
  recipe(draft);
  state = draft;
  persist(draft);
  channel?.postMessage('changed');
  emit();
}

/** Current staff user's display name (for audit/timeline "by"). */
export function currentUserName(s: AppState = getState()) {
  return s.staff.find((u) => u.id === s.session.staffUserId)?.name ?? 'Admin';
}

/** Append an audit entry inside a mutate() recipe. */
export function addAudit(draft: AppState, entry: Omit<AuditLog, 'id' | 'at' | 'user'> & { user?: string }) {
  draft.audit.unshift({ id: uid('a'), at: new Date().toISOString(), user: entry.user ?? currentUserName(draft), ...entry });
}

/** Push a notification inside a mutate() recipe. */
export function addNotification(draft: AppState, n: Omit<AppNotification, 'id' | 'at' | 'read'>) {
  draft.notifications.unshift({ id: uid('n'), at: new Date().toISOString(), read: false, ...n });
  if (draft.notifications.length > 200) draft.notifications.length = 200;
}

export function resetDemo() {
  const s = createSeed();
  state = s;
  persist(s);
  channel?.postMessage('changed');
  emit();
}

// ---- Provider: render children only on the client (data lives in localStorage) ----
const ReadyCtx = createContext(false);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    init();
    setReady(true);
  }, []);
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#1e40af] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }
  return <ReadyCtx.Provider value={ready}>{children}</ReadyCtx.Provider>;
}

export function useReady() {
  return useContext(ReadyCtx);
}

/** Re-render every `ms` milliseconds (for timers, "x min ago", moving riders). */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
