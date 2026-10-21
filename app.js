import { createStore } from "./store.js";
import { billing, PLANS, isNative } from "./billing.js";
import { ads } from "./ads.js";
import { reminders, addToCalendar, shareLink, gameUrl } from "./native-extras.js";
import { mountPicker, mountNearby, myLocation, distanceKm, fmtDistance } from "./places.js";

/* ============================================================
   Config
   ============================================================ */

// Brand imagery generated with Higgsfield (see README to self-host these in /assets).
const HF = "https://d8j0ntlcm91z4.cloudfront.net/user_3APYC1QfmdVhtIeeTSVdRpRxODl/hf_";
const IMG = {
  hero: HF + "20261015_173431_759a8ac0-f610-45c4-8555-31cc6fc31a69_min.webp",
  hoops: HF + "20261015_173432_2a832981-0591-4125-a706-b86134cb0bf5_min.webp",
  ball: HF + "20261015_173431_7b35b216-9afb-427a-b31d-56b90c38a39d_min.webp",
  icon: "apple-touch-icon.png",
  logo: "logo.png",
  motm: HF + "20261015_173432_93416046-b584-485e-88d2-197c2cda6b04_min.webp",
};

const MIN_VOTES = 2; // a game rating only counts once at least 2 people have rated you
const REVEAL_HOURS = 24; // ratings stay hidden until votes close (or everyone has voted)

const SPORTS = {
  soccer: { label: "Soccer", icon: "soccer", stats: [["goals", "G"], ["assists", "A"], ["saves", "SV"], ["yc", "YC"], ["rc", "RC"]], key: "goals", keyLabel: "Goals/G", img: IMG.hero },
  basketball: { label: "Basketball", icon: "basketball", stats: [["pts", "PTS"], ["reb", "REB"], ["ast", "AST"], ["stl", "STL"], ["blk", "BLK"]], key: "pts", keyLabel: "PPG", positions: ["PG", "SG", "SF", "PF", "C"], img: IMG.hoops },
  volleyball: { label: "Volleyball", icon: "volleyball", stats: [["kills", "K"], ["aces", "ACE"], ["blocks", "BLK"], ["digs", "DIG"]], key: "kills", keyLabel: "Kills/G", positions: ["S", "OH", "MB", "OPP", "L"], img: IMG.ball },
  other: { label: "Other", icon: "target", stats: [["pts", "PTS"]], key: "pts", keyLabel: "Pts/G", positions: [], img: IMG.ball },
};
const sportOf = (g) => SPORTS[g.sport] || SPORTS.other;
// Most-per-game caps for stats that have a real limit (two yellows or one straight red).
const STAT_MAX = { yc: 2, rc: 1 };
const STAT_NAME = { yc: "Yellow cards", rc: "Red cards", goals: "Goals", assists: "Assists", saves: "Saves", pts: "Points", reb: "Rebounds", ast: "Assists", stl: "Steals", blk: "Blocks", kills: "Kills", aces: "Aces", blocks: "Blocks", digs: "Digs" };

/* ============================================================
   Icons (drawn for this app, no emoji)
   ============================================================ */

const ICON = {
  chart: '<path d="M4 19h16"/><path d="M5 15l4.5-5 3.5 3 6-7"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  soccer: '<circle cx="12" cy="12" r="9"/><path d="M12 7.6l3.4 2.5-1.3 4h-4.2l-1.3-4z"/><path d="M12 3v4.6M15.4 10.1l5.2-1.6M14.1 14.1l3.1 4.3M9.9 14.1l-3.1 4.3M8.6 10.1L3.4 8.5"/>',
  basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.7 5.7c3.2 3.2 3.2 9.4 0 12.6M18.3 5.7c-3.2 3.2-3.2 9.4 0 12.6"/>',
  volleyball: '<circle cx="12" cy="12" r="9"/><path d="M12 12V3.2M12 12l7.7 4.4M12 12l-7.7 4.4M12 3.2c3.5 2.6 4.8 6.4 3.8 10.6M19.7 16.4c-4 1.7-8 1-11-2M4.3 16.4c-.4-4.3 1.4-7.9 5.2-10.3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  home: '<path d="M3.5 10.5L12 4l8.5 6.5V20h-5.5v-5.5h-6V20H3.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trophy: '<path d="M8 20.5h8M12 16.5v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c.8-3.5 3.3-5.4 6.2-5.4s5.4 1.9 6.2 5.4"/><path d="M15.6 4.8a3.4 3.4 0 0 1 0 6.4M17.8 14.9c1.8.8 3 2.4 3.4 5.1"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
  camera: '<path d="M3.5 8h3.6l1.9-2.8h6l1.9 2.8h3.6v11h-17z"/><circle cx="12" cy="13.2" r="3.6"/>',
  whistle: '<circle cx="8.5" cy="14.5" r="5"/><path d="M11.8 10.8L21 7.2v4l-6.6 2.3"/><circle cx="8.5" cy="14.5" r="1.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
  share: '<path d="M12 3.5v11.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v8h14v-8"/>',
  chat: '<path d="M4 5h16v11H9.5L4 20z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.3h2"/>',
  flag: '<path d="M5 21V4M5 4.5h11l-2 3.5 2 3.5H5"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
  star: '<path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};
function icon(name, cls = "") {
  const filled = name === "star";
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" ${filled ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'}>${ICON[name] || ""}</svg>`;
}

/* ============================================================
   State
   ============================================================ */

const store = createStore();
const state = {
  nearFilter: "all", nearMe: null,
  me: null, users: [], games: [], ratings: [], friendships: [], rsvps: [], comments: [], playerStats: [],
  replyTo: null, plan: "$rc_monthly", plans: PLANS,
  feedFilter: "all", feedScope: "friends", leadersSport: "all", leadersSeason: null, squadTab: "friends",
  authTab: "login", phone: { number: "", sent: false }, resetSentTo: "",
};
let revealCache = new Map();

async function reload() {
  revealCache = new Map();
  const me = await store.currentUser();
  if (!me) {
    Object.assign(state, { me, users: [], games: [], ratings: [], friendships: [], rsvps: [], comments: [], playerStats: [], blocks: [] });
    saveSnapshot(null);
    return;
  }
  if (billing.enabled && !me.needsSetup) {
    try { await billing.start(me.id); } catch (err) { console.warn("Billing unavailable", err); }
  }
  const [users, games, ratings, friendships, rsvps, comments, playerStats, blocks] = await Promise.all([
    store.listUsers(), store.listGames(), store.listRatings(), store.listFriendships(), store.listRsvps(), store.listComments(), store.listStats(),
    store.listBlocks(me.id).catch(() => []),
  ]);
  // Each player's own stat line overrides anything stored on the game itself.
  for (const r of playerStats) {
    const g = games.find((x) => x.id === r.gameId);
    if (g) g.stats = { ...(g.stats || {}), [r.userId]: r.stats };
  }
  Object.assign(state, { me, users, games, ratings, friendships, rsvps, comments, playerStats, blocks });
  saveSnapshot(state);
  syncReminders();
}

// The last league data this device saw, so the app opens straight to the feed and refreshes in the background.
const SNAP_KEY = "wc.snapshot.v1";
const SNAP_FIELDS = ["me", "users", "games", "ratings", "friendships", "rsvps", "comments", "playerStats", "blocks"];
function saveSnapshot(st) {
  try {
    if (!st || !st.me || st.me.needsSetup) { localStorage.removeItem(SNAP_KEY); return; }
    const snap = { at: Date.now(), mode: store.mode };
    for (const k of SNAP_FIELDS) snap[k] = st[k];
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch (_) { /* storage full or blocked: just skip the snapshot */ }
}
async function loadSnapshot() {
  try {
    const snap = JSON.parse(localStorage.getItem(SNAP_KEY) || "null");
    if (!snap?.me || snap.mode !== store.mode) return false;
    if (Date.now() - snap.at > 14 * 864e5) return false; // two weeks old: start fresh
    const uid = await store.sessionUserId();
    if (!uid || uid !== snap.me.id) return false;
    for (const k of SNAP_FIELDS) state[k] = snap[k] ?? (k === "me" ? null : []);
    revealCache = new Map();
    return true;
  } catch (_) { return false; }
}

// iPhone: a local reminder 2 hours before every upcoming game you're confirmed for.
function syncReminders(ask = false) {
  if (!state.me || !isNative()) return;
  const today = localDate();
  const items = state.games
    .filter((g) => g.status !== "final" && g.date >= today && lineup(g).confirmed.includes(meId()))
    .map((g) => {
      const lu = lineup(g);
      return { g, body: `${SPORTS[g.sport]?.label || "Pickup"}${g.time ? ` at ${fmtTime(g.time)}` : " today"}${g.location ? `, ${g.location}` : ""}. ${lu.confirmed.length} going.` };
    });
  reminders.sync(items, ask);
}

/* ============================================================
   Helpers
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const user = (id) => state.users.find((u) => u.id === id);
const uname = (id) => user(id)?.displayName ?? "Unknown";
const firstName = (id) => uname(id).replace(/\s*\(.*\)/, "").split(" ")[0];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? "–" : Number(n).toFixed(d));
const meId = () => state.me?.id;
const now = () => Date.now();

// Short metadata line: pieces sit side by side with spacing, no separator glyphs.
const meta = (...parts) => `<span class="meta">${parts.filter(Boolean).map((p) => `<span>${p}</span>`).join("")}</span>`;

function localDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}

function relDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - then) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  if (Math.abs(diff) < 7) return then.toLocaleDateString(undefined, { weekday: "long" });
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso) {
  const s = Math.max(0, (now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function untilText(ms) {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

const seasonKey = (date) => date.slice(0, 7);
const currentSeason = () => localDate().slice(0, 7);
function seasonLabel(key) {
  if (key === "all") return "All time";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function ratingClass(r) {
  if (r == null) return "r-none";
  if (r >= 9) return "r-elite";
  if (r >= 8) return "r-great";
  if (r >= 7) return "r-good";
  if (r >= 6.5) return "r-ok";
  if (r >= 6) return "r-meh";
  return "r-bad";
}
const RATING_HEX = { "r-elite": "#3d7bff", "r-great": "#12b5a5", "r-good": "#1fae5b", "r-ok": "#b9c21a", "r-meh": "#e8901c", "r-bad": "#e5484d", "r-none": "#1f2940" };
const badge = (r, size = "") => `<span class="badge ${ratingClass(r)} ${size}">${fmt(r)}</span>`;

function avatar(id, size = "") {
  const u = user(id);
  const name = u?.displayName ?? "?";
  const initials = name.replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const img = u?.avatar ? `<img src="${esc(u.avatar)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  const fr = FRAMES[u?.style?.frame] ? ` fr-${u.style.frame}` : "";
  return `<span class="avatar ${size}${fr}" style="--c:${u?.color ?? "#5b6780"}">${esc(initials)}${img}</span>`;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2600);
}

async function act(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    toast(err.message || String(err));
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}

/* ============================================================
   Friends
   ============================================================ */

function friendLink(otherId) {
  return state.friendships.find((f) => (f.from === meId() && f.to === otherId) || (f.to === meId() && f.from === otherId));
}
function friendStatus(otherId) {
  const f = friendLink(otherId);
  if (!f) return "none";
  if (f.status === "accepted") return "friends";
  return f.from === meId() ? "outgoing" : "incoming";
}
const friendIds = () =>
  new Set(state.friendships.filter((f) => f.status === "accepted" && (f.from === meId() || f.to === meId())).map((f) => (f.from === meId() ? f.to : f.from)));
const incomingRequests = () => state.friendships.filter((f) => f.status === "pending" && f.to === meId());

function friendButton(id, size = "") {
  if (!state.me || id === meId()) return "";
  const st = friendStatus(id);
  const f = friendLink(id);
  if (st === "friends") return `<button class="btn quiet ${size} friend-on" data-unfriend="${f.id}">${icon("check")} Friends</button>`;
  if (st === "outgoing") return `<button class="btn quiet ${size}" data-cancel="${f.id}">Requested</button>`;
  if (st === "incoming") return `<span class="btn-pair"><button class="btn primary ${size}" data-accept="${f.id}">Accept</button><button class="btn quiet ${size}" data-decline="${f.id}">Decline</button></span>`;
  return `<button class="btn ${size}" data-addfriend="${id}">${icon("plus")} Add friend</button>`;
}

function bindFriendButtons(root = document) {
  const run = (el, fn, msg) => el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    act(el, async () => { await fn(); await reload(); render(); if (msg) toast(msg); });
  });
  $$("[data-addfriend]", root).forEach((b) => run(b, () => store.requestFriend(meId(), b.dataset.addfriend), "Friend request sent"));
  $$("[data-accept]", root).forEach((b) => run(b, () => store.respondFriend(b.dataset.accept, true), "You're friends now"));
  $$("[data-decline]", root).forEach((b) => run(b, () => store.respondFriend(b.dataset.decline, false), "Request declined"));
  $$("[data-cancel]", root).forEach((b) => run(b, () => store.removeFriend(b.dataset.cancel), "Request cancelled"));
  $$("[data-unfriend]", root).forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (b.dataset.armed) {
      act(b, async () => { await store.removeFriend(b.dataset.unfriend); await reload(); render(); toast("Removed from friends"); });
    } else {
      b.dataset.armed = "1";
      b.textContent = "Tap again to remove";
      b.classList.add("danger");
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.innerHTML = `${icon("check")} Friends`; b.classList.remove("danger"); } }, 3000);
    }
  }));
}

/* ============================================================
   Game rules
   ============================================================ */

const teamOf = (g, id) => (g.teamA?.playerIds.includes(id) ? "A" : g.teamB?.playerIds.includes(id) ? "B" : null);
const captainOf = (g, id) => (g.teamA?.captainId === id ? "A" : g.teamB?.captainId === id ? "B" : null);
const teamObj = (g, side) => (side === "A" ? g.teamA : g.teamB);
const formatLabel = (g) => `${g.teamA.playerIds.length}v${g.teamB ? g.teamB.playerIds.length : "?"}`;
const gamePlayers = (g) => [...g.teamA.playerIds, ...(g.teamB?.playerIds || [])];
const rsvpsFor = (g) => state.rsvps.filter((r) => r.gameId === g.id);
const rsvpOf = (g, id) => state.rsvps.find((r) => r.gameId === g.id && r.userId === id)?.status || null;
// Who's actually playing. Rostered players hold spots first, then "in" RSVPs in the order they said yes.
// Past the creator's player cap, everyone else waits in line and moves up automatically if someone drops.
function lineup(g) {
  const roster = gamePlayers(g);
  const list = rsvpsFor(g);
  const ins = list.filter((r) => r.status === "in" && !roster.includes(r.userId)).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const order = [...new Set([...roster, ...ins.map((r) => r.userId)])];
  const cap = g.cap || null;
  return {
    cap, order,
    confirmed: cap ? order.slice(0, cap) : order,
    waitlist: cap ? order.slice(cap) : [],
    maybe: list.filter((r) => r.status === "maybe" && !roster.includes(r.userId)).map((r) => r.userId),
    out: list.filter((r) => r.status === "out" && !roster.includes(r.userId)).map((r) => r.userId),
  };
}
const spotsText = (lu) => lu.cap ? `${lu.confirmed.length}/${lu.cap}` : `${lu.confirmed.length}`;
const isBlocked = (id) => (state.blocks || []).includes(id);
// Comments you reported are hidden for you straight away (remembered on this device).
const hiddenKey = "wc.hiddenComments";
const hiddenComments = () => { try { return new Set(JSON.parse(localStorage.getItem(hiddenKey) || "[]")); } catch (_) { return new Set(); } };
const hideComment = (id) => { try { const h = hiddenComments(); h.add(id); localStorage.setItem(hiddenKey, JSON.stringify([...h])); } catch (_) {} };
const commentsFor = (g) => {
  const hidden = hiddenComments();
  return state.comments.filter((c) => c.gameId === g.id && !isBlocked(c.userId) && !hidden.has(c.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

// Every teammate rates every teammate, and every player rates the ref.
function expectedVotes(g) {
  const a = g.teamA.playerIds.length, b = g.teamB?.playerIds.length || 0;
  return a * (a - 1) + b * (b - 1) + (g.ref ? a + b : 0);
}
// Opposition ratings (a Pro extra) are kept apart: they never count toward the main rating, MOTM or the reveal.
function isOppRating(r, g) {
  if (!g || r.target === "ref") return false;
  const a = teamOf(g, r.raterId), b = teamOf(g, r.target);
  return !!(a && b && a !== b);
}
const votesCast = (g) => state.ratings.filter((r) => r.gameId === g.id && !isOppRating(r, g)).length;
const revealAt = (g) => (g.finalAt ? new Date(g.finalAt).getTime() + REVEAL_HOURS * 36e5 : 0);

function isRevealed(g) {
  if (g.status !== "final") return false;
  if (revealCache.has(g.id)) return revealCache.get(g.id);
  const v = !g.finalAt || now() >= revealAt(g) || votesCast(g) >= expectedVotes(g);
  revealCache.set(g.id, v);
  return v;
}
const votingOpen = (g) => g.status === "final" && !isRevealed(g);

function ratingIndex(opp = false) {
  const idx = new Map();
  const games = new Map(state.games.map((g) => [g.id, g]));
  for (const r of state.ratings) {
    if (isOppRating(r, games.get(r.gameId)) !== opp) continue;
    const k = `${r.gameId}|${r.target}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r.score);
  }
  return idx;
}
const votesFor = (idx, gid, target) => (idx.get(`${gid}|${target}`) || []).length;
// A rating shows only after the reveal and once at least MIN_VOTES people have voted.
function ratingFor(idx, g, target) {
  if (!isRevealed(g)) return null;
  const xs = idx.get(`${g.id}|${target}`) || [];
  return xs.length >= MIN_VOTES ? avg(xs) : null;
}

const oppIndex = () => ratingIndex(true);

function motm(idx, g) {
  if (!isRevealed(g)) return null;
  let best = null;
  for (const id of gamePlayers(g)) {
    const r = ratingFor(idx, g, id);
    if (r == null) continue;
    const v = votesFor(idx, g.id, id);
    if (!best || r > best.rating || (r === best.rating && v > best.votes)) best = { playerId: id, rating: r, votes: v };
  }
  return best;
}

function winner(g) {
  if (g.status !== "final") return null;
  const a = Number(g.teamA.score), b = Number(g.teamB.score);
  return a > b ? "A" : b > a ? "B" : "D";
}

// Who I may rate: my own teammates (not me, never the other team) plus the ref.
function rateTargets(g, id) {
  const side = teamOf(g, id);
  if (!side || g.status !== "final") return [];
  const out = teamObj(g, side).playerIds.filter((p) => p !== id).map((p) => ({ target: p }));
  if (g.ref && g.ref.userId !== id) out.push({ target: "ref" });
  return out;
}
// Pro: the other team's players.
function oppTargets(g, id) {
  const side = teamOf(g, id);
  if (!side || g.status !== "final" || !g.teamB) return [];
  return teamObj(g, side === "A" ? "B" : "A").playerIds.map((p) => ({ target: p, opp: true }));
}
const myVote = (g, target) => state.ratings.find((r) => r.gameId === g.id && r.raterId === meId() && r.target === target);

function pendingGames() {
  if (!state.me) return [];
  return state.games.filter((g) => votingOpen(g) && rateTargets(g, meId()).some((t) => !myVote(g, t.target)));
}

function playerSummary(pid, sport = "all", season = "all") {
  const idx = ratingIndex();
  const games = [];
  for (const g of state.games) {
    if (g.status !== "final" || (sport !== "all" && g.sport !== sport) || (season !== "all" && seasonKey(g.date) !== season)) continue;
    const side = teamOf(g, pid);
    if (!side) continue;
    const w = winner(g);
    games.push({
      g, side,
      revealed: isRevealed(g),
      rating: ratingFor(idx, g, pid),
      votes: votesFor(idx, g.id, pid),
      res: w === "D" ? "D" : w === side ? "W" : "L",
      motm: motm(idx, g)?.playerId === pid,
      stats: g.stats?.[pid] || {},
      captain: captainOf(g, pid) === side,
    });
  }
  games.sort((a, b) => (b.g.date + (b.g.time || "")).localeCompare(a.g.date + (a.g.time || "")));
  const rated = games.filter((x) => x.rating != null);
  const bySport = {};
  for (const x of games) {
    const s = (bySport[x.g.sport] ??= { games: 0, totals: {}, ratings: [] });
    s.games++;
    if (x.rating != null) s.ratings.push(x.rating);
    for (const [k, v] of Object.entries(x.stats)) s.totals[k] = (s.totals[k] || 0) + (Number(v) || 0);
  }
  const reffed = state.games.filter((g) => g.status === "final" && g.ref?.userId === pid && (season === "all" || seasonKey(g.date) === season));
  const refRatings = reffed.map((g) => ratingFor(idx, g, "ref")).filter((r) => r != null);
  return {
    games, bySport, rated,
    avg: avg(rated.map((x) => x.rating)),
    wins: games.filter((x) => x.res === "W").length,
    losses: games.filter((x) => x.res === "L").length,
    draws: games.filter((x) => x.res === "D").length,
    motms: games.filter((x) => x.motm).length,
    best: rated.reduce((b, x) => (!b || x.rating > b.rating ? x : b), null),
    reffed: reffed.length,
    refAvg: avg(refRatings),
  };
}

function statLine(sport, stats) {
  const cfg = SPORTS[sport] || SPORTS.other;
  return cfg.stats.filter(([k]) => Number(stats?.[k])).map(([k, l]) => `${stats[k]} ${l}`).join(", ");
}

/* ---------- Badges ---------- */

const BADGES = [
  { id: "hattrick", code: "HT", name: "Hat-trick", how: "Score 3+ goals in a game", test: (s) => s.games.some((x) => (x.stats.goals || 0) >= 3) },
  { id: "playmaker", code: "AST", name: "Playmaker", how: "3+ assists in a game", test: (s) => s.games.some((x) => (x.stats.assists || 0) + (x.stats.ast || 0) >= 3) },
  { id: "wall", code: "SV", name: "The wall", how: "5+ saves in a game", test: (s) => s.games.some((x) => (x.stats.saves || 0) >= 5) },
  { id: "buckets", code: "20", name: "Bucket getter", how: "20+ points in a game", test: (s) => s.games.some((x) => x.g.sport === "basketball" && (x.stats.pts || 0) >= 20) },
  { id: "elite", code: "9+", name: "Elite night", how: "Get rated 9.0+ in a game", test: (s) => s.rated.some((x) => x.rating >= 9) },
  { id: "b2b", code: "B2B", name: "Back to back", how: "MOTM in two straight games", test: (s) => s.games.some((x, i) => x.motm && s.games[i + 1]?.motm) },
  { id: "heater", code: "W3", name: "Heater", how: "Win 3 games in a row", test: (s) => s.games.some((_, i) => s.games.slice(i, i + 3).length === 3 && s.games.slice(i, i + 3).every((x) => x.res === "W")) },
  { id: "skipper", code: "C", name: "Skipper", how: "Captain 3 games", test: (s) => s.games.filter((x) => x.captain).length >= 3 },
  { id: "regular", code: "10", name: "Regular", how: "Play 10 games", test: (s) => s.games.length >= 10 },
  { id: "whistle", code: "REF", name: "Trusted whistle", how: "Ref a game and get rated 7.5+", test: (s) => s.refAvg != null && s.refAvg >= 7.5 },
];

/* ============================================================
   Inbox (notifications built from activity)
   ============================================================ */

const seenKey = () => `ballUpTop.seen.${meId()}`;
function getSeen() {
  try { return Number(localStorage.getItem(seenKey()) || 0); } catch (_) { return 0; }
}
function setSeen(t) {
  try { localStorage.setItem(seenKey(), String(t)); } catch (_) {}
}

function buildInbox() {
  if (!state.me) return [];
  const me = meId();
  const idx = ratingIndex();
  const items = [];
  const add = (t, ic, html, href) => t && items.push({ t: new Date(t).getTime(), ic, html, href });
  const gName = (g) => `${esc(g.teamA.name)} vs ${g.teamB ? esc(g.teamB.name) : "open spot"}`;

  for (const f of incomingRequests()) add(f.createdAt, "users", `<b>${esc(uname(f.from))}</b> sent you a friend request`, "#/squad");

  for (const g of state.games) {
    const mine = gamePlayers(g).includes(me) || g.createdBy === me || g.ref?.userId === me;
    if (g.createdBy === me && g.teamB && g.claimedAt) add(g.claimedAt, "flag", `<b>${esc(uname(g.teamB.captainId))}</b> took the other side of your game. It's on.`, `#/g/${g.id}`);
    const side = teamOf(g, me);
    if (side && captainOf(g, me) !== side && g.status !== "final") {
      const t = teamObj(g, side);
      add(side === "A" ? g.createdAt : g.claimedAt, "user", `<b>${esc(uname(t.captainId))}</b> put you on ${esc(t.name)} for ${esc(relDate(g.date))}${g.time ? " at " + fmtTime(g.time) : ""}`, `#/g/${g.id}`);
    }
    if (g.ref?.userId === me && g.status !== "final") add(g.createdAt, "whistle", `You're reffing ${gName(g)} ${esc(relDate(g.date).toLowerCase())}`, `#/g/${g.id}`);
    if (captainOf(g, me) && g.status !== "final") {
      for (const r of rsvpsFor(g)) if (r.userId !== me && r.status === "in") add(r.createdAt, "check", `<b>${esc(uname(r.userId))}</b> is in for your run on ${esc(relDate(g.date))}`, `#/g/${g.id}`);
    }
    if (votingOpen(g) && side) {
      const left = rateTargets(g, me).filter((t) => !myVote(g, t.target)).length;
      add(g.finalAt, "star", left
        ? `Full time: ${esc(g.teamA.name)} ${g.teamA.score}–${g.teamB.score} ${esc(g.teamB.name)}. Rate your ${left} teammate${left > 1 ? "s" : ""} before votes close in ${untilText(revealAt(g) - now())}.`
        : `Your votes are in for ${gName(g)}. Ratings reveal in ${untilText(revealAt(g) - now())}.`, `#/g/${g.id}`);
    }
    if (isRevealed(g) && side) {
      const r = ratingFor(idx, g, me);
      const won = motm(idx, g)?.playerId === me;
      const at = g.finalAt ? Math.min(revealAt(g), now()) : null;
      add(at && new Date(at).toISOString(), won ? "trophy" : "star",
        won ? `You were man of the match in ${gName(g)} with a <b>${fmt(r)}</b>`
          : r != null ? `Ratings are in for ${gName(g)}. Your squad gave you <b>${fmt(r)}</b>.`
          : `Ratings are in for ${gName(g)}.`, `#/g/${g.id}`);
    }
    const all = commentsFor(g);
    for (const c of all) {
      if (c.userId === me) continue;
      const parent = c.parentId ? all.find((x) => x.id === c.parentId) : null;
      const snip = esc(c.body.length > 70 ? c.body.slice(0, 70) + "…" : c.body);
      if (parent?.userId === me) add(c.createdAt, "chat", `<b>${esc(uname(c.userId))}</b> replied to you: “${snip}”`, `#/g/${g.id}#banter`);
      else if (mine) add(c.createdAt, "chat", `<b>${esc(uname(c.userId))}</b> on ${gName(g)}: “${snip}”`, `#/g/${g.id}#banter`);
    }
  }
  const seen = getSeen();
  return items
    .filter((i) => i.t <= now() + 6e4)
    .sort((a, b) => b.t - a.t)
    .slice(0, 50)
    .map((i) => ({ ...i, unread: i.t > seen }));
}

/* ============================================================
   Formations
   ============================================================ */

function formationOptions(outfield) {
  if (outfield <= 0) return [""];
  if (outfield <= 2) return outfield === 1 ? ["1"] : ["2", "1-1"];
  const out = [];
  const rec = (left, parts) => {
    if (left === 0) {
      if (parts.length >= 2 && parts.length <= 4) out.push(parts);
      return;
    }
    if (parts.length >= 4) return;
    for (let n = 1; n <= Math.min(5, left); n++) rec(left - n, [...parts, n]);
  };
  rec(outfield, []);
  const score = (p) => {
    let s = 0;
    if (p.length === 3) s -= 3;
    if (p.length === 4 && outfield >= 8) s -= 2;
    if (p.length === 2 && outfield <= 4) s -= 2;
    if (p[0] >= 2 && p[0] <= 4) s -= 2;
    if (p[p.length - 1] <= 2) s -= 1;
    const m = outfield / p.length;
    s += p.reduce((a, x) => a + (x - m) ** 2, 0) * 0.4;
    return s;
  };
  return out.sort((a, b) => score(a) - score(b)).slice(0, 8).map((p) => p.join("-"));
}

function slotKeys(formation, gk) {
  const keys = gk ? ["gk"] : [];
  if (formation) formation.split("-").map(Number).forEach((n, li) => { for (let j = 0; j < n; j++) keys.push(`${li}-${j}`); });
  return keys;
}

// Keep the team's formation and slot assignments valid for its current roster.
function normalizeTeam(team, sport) {
  if (sport !== "soccer") {
    team.formation = null;
    team.gk = false;
    team.slots = {};
    team.positions ??= {};
    for (const k of Object.keys(team.positions)) if (!team.playerIds.includes(k)) delete team.positions[k];
    return team;
  }
  const n = team.playerIds.length;
  if (n < 2) team.gk = false;
  const outfield = n - (team.gk ? 1 : 0);
  const sum = (team.formation || "").split("-").filter(Boolean).map(Number).reduce((a, b) => a + b, 0);
  if (sum !== outfield) team.formation = formationOptions(outfield)[0];
  const keys = slotKeys(team.formation, team.gk);
  const slots = {};
  const used = new Set();
  for (const k of keys) {
    const p = team.slots?.[k];
    if (p && team.playerIds.includes(p) && !used.has(p)) { slots[k] = p; used.add(p); }
  }
  const free = team.playerIds.filter((p) => !used.has(p));
  for (const k of keys) if (!slots[k]) slots[k] = free.shift();
  team.slots = slots;
  team.positions = {};
  return team;
}

function pitch(team, { editable = false, idx = null, g = null, selected = null } = {}) {
  const lines = (team.formation || "").split("-").filter(Boolean).map(Number);
  const token = (key) => {
    const pid = team.slots[key];
    if (!pid) return `<div class="token empty"></div>`;
    const r = idx && g ? ratingFor(idx, g, pid) : null;
    const tag = editable ? "button" : "a";
    const attrs = editable ? `type="button" data-slot="${key}"` : `href="#/p/${pid}"`;
    return `<${tag} class="token ${selected === key ? "sel" : ""}" ${attrs}>
      ${avatar(pid)}${r != null ? `<span class="tbadge">${badge(r, "sm")}</span>` : ""}
      ${team.captainId === pid ? '<span class="cap" title="Captain">C</span>' : ""}
      <span class="tname">${esc(firstName(pid))}</span></${tag}>`;
  };
  const rows = lines.map((n, li) => `<div class="prow">${Array.from({ length: n }, (_, j) => token(`${li}-${j}`)).join("")}</div>`).reverse().join("");
  return `
  <div class="pitch">
    <div class="pitch-lines"><span class="circle"></span><span class="half"></span><span class="box"></span><span class="six"></span></div>
    <div class="formation-tag">${esc(team.formation || "")}${team.gk ? "" : " no keeper"}</div>
    ${rows}
    ${team.gk ? `<div class="prow gk">${token("gk")}</div>` : ""}
  </div>`;
}

function slotLabel(team, pid) {
  const key = Object.keys(team.slots || {}).find((k) => team.slots[k] === pid);
  if (!key) return null;
  if (key === "gk") return "GK";
  const lines = (team.formation || "").split("-").length;
  const li = Number(key.split("-")[0]);
  if (lines === 1) return "Outfield";
  if (li === 0) return "DEF";
  if (li === lines - 1) return "ATT";
  return "MID";
}

// Little booking cards next to a name: one yellow per caution, red if sent off.
function cardMarks(stats) {
  const y = Math.min(2, Number(stats?.yc) || 0), r = Math.min(1, Number(stats?.rc) || 0);
  if (!y && !r) return "";
  const marks = [...Array(y)].map(() => '<i class="bk yc"></i>').join("") + (r ? '<i class="bk rc"></i>' : "");
  const label = [y ? `${y} yellow card${y > 1 ? "s" : ""}` : "", r ? "red card" : ""].filter(Boolean).join(", ");
  return ` <span class="bookings" role="img" aria-label="${label}" title="${label}">${marks}</span>`;
}

function lineupList(g, team, idx) {
  const revealed = isRevealed(g);
  const rows = team.playerIds
    .map((pid) => ({ pid, r: idx ? ratingFor(idx, g, pid) : null, v: idx ? votesFor(idx, g.id, pid) : 0 }))
    .sort((a, b) => (b.r ?? -1) - (a.r ?? -1));
  const top = idx ? motm(idx, g) : null;
  const oidx = revealed ? oppIndex() : null;
  return rows.map(({ pid, r, v }) => {
    let right = "";
    if (g.status === "final") {
      const o = oidx ? ratingFor(oidx, g, pid) : null;
      right = revealed
        ? `<div class="rcol">${badge(r)}<small>${r == null && v < MIN_VOTES ? `${v} vote${v === 1 ? "" : "s"}, needs ${MIN_VOTES}` : `${v} votes`}</small>${o != null ? `<small class="opp-r" title="Average rating from the other team">Opp ${fmt(o)}</small>` : ""}</div>`
        : `<div class="rcol"><span class="badge r-none hidden-r">?</span><small>Hidden</small></div>`;
    }
    const sub = [team.positions?.[pid], g.sport === "soccer" ? slotLabel(team, pid) : null, statLine(g.sport, g.stats?.[pid])].filter(Boolean).map(esc);
    return `
    <a class="lineup-row" href="#/p/${pid}">
      ${avatar(pid)}
      <div class="grow"><b>${esc(uname(pid))}${team.captainId === pid ? ' <span class="cap-inline">C</span>' : ""}${top?.playerId === pid ? ' <span class="motm-inline">MOTM</span>' : ""}${cardMarks(g.stats?.[pid])}</b>
      ${sub.length ? meta(...sub) : ""}</div>
      ${right}
    </a>`;
  }).join("");
}

/* ============================================================
   Shared components
   ============================================================ */

// Broadcast-style ticker row: two stacked team lines with score boxes.
function gameRow(g, idx) {
  const cfg = sportOf(g);
  const w = winner(g);
  const top = motm(idx, g);
  const voting = votingOpen(g);
  const lu = g.status !== "final" ? lineup(g) : null;
  const full = lu?.cap && lu.confirmed.length >= lu.cap;
  const inTag = lu ? `<span class="tk-sub">${full ? "Full" : `${spotsText(lu)} in`}${lu.waitlist.length ? ` +${lu.waitlist.length} waiting` : ""}</span>` : "";
  const line = (side) => {
    const t = teamObj(g, side);
    if (!t) return `<div class="tk-line open"><span class="avatar xs ghost"></span><span class="tk-name">Open spot</span><span class="tk-score"></span></div>`;
    const won = w === side;
    return `<div class="tk-line ${won ? "won" : ""} ${w && !won && w !== "D" ? "lost" : ""}">
      ${avatar(t.captainId, "xs")}<span class="tk-name">${esc(t.name)}</span>
      <span class="tk-score">${g.status === "final" ? esc(t.score) : ""}</span></div>`;
  };
  let side;
  if (g.status === "open") side = `<span class="tag gold">Needs a captain</span>${inTag}`;
  else if (g.status === "ready") side = `<span class="tag blue">Upcoming</span>${inTag}`;
  else if (voting) side = `<span class="tag">Voting</span><span class="tk-sub">${icon("clock")} ${untilText(revealAt(g) - now())}</span>`;
  else if (top) side = `${avatar(top.playerId, "sm")}<span class="tk-motm"><small>MOTM</small>${esc(firstName(top.playerId))}</span>${badge(top.rating)}`;
  else side = `<span class="tk-sub">Full time</span>`;
  const row = `
  <a class="tk" href="#/g/${g.id}">
    <div class="tk-when">${icon(cfg.icon)}<b>${esc(relDate(g.date))}</b><small>${g.status === "final" ? formatLabel(g) : fmtTime(g.time) || formatLabel(g)}</small></div>
    <div class="tk-teams">${line("A")}${line("B")}${g.isPublic ? `<span class="tk-pub">${icon("globe")} Public${g.location ? ` · ${esc(g.location)}` : ""}</span>` : ""}</div>
    <div class="tk-side">${side}</div>
  </a>`;
  if (!lu || lu.order.slice(0, gamePlayers(g).length).includes(meId())) return row;
  return `<div class="tk-wrap">${row}${quickRsvp(g, lu)}</div>`;
}

// RSVP buttons right on a feed card.
function quickRsvp(g, lu = lineup(g)) {
  const my = rsvpOf(g, meId());
  const pos = lu.waitlist.indexOf(meId());
  const status = my === "in" ? (pos >= 0 ? `Waitlist #${pos + 1}` : "You're in") : my === "maybe" ? "Maybe" : my === "out" ? "Out" : "";
  const b = (k, label) => `<button type="button" class="qr ${my === k ? "on " + k : ""}" data-qrsvp="${k}" data-gid="${g.id}">${label}</button>`;
  return `<div class="tk-rsvp">${status ? `<span class="qr-status ${my}">${status}</span>` : `<span class="qr-status muted">Going?</span>`}
    ${b("in", lu.cap && lu.confirmed.length >= lu.cap && my !== "in" ? "Join waitlist" : "I'm in")}${b("maybe", "Maybe")}${b("out", "Can't")}</div>`;
}

async function doRsvp(gid, want, btn) {
  const g = state.games.find((x) => x.id === gid);
  if (!g) return;
  const cur = rsvpOf(g, meId());
  const next = cur === want ? null : want;
  await act(btn, async () => {
    await store.setRsvp(gid, meId(), next);
    await reload();
    rerenderKeepScroll();
    const lu = lineup(state.games.find((x) => x.id === gid) || g);
    const pos = lu.waitlist.indexOf(meId());
    toast(!next ? "RSVP removed" : next === "in" ? (pos >= 0 ? `It's full. You're #${pos + 1} on the waitlist and move up if someone drops.` : "You're in") : next === "maybe" ? "Marked as maybe" : "Marked as out");
    if (next === "in" && pos < 0) syncReminders(true);
  });
}

function sportChips(active, attr) {
  const opts = [["all", "All sports"], ...Object.entries(SPORTS).map(([k, v]) => [k, v.label])];
  return `<div class="chips">${opts.map(([k, l]) => `<button class="chip ${active === k ? "on" : ""}" data-${attr}="${k}">${k !== "all" ? icon(SPORTS[k].icon) : ""}${l}</button>`).join("")}</div>`;
}

function sparkline(values) {
  if (values.length < 2) return "";
  const w = 300, h = 70, pad = 8;
  const min = Math.min(5, ...values), max = Math.max(10, ...values);
  const x = (i) => pad + (i * (w - pad * 2)) / (values.length - 1);
  const y = (v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${x(0).toFixed(1)},${h} ${pts} ${x(values.length - 1).toFixed(1)},${h}`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Rating trend">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2b6bff" stop-opacity=".35"/><stop offset="1" stop-color="#2b6bff" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${w}" y1="${y(7).toFixed(1)}" y2="${y(7).toFixed(1)}" class="ref"/>
    <polygon points="${area}" fill="url(#sg)"/>
    <polyline points="${pts}" class="line"/>
    ${values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === values.length - 1 ? 5 : 3.5}" class="dot ${ratingClass(v)}"/>`).join("")}</svg>`;
}

/* ============================================================
   Auth
   ============================================================ */

const APPLE_LOGO = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="currentColor"><path d="M16.37 12.7c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.27-.87-2.29-3.52zM14.2 6.22c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.22z"/></svg>`;
const GOOGLE_G = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

function authOptions() {
  const a = window.BUT_CONFIG?.AUTH || {};
  return { apple: isNative() ? !!a.APPLE_IOS : !!a.APPLE_WEB, google: !!a.GOOGLE, phone: !!a.PHONE };
}

function viewAuth() {
  const shared = store.mode === "shared";
  const login = state.authTab === "login";
  const phoneMode = state.authTab === "phone";
  const forgotMode = state.authTab === "forgot";
  let form;
  if (forgotMode) {
    form = state.resetSentTo
      ? `<div class="stack">
           <p>Check <b>${esc(state.resetSentTo)}</b> for a link to reset your password. It can take a minute, and check spam too.</p>
           <button type="button" class="btn block" id="forgot-back">Back to log in</button>
         </div>`
      : `<form id="forgot-form" class="stack">
           <p class="muted small">Enter the email you signed up with and we'll send you a link to pick a new password.</p>
           <label>Email<input name="email" id="f-remail" type="email" autocomplete="email" required></label>
           <button class="btn primary block big">Send reset link</button>
           <button type="button" class="btn quiet small" id="forgot-back">Back to log in</button>
         </form>`;
  } else if (phoneMode) {
    form = state.phone.sent
      ? `<form id="phone-form" class="stack">
           <p class="muted small">We texted a 6-digit code to <b>${esc(state.phone.number)}</b>.</p>
           <label>Code<input name="code" id="f-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
           <button class="btn primary block big">Verify and log in</button>
           <button type="button" class="btn quiet small" id="phone-back">Use a different number</button>
         </form>`
      : `<form id="phone-form" class="stack">
           <label>Phone number<input name="phone" id="f-phone" type="tel" autocomplete="tel" placeholder="+1 401 555 0123" required value="${esc(state.phone.number)}"></label>
           <button class="btn primary block big">Text me a code</button>
         </form>`;
  } else {
    form = `<form id="auth-form" class="stack">
        ${login
          ? `<label>${shared ? "Email" : "Username"}<input name="login" id="f-login" ${shared ? 'type="email"' : ""} autocomplete="username" required></label>
             <label>Password<input name="password" id="f-pass" type="password" autocomplete="current-password" required></label>
             <button class="btn primary block big">Log in</button>
             <button type="button" class="linkish forgot" id="forgot-btn">Forgot password?</button>`
          : `${shared ? `<label>Email<input name="email" id="f-email" type="email" autocomplete="email" required></label>` : ""}
             <label>Username<input name="username" id="f-user" autocomplete="username" placeholder="jaybuckets" required pattern="[A-Za-z0-9_.]{3,20}"></label>
             <label>Display name<input name="displayName" id="f-dname" placeholder="What the squad calls you" required></label>
             <label>Password<input name="password" id="f-npass" type="password" autocomplete="new-password" minlength="6" required></label>
             <button class="btn primary block big">Create account</button>`}
      </form>`;
  }
  return `
  <div class="auth ${login || phoneMode || forgotMode ? "" : "is-signup"}" style="--img:url('${IMG.ball}')">
    <div class="auth-panel">
      <div class="lockup"><img class="logo-full" src="${IMG.logo}" alt="Who Cooked"></div>
      <h1 class="auth-h">Every run, rated by the people who were there.</h1>
      ${(() => {
        // Only show sign-in options that are actually switched on (config.js AUTH), so nothing errors.
        const on = shared ? authOptions() : { apple: true, google: true, phone: true };
        const soon = shared ? "" : "soon";
        const btns = [
          on.apple ? `<button type="button" class="btn social-btn apple ${soon}" id="apple-btn">${APPLE_LOGO} Continue with Apple</button>` : "",
          on.google ? `<button type="button" class="btn social-btn ${soon}" id="google-btn">${GOOGLE_G} Continue with Google</button>` : "",
          on.phone ? `<button type="button" class="btn social-btn ${soon} ${phoneMode ? "on" : ""}" id="phone-btn">${icon("phone")} Continue with phone</button>` : "",
        ].join("");
        if (!btns) return "";
        return `<div class="social">${btns}</div>
          ${shared ? "" : `<p class="muted small soon-note">Apple, Google and phone sign-in switch on once your league database is connected. In demo mode, use a username.</p>`}
          <div class="or"><span>or ${shared ? "use email" : "use a username"}</span></div>`;
      })()}
      <div class="tabs">
        <button class="${login ? "on" : ""}" data-tab="login">Log in</button>
        <button class="${state.authTab === "signup" ? "on" : ""}" data-tab="signup">Create account</button>
      </div>
      ${form}
      ${shared ? "" : `<p class="demo-note">Demo mode: accounts live in this browser only. Log in as <code>marcus</code> with password <code>demo123</code>, or create your own.</p>`}
    </div>
  </div>`;
}

function bindAuth() {
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { state.authTab = b.dataset.tab; render(); }));
  const afterLogin = async () => {
    await reload();
    location.hash = "#/";
    render();
    if (state.me && !state.me.needsSetup) toast(`Welcome, ${state.me.displayName}`);
  };
  // In shared mode this redirects to Google; in demo mode it explains why it's off.
  $("#google-btn")?.addEventListener("click", (e) => act(e.currentTarget, () => store.signInWithGoogle()));
  $("#apple-btn")?.addEventListener("click", (e) => act(e.currentTarget, async () => {
    await store.signInWithApple();
    if (isNative()) await afterLogin(); // native sheet signs in without leaving the app
  }));
  $("#phone-btn")?.addEventListener("click", () => {
    if (!store.supportsSocialLogin) return toast("Phone sign-in switches on once the league database is connected (see README).");
    state.authTab = "phone";
    render();
  });
  $("#phone-back")?.addEventListener("click", () => { state.phone.sent = false; render(); });
  $("#forgot-btn")?.addEventListener("click", () => { state.authTab = "forgot"; state.resetSentTo = ""; render(); setTimeout(() => $("#f-remail")?.focus(), 0); });
  $("#forgot-back")?.addEventListener("click", () => { state.authTab = "login"; state.resetSentTo = ""; render(); });
  $("#forgot-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    act($("button", e.target), async () => {
      await store.sendPasswordReset(email);
      state.resetSentTo = email;
      render();
    });
  });
  $("#phone-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    act($("button", f), async () => {
      if (!state.phone.sent) {
        const num = f.phone.value.replace(/[^\d+]/g, "");
        if (!/^\+\d{8,15}$/.test(num)) throw new Error("Include your country code, like +1 401 555 0123.");
        await store.sendPhoneCode(num);
        state.phone = { number: num, sent: true };
        render();
        toast("Code sent");
      } else {
        await store.verifyPhoneCode(state.phone.number, f.code.value);
        state.phone = { number: "", sent: false };
        await afterLogin();
      }
    });
  });
  $("#auth-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    act($("button", f), async () => {
      if (state.authTab === "login") {
        await store.signIn({ login: f.login.value, password: f.password.value });
      } else {
        const u = await store.signUp({ username: f.username.value, displayName: f.displayName.value, password: f.password.value, email: f.email?.value });
        if (f.photo?.files?.[0]) {
          try { await store.uploadAvatar(u.id, f.photo.files[0]); } catch (err) { toast(err.message); }
        }
      }
      await afterLogin();
    });
  });
}

/* Arrived from a password-reset email: choose a new password. */
function viewNewPassword() {
  return `
  <div class="auth ${login || phoneMode || forgotMode ? "" : "is-signup"}" style="--img:url('${IMG.ball}')">
    <div class="auth-panel">
      <div class="lockup"><img class="logo-full" src="${IMG.logo}" alt="Who Cooked"></div>
      <h1 class="auth-h">Pick a new password</h1>
      <form id="newpass-form" class="stack">
        <label>New password<input name="password" id="n-pass" type="password" autocomplete="new-password" minlength="6" required></label>
        <label>Type it again<input name="again" id="n-pass2" type="password" autocomplete="new-password" minlength="6" required></label>
        <button class="btn primary block big">Save new password</button>
      </form>
    </div>
  </div>`;
}

function bindNewPassword() {
  $("#n-pass").focus();
  $("#newpass-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    act($("button", f), async () => {
      if (f.password.value !== f.again.value) throw new Error("Those passwords don't match.");
      await store.updatePassword(f.password.value);
      location.hash = "#/";
      render();
      toast("Password updated. You're logged in.");
    });
  });
}

/* First login with Google or phone: pick a username and add a photo. */
function viewSetup() {
  const u = state.me;
  return `
  <div class="auth ${login || phoneMode || forgotMode ? "" : "is-signup"}" style="--img:url('${IMG.ball}')">
    <div class="auth-panel">
      <h1 class="auth-h">You're in. Pick the name your squad will see.</h1>
      <form id="setup-form" class="stack">
        <div class="setup-photo">${avatar(u.id, "xxl")}
          <label class="btn">${icon("camera")} ${u.avatar ? "Change photo" : "Add a profile pic"}<input type="file" id="setup-photo" accept="image/*" hidden></label></div>
        <label>Username<input name="username" id="s-user" required pattern="[A-Za-z0-9_.]{3,20}" value="${esc(u.username)}" autocomplete="username"></label>
        <label>Display name<input name="displayName" id="s-dname" required maxlength="30" value="${esc(u.displayName === "Player" ? "" : u.displayName)}" placeholder="What the squad calls you"></label>
        <button class="btn primary block big">Save and continue</button>
        <button type="button" class="btn quiet small" id="setup-out">Log out</button>
      </form>
    </div>
  </div>`;
}

function bindSetup() {
  $("#setup-photo").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) act(null, async () => { await store.uploadAvatar(meId(), file); await reload(); render(); });
  });
  $("#setup-out").addEventListener("click", async () => { await store.signOut(); await reload(); render(); });
  $("#setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    act($("button", f), async () => {
      await store.completeSetup(meId(), { username: f.username.value, displayName: f.displayName.value });
      await reload();
      location.hash = "#/";
      render();
      toast(`Welcome, ${state.me.displayName}`);
    });
  });
}

/* ============================================================
   Pro upgrade page (the app is free; Pro unlocks extra stats)
   ============================================================ */

const PRO_PERKS = [
  ["star", "Avatar frames", "Gold, flame, ice or neon ring around your picture, everywhere it shows up."],
  ["user", "Custom profile", "Pick your profile color, add a tagline and your jersey number."],
  ["check", "Pro badge", "A PRO tag next to your name on your profile."],
  ["chart", "Rating trend", "Every rating you've ever had on one chart, plus your best game."],
  ["calendar", "Season recaps", "Month by month: games, record, average rating, MOTMs and your best night."],
  ["x", "No ads", "Free players see a small sponsored spot on the feed and leaderboard. Pro hides it."],
];

// Pro profile customization options.
const FRAMES = { gold: "Gold", flame: "Flame", ice: "Ice", neon: "Neon" };
const THEMES = { blue: "#2f6bff", red: "#ef4444", green: "#22c55e", gold: "#f5b301", purple: "#a855f7", orange: "#ff7a1a", teal: "#14b8a6" };
const styleOf = (id) => user(id)?.style || {};

// In the iPhone app, Pro stays hidden until real payments are switched on (no "preview" for App Review).
const proOffered = () => billing.enabled || !isNative();

function proLock(title, blurb) {
  if (!proOffered()) return "";
  return `<section class="panel pad pro-lock">
    <div class="block-head tight"><h3>${title}</h3><span class="pro-tag">PRO</span></div>
    <p class="muted small">${blurb}</p>
    <a class="btn primary" href="#/plans">Unlock with Pro</a>
  </section>`;
}

function viewPaywall() {
  const plans = state.plans;
  const sel = plans.find((p) => p.id === state.plan) || plans[0];
  const native = isNative();
  const live = billing.enabled;
  const pro = billing.isPro();
  const active = billing.activeLabel();
  const cta = sel.trial ? "Start my 7-day free trial" : `Buy lifetime for ${sel.price}`;
  const after = sel.trial ? `7 days free, then ${sel.price} per ${sel.per}. Cancel anytime before the trial ends and you won't be charged.` : `One payment of ${sel.price}. No subscription, no renewals.`;
  const legal = native
    ? "Payment is charged to your Apple ID when the trial ends or at purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings."
    : "Charged to your card through Stripe when the trial ends or at purchase. Subscriptions renew automatically until you cancel, which you can do anytime from your profile.";
  return `
  <div class="paywall" style="--img:url('${IMG.motm}')">
    <div class="pw-panel">
      <a class="back" href="#/p/${meId()}">Profile</a>
      <img class="logo-full" src="${IMG.logo}" alt="Who Cooked">
      <h1 class="auth-h">${active ? "You're Pro" : "Go Pro"}</h1>
      <p class="muted">Playing, rating and MOTM are free for everyone. Pro is for the stat heads.</p>
      ${active ? `<p class="muted">${esc(active.plan)} plan${active.trial ? " (free trial)" : ""}${active.expires && active.renews ? `, renews ${new Date(active.expires).toLocaleDateString()}` : active.expires ? `, ends ${new Date(active.expires).toLocaleDateString()}` : ""}.</p>` : ""}
      <ul class="pw-perks">
        ${PRO_PERKS.map(([ic, t, d]) => `<li>${icon(ic)}<span><b>${t}.</b> ${d}</span></li>`).join("")}
      </ul>
      ${active ? "" : `
      <div class="plans" role="radiogroup" aria-label="Plans">
        ${plans.map((p) => `
        <button type="button" class="plan ${p.id === sel.id ? "on" : ""}" data-plan="${p.id}" role="radio" aria-checked="${p.id === sel.id}">
          <span class="plan-radio"></span>
          <span class="plan-main"><b>${p.label}</b><small>${p.trial ? `7 days free${p.note ? `, ${p.note.toLowerCase()}` : ""}` : p.note}</small></span>
          <span class="plan-price"><b>${esc(p.price)}</b><small>${p.per === "once" ? "once" : `per ${p.per}`}</small></span>
          ${p.popular ? `<span class="plan-tag">Most popular</span>` : ""}
        </button>`).join("")}
      </div>
      <button class="btn primary block big" id="pw-buy">${cta}</button>
      <p class="pw-after">${after}</p>`}
      ${!live ? `<div class="demo-note">Payments switch on once the App Store and Stripe are connected. Until then you can preview Pro on this device.
        <button class="btn ${pro ? "quiet" : ""} mt" id="pw-preview">${pro ? "Turn off Pro preview" : "Preview Pro"}</button></div>` : ""}
      <div class="pw-links">
        <button class="linkish" id="pw-restore">${native ? "Restore purchases" : "Already subscribed? Refresh"}</button>
        <a href="terms.html" target="_blank" rel="noopener">Terms</a>
        <a href="privacy.html" target="_blank" rel="noopener">Privacy</a>
      </div>
      <p class="pw-legal">${legal}</p>
    </div>
  </div>`;
}

function bindPaywall() {
  $$("[data-plan]").forEach((b) => b.addEventListener("click", () => { state.plan = b.dataset.plan; rerenderKeepScroll(); }));
  $("#pw-buy")?.addEventListener("click", (e) => act(e.currentTarget, async () => {
    if (!billing.enabled) throw new Error("Payments switch on once the App Store and Stripe are connected.");
    const ok = await billing.purchase(state.plan, state.me?.email);
    if (ok) { toast("You're Pro. Enjoy the stats."); location.hash = `#/p/${meId()}`; render(); }
  }));
  $("#pw-restore").addEventListener("click", (e) => act(e.currentTarget, async () => {
    const ok = await billing.restore();
    toast(ok ? "Pro restored" : "No active Pro plan found for this account.");
    if (ok) rerenderKeepScroll();
  }));
  $("#pw-preview")?.addEventListener("click", () => {
    billing.previewPro = !billing.previewPro;
    toast(billing.previewPro ? "Pro preview on for this device" : "Pro preview off");
    rerenderKeepScroll();
  });
}

/* ============================================================
   Feed
   ============================================================ */

/* ============================================================
   Nearby: public games on a map
   ============================================================ */

const publicGames = () => {
  const today = localDate();
  return state.games.filter((g) => g.isPublic && g.status !== "final" && g.lat != null && g.lng != null && g.date >= today && !isBlocked(g.createdBy));
};

function viewNearby() {
  const sportOk = (g) => state.nearFilter === "all" || g.sport === state.nearFilter;
  const list = publicGames().filter(sportOk);
  const here = state.nearMe;
  const rows = list.map((g) => ({ g, km: here ? distanceKm(here, g) : null }))
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || (a.g.date + a.g.time).localeCompare(b.g.date + b.g.time));
  return `
  <div data-norefresh>
  <h1 class="page-title">Nearby games</h1>
  <p class="lead">Public pickup runs near you. RSVP to one, or host your own and anyone nearby can join.</p>
  <a class="btn primary near-host" href="#/new/public">${icon("plus")} Host a public game</a>
  ${sportChips(state.nearFilter, "near")}
  <div class="near-map" id="near-map"><div class="muted small near-loading">Loading map</div></div>
  <p class="muted small" id="near-loc">${here ? "" : `<button type="button" class="link-btn" id="near-me">${"Use my location"}</button> to sort games by distance.`}</p>
  <section class="block">
    ${rows.length ? `<div class="panel ticker">${rows.map(({ g, km }) => `
      <div class="near-row">
        ${km != null ? `<span class="near-dist">${icon("pin")} ${fmtDistance(km)}</span>` : ""}
        ${gameRow(g, ratingIndex())}
      </div>`).join("")}</div>`
      : `<div class="empty">No public games coming up${state.nearFilter !== "all" ? ` for ${esc(SPORTS[state.nearFilter].label.toLowerCase())}` : ""} yet. <a href="#/new/public">Host one</a> and it shows up here for everyone nearby.</div>`}
  </section>
  </div>`;
}

let nearbyMap = null;
function bindNearby() {
  $$("[data-near]").forEach((b) => b.addEventListener("click", () => { state.nearFilter = b.dataset.near; render(); }));
  const sportOk = (g) => state.nearFilter === "all" || g.sport === state.nearFilter;
  const games = publicGames().filter(sportOk).map((g) => {
    const lu = lineup(g);
    return { g, html: `<a class="pop" href="#/g/${g.id}"><b>${esc(SPORTS[g.sport]?.label || "")} · ${esc(relDate(g.date))}${g.time ? ` ${fmtTime(g.time)}` : ""}</b>
      <span>${esc(g.location || "Pinned spot")}</span><span>${lu.cap ? `${lu.confirmed.length}/${lu.cap} spots` : `${lu.confirmed.length} in`} · hosted by ${esc(firstName(g.createdBy))}</span><em>Open game</em></a>` };
  });
  const el = $("#near-map");
  nearbyMap?.map?.remove?.();
  mountNearby(el, games, state.nearMe).then((m) => { nearbyMap = m; el.querySelector(".near-loading")?.remove(); })
    .catch((err) => { el.innerHTML = `<div class="empty small">${esc(err.message)}</div>`; });
  const locate = (manual) => myLocation().then((p) => {
    const first = !state.nearMe;
    state.nearMe = { lat: p.lat, lng: p.lng };
    if (first && location.hash.startsWith("#/nearby")) rerenderKeepScroll();
  }).catch((err) => { if (manual) toast(err.message); });
  $("#near-me")?.addEventListener("click", () => locate(true));
  if (!state.nearMe) locate(false);
}

function viewFeed() {
  const idx = ratingIndex();
  const friends = friendIds();
  const sportOk = (g) => state.feedFilter === "all" || g.sport === state.feedFilter;
  const inScope = (g) => state.feedScope === "all" || g.createdBy === meId() || gamePlayers(g).some((p) => p === meId() || friends.has(p));
  const games = state.games.filter((g) => sportOk(g) && inScope(g));
  const open = state.games.filter((g) => g.status === "open" && sportOk(g)).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = games.filter((g) => g.status === "ready").sort((a, b) => a.date.localeCompare(b.date));
  const results = games.filter((g) => g.status === "final").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const sum = playerSummary(meId());
  const season = playerSummary(meId(), "all", currentSeason());
  const pending = pendingGames();
  const requests = incomingRequests();

  const highlights = [];
  for (const g of results.slice(0, 12)) {
    for (const pid of gamePlayers(g)) {
      const r = ratingFor(idx, g, pid);
      if (r != null && r >= 8) highlights.push({ g, pid, r, motm: motm(idx, g)?.playerId === pid });
    }
  }
  highlights.sort((a, b) => b.r - a.r);

  const alerts = [];
  for (const g of pending) {
    const left = rateTargets(g, meId()).filter((t) => !myVote(g, t.target)).length;
    alerts.push(`<a class="alert hot" href="#/g/${g.id}">${icon("star")}<span>Rate ${left} teammate${left > 1 ? "s" : ""} from ${esc(g.teamA.name)} vs ${esc(g.teamB.name)}. Votes close in ${untilText(revealAt(g) - now())}.</span><b>Rate now</b></a>`);
  }
  if (requests.length) alerts.push(`<a class="alert" href="#/squad">${icon("users")}<span>${requests.length} friend request${requests.length > 1 ? "s" : ""} waiting.</span><b>View</b></a>`);
  if (!state.me.avatar) alerts.push(`<a class="alert" href="#/p/${meId()}">${icon("camera")}<span>Add a profile pic so the squad knows who's who.</span><b>Add photo</b></a>`);

  const section = (title, note, list) => list.length ? `
    <section class="block">
      <div class="block-head"><h2>${title}</h2>${note ? `<span class="muted small">${note}</span>` : ""}</div>
      <div class="panel ticker">${list.map((g) => gameRow(g, idx)).join("")}</div>
    </section>` : "";

  return `
  <section class="me-hero" style="--img:url('${IMG.hero}')">
    <a class="me-id" href="#/p/${meId()}">
      ${avatar(meId(), "xl")}
      <div>
        <h1>${esc(state.me.displayName)}</h1>
        ${meta(`${sum.games.length} games`, `${sum.wins}-${sum.draws || 0}-${sum.losses} W-D-L`, `${sum.motms} MOTM`)}
      </div>
    </a>
    <div class="me-nums">
      <div class="me-num"><span class="me-label">Overall</span>${badge(sum.avg, "xl")}</div>
      <div class="me-num"><span class="me-label">${esc(seasonLabel(currentSeason()).split(" ")[0])}</span>${badge(season.avg, "xl")}</div>
    </div>
    <a class="btn primary big me-cta" href="#/new">${icon("plus")} Start a game</a>
  </section>

  ${alerts.length ? `<div class="alerts">${alerts.join("")}</div>` : ""}

  ${highlights.length ? `
  <section class="block">
    <div class="block-head"><h2>Highlights</h2><span class="muted small">Rated 8.0 or higher</span></div>
    <div class="hl-strip">${highlights.slice(0, 10).map((h) => `
      <a class="hl" href="#/g/${h.g.id}">
        ${avatar(h.pid, "lg")}${badge(h.r)}
        <b>${esc(firstName(h.pid))}</b>
        <small>${h.motm ? "MOTM, " : ""}${esc(relDate(h.g.date))}</small>
      </a>`).join("")}</div>
  </section>` : ""}

  ${ads.slot()}

  <div class="feed-controls">
    <div class="seg2">
      <button class="${state.feedScope === "friends" ? "on" : ""}" data-scope="friends">Friends</button>
      <button class="${state.feedScope === "all" ? "on" : ""}" data-scope="all">Everyone</button>
    </div>
    ${sportChips(state.feedFilter, "feed")}
  </div>

  ${(() => { const n = publicGames().length; return `<a class="alert near-cta" href="#/nearby">${icon("pin")}<span>${n ? `${n} public game${n > 1 ? "s" : ""} coming up. See what's near you.` : "Find public games near you, or host one anyone can join."}</span><b>Nearby</b></a>`; })()}

  ${section("Open runs", "Needs a second captain", open)}
  ${section("Upcoming", "", upcoming)}
  ${section("Results", "", results)}
  ${!results.length ? `<div class="empty">${state.feedScope === "friends"
    ? `No games from you or your friends yet. <a href="#/squad">Add friends</a> or <a href="#/new">start a game</a>.`
    : `No results yet. <a href="#/new">Start a game</a>.`}</div>` : ""}`;
}

function bindFeed() {
  $$("[data-feed]").forEach((b) => b.addEventListener("click", () => { state.feedFilter = b.dataset.feed; render(); }));
  $$("[data-scope]").forEach((b) => b.addEventListener("click", () => { state.feedScope = b.dataset.scope; render(); }));
}

/* ============================================================
   Team editor (create game / claim other side / edit team)
   ============================================================ */

let editor = null;

function newTeam(sport) {
  return normalizeTeam({ captainId: meId(), name: `${firstName(meId())}'s Squad`, playerIds: [meId()], formation: "", gk: false, slots: {}, positions: {}, score: null }, sport);
}

function startEditor(kind, gameId) {
  if (kind === "create") {
    editor = {
      kind, side: "A", selected: null,
      game: { sport: "soccer", date: localDate(), time: "19:00", location: "", refMode: "none", refName: "", refUser: "", cap: "", isPublic: location.hash.includes("public"), lat: null, lng: null },
      team: newTeam("soccer"),
    };
    return;
  }
  const g = state.games.find((x) => x.id === gameId);
  if (!g) { editor = null; return; }
  if (kind === "join") editor = { kind, gameId, side: "B", selected: null, game: g, team: newTeam(g.sport) };
  else {
    const side = captainOf(g, meId());
    editor = side ? { kind, gameId, side, selected: null, game: g, team: normalizeTeam(structuredClone(teamObj(g, side)), g.sport) } : null;
  }
}

function viewEditor() {
  if (!editor) return `<div class="empty">Only a captain can edit this team. <a href="#/">Back to the feed</a></div>`;
  const { kind, team, game } = editor;
  const sport = game.sport;
  const cfg = SPORTS[sport];
  const g = kind === "create" ? null : state.games.find((x) => x.id === editor.gameId);
  const other = g ? teamObj(g, editor.side === "A" ? "B" : "A") : null;
  const refUserId = kind === "create" ? (game.refMode === "user" ? game.refUser : null) : game.ref?.userId;
  const taken = new Set([...(other?.playerIds || []), ...(refUserId ? [refUserId] : [])]);
  const friends = friendIds();
  const going = new Set(g ? rsvpsFor(g).filter((r) => r.status === "in").map((r) => r.userId) : []);
  const rank = (u) => (u.id === team.captainId ? 0 : going.has(u.id) ? 1 : friends.has(u.id) ? 2 : 3);
  const pool = state.users.filter((u) => !taken.has(u.id)).sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
  const title = kind === "create" ? "Start a game" : kind === "join" ? "Captain the other side" : "Edit your team";

  const gameFields = kind === "create" ? `
    <section class="panel pad">
      <h3>The run</h3>
      <div class="sport-pick">${Object.entries(SPORTS).map(([k, v]) => `<button type="button" class="sp ${sport === k ? "on" : ""}" data-sport="${k}">${icon(v.icon)}<span>${v.label}</span></button>`).join("")}</div>
      <div class="row3">
        <label>Date<input type="date" id="f-date" value="${esc(game.date)}" required></label>
        <label>Kick-off<input type="time" id="f-time" value="${esc(game.time)}"></label>
        <label>Where<input id="f-loc" placeholder="Park, cage, gym" value="${esc(game.location)}"></label>
      </div>
      ${capPublicFields("f", game)}
      <h4>Referee</h4>
      <div class="seg2 full">
        <button type="button" class="${game.refMode === "none" ? "on" : ""}" data-refmode="none">No ref</button>
        <button type="button" class="${game.refMode === "user" ? "on" : ""}" data-refmode="user">Someone on the app</button>
        <button type="button" class="${game.refMode === "name" ? "on" : ""}" data-refmode="name">Just a name</button>
      </div>
      ${game.refMode === "user" ? `<select id="f-refuser"><option value="">Pick the ref</option>${state.users.filter((u) => !team.playerIds.includes(u.id)).map((u) => `<option value="${u.id}" ${game.refUser === u.id ? "selected" : ""}>${esc(u.displayName)} (@${esc(u.username)})</option>`).join("")}</select>` : ""}
      ${game.refMode === "name" ? `<input id="f-refname" placeholder="Ref's name" value="${esc(game.refName)}">` : ""}
    </section>` : `
    <section class="panel pad game-mini" style="--img:url('${cfg.img}')">
      ${meta(`${icon(cfg.icon)} ${cfg.label}`, esc(relDate(game.date)), fmtTime(game.time), esc(game.location))}
      ${other ? `<p>Against <b>${esc(other.name)}</b>, ${other.playerIds.length} players, captained by ${esc(uname(other.captainId))}.</p>` : ""}
      ${going.size ? `<p class="muted small">${going.size} people said they're in. They're listed first.</p>` : ""}
    </section>`;

  const formationBlock = sport === "soccer" ? `
    <section class="panel pad">
      <div class="block-head tight"><h3>Formation</h3><span class="muted small">Tap two players to swap them</span></div>
      <div class="formation-ctrl">
        <div class="chips">${formationOptions(team.playerIds.length - (team.gk ? 1 : 0)).map((f) => `<button type="button" class="chip ${team.formation === f ? "on" : ""}" data-form="${f}">${f}</button>`).join("")}</div>
        <div class="inline">
          <input id="f-custom" placeholder="Custom, like 3-2-1" aria-label="Custom formation">
          ${team.playerIds.length >= 2 ? `<label class="toggle"><input type="checkbox" id="f-gk" ${team.gk ? "checked" : ""}> Keeper</label>` : ""}
        </div>
      </div>
      ${pitch(team, { editable: true, selected: editor.selected })}
    </section>` : cfg.positions?.length ? `
    <section class="panel pad">
      <h3>Positions</h3>
      ${team.playerIds.map((pid) => `<div class="pick-row">${avatar(pid, "sm")}<span class="grow">${esc(uname(pid))}</span>
        <select data-pos="${pid}" aria-label="Position for ${esc(uname(pid))}"><option value="">–</option>${cfg.positions.map((p) => `<option ${team.positions[pid] === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>`).join("")}
    </section>` : "";

  return `
  <a class="back" href="${editor.gameId ? `#/g/${editor.gameId}` : "#/"}">Back</a>
  <h1 class="page-title">${title}</h1>
  <p class="lead">${kind === "join" ? "You're captain of this side. Pick your players and set the shape." : kind === "create" ? "You captain your side. Someone else claims the other side to lock the game in. Teams don't need to be even." : "You can change your lineup until the final score goes in."}</p>
  <form id="editor-form" class="stack" data-norefresh>
    ${gameFields}
    <section class="panel pad">
      <h3>Your team</h3>
      <label>Team name<input id="f-tname" value="${esc(team.name)}" required maxlength="30"></label>
      <div class="block-head tight"><h4>Players <span class="count">${team.playerIds.length}</span></h4><input id="f-search" class="search" placeholder="Search players" aria-label="Search players"></div>
      <div class="roster-pick" id="pool">
        ${pool.map((u) => {
          const on = team.playerIds.includes(u.id);
          const isCap = u.id === team.captainId;
          const tag = isCap ? "captain" : going.has(u.id) ? "in" : friends.has(u.id) ? "friend" : "";
          return `<button type="button" class="pick ${on ? "on" : ""}" data-pick="${u.id}" data-name="${esc((u.displayName + " " + u.username).toLowerCase())}" ${isCap ? "disabled" : ""}>
            ${avatar(u.id, "sm")}<span class="pick-name">${esc(u.displayName)}${tag ? ` <em class="ftag ${tag}">${tag}</em>` : ""}</span><i>${on ? icon("check") : icon("plus")}</i></button>`;
        }).join("")}
      </div>
    </section>
    ${formationBlock}
    <button class="btn primary block big" type="submit">${kind === "create" ? "Create game" : kind === "join" ? "Lock in the game" : "Save team"}</button>
  </form>`;
}

// Player cap + public toggle + map pin, shared by "Start a game" and "Change date, time or place".
function capPublicFields(prefix, game) {
  return `
    <div class="cap-row">
      <label>Max players<input type="number" id="${prefix}-cap" min="2" max="100" inputmode="numeric" placeholder="No limit" value="${esc(game.cap || "")}"></label>
      <p class="muted small">Once it's full, new people join a waitlist and move up if someone drops.</p>
    </div>
    <label class="toggle pub-toggle"><input type="checkbox" id="${prefix}-public" ${game.isPublic ? "checked" : ""}> ${icon("globe")} <span><b>Open to the public</b><small>Anyone nearby can find it on the map and RSVP.</small></span></label>
    <div class="place-pick" id="${prefix}-pp" ${game.isPublic ? "" : "hidden"}>
      <div class="pp-bar"><input data-pp-q placeholder="Search a park, court or address" aria-label="Search for the spot"><button type="button" class="btn" data-pp-me>${icon("pin")} Use my location</button></div>
      <div class="pp-results" data-pp-results></div>
      <div class="pp-map" data-pp-map></div>
      <p class="muted small" data-pp-note>${game.lat != null ? "Pin set. Drag it to fine-tune." : "Tap the map to drop a pin where you'll play."}</p>
    </div>`;
}

// Shows the pin picker when "Open to the public" is on. target gets lat/lng (and a location name if empty).
let pickerCleanup = null;
function bindCapPublic(prefix, target, locInput) {
  const box = $(`#${prefix}-pp`), chk = $(`#${prefix}-public`);
  if (!box || !chk) return;
  const mount = () => {
    if (box.dataset.mounted) return;
    box.dataset.mounted = "1";
    pickerCleanup?.();
    mountPicker(box, target.lat != null ? { lat: target.lat, lng: target.lng } : null, ({ lat, lng, name }) => {
      target.lat = lat; target.lng = lng;
      if (name && locInput && !locInput.value.trim()) { locInput.value = name; target.location = name; }
    }).then((c) => (pickerCleanup = c)).catch((err) => { box.querySelector("[data-pp-note]").textContent = err.message; });
  };
  chk.addEventListener("change", () => { target.isPublic = chk.checked; box.hidden = !chk.checked; if (chk.checked) mount(); });
  if (chk.checked) mount();
}
const capValue = (el) => { const n = parseInt(el?.value, 10); return Number.isFinite(n) ? n : null; };
function checkCapPublic(game) {
  if (game.cap != null && (game.cap < 2 || game.cap > 100)) throw new Error("Max players has to be between 2 and 100.");
  if (game.isPublic && game.lat == null) throw new Error("Drop a pin on the map so people nearby can find the game.");
}

function captureEditor() {
  if (!editor) return;
  const v = (id) => $(id)?.value;
  if ($("#f-tname")) editor.team.name = v("#f-tname");
  if (editor.kind === "create") {
    if ($("#f-cap")) editor.game.cap = capValue($("#f-cap"));
    if ($("#f-public")) editor.game.isPublic = $("#f-public").checked;
    if ($("#f-date")) editor.game.date = v("#f-date");
    if ($("#f-time")) editor.game.time = v("#f-time");
    if ($("#f-loc")) editor.game.location = v("#f-loc");
    if ($("#f-refuser")) editor.game.refUser = v("#f-refuser");
    if ($("#f-refname")) editor.game.refName = v("#f-refname");
  }
}

function rerenderEditor() {
  captureEditor();
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

function bindEditor() {
  if (!editor) return;
  if (editor.kind === "create") bindCapPublic("f", editor.game, $("#f-loc"));
  const sport = editor.game.sport;
  $$("[data-sport]").forEach((b) => b.addEventListener("click", () => {
    captureEditor();
    editor.game.sport = b.dataset.sport;
    editor.team.formation = "";
    normalizeTeam(editor.team, editor.game.sport);
    rerenderEditor();
  }));
  $$("[data-refmode]").forEach((b) => b.addEventListener("click", () => { captureEditor(); editor.game.refMode = b.dataset.refmode; rerenderEditor(); }));
  $("#f-refuser")?.addEventListener("change", rerenderEditor);
  $$("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.pick;
    const t = editor.team;
    t.playerIds = t.playerIds.includes(id) ? t.playerIds.filter((x) => x !== id) : [...t.playerIds, id];
    if (sport === "soccer" && t.playerIds.length >= 3 && !t._gkTouched) t.gk = true;
    normalizeTeam(t, sport);
    editor.selected = null;
    rerenderEditor();
  }));
  $("#f-search")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$("#pool .pick").forEach((b) => (b.hidden = q && !b.dataset.name.includes(q)));
  });
  $$("[data-form]").forEach((b) => b.addEventListener("click", () => { editor.team.formation = b.dataset.form; normalizeTeam(editor.team, sport); rerenderEditor(); }));
  $("#f-custom")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const val = e.target.value.trim();
    const parts = val.split("-").map(Number);
    const need = editor.team.playerIds.length - (editor.team.gk ? 1 : 0);
    if (!/^\d+(-\d+)*$/.test(val) || parts.some((n) => n < 1) || parts.reduce((a, b) => a + b, 0) !== need) {
      return toast(`The formation has to add up to ${need} outfield player${need === 1 ? "" : "s"}.`);
    }
    editor.team.formation = val;
    normalizeTeam(editor.team, sport);
    rerenderEditor();
  });
  $("#f-gk")?.addEventListener("change", (e) => {
    editor.team.gk = e.target.checked;
    editor.team._gkTouched = true;
    editor.team.formation = "";
    normalizeTeam(editor.team, sport);
    rerenderEditor();
  });
  $$("[data-slot]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.slot;
    if (!editor.selected) editor.selected = k;
    else if (editor.selected === k) editor.selected = null;
    else {
      const s = editor.team.slots;
      [s[editor.selected], s[k]] = [s[k], s[editor.selected]];
      editor.selected = null;
    }
    rerenderEditor();
  }));
  $$("[data-pos]").forEach((sel) => sel.addEventListener("change", () => { editor.team.positions[sel.dataset.pos] = sel.value; }));

  $("#editor-form").addEventListener("submit", (e) => {
    e.preventDefault();
    captureEditor();
    const t = { ...editor.team };
    delete t._gkTouched;
    t.name = (t.name || "").trim() || "My Squad";
    act($("button[type=submit]", e.target), async () => {
      let gid = editor.gameId;
      if (editor.kind === "create") {
        const g = editor.game;
        let ref = null;
        if (g.refMode === "user") {
          if (!g.refUser) throw new Error("Pick the ref, or choose No ref.");
          ref = { userId: g.refUser, name: uname(g.refUser) };
        } else if (g.refMode === "name") {
          if (!g.refName.trim()) throw new Error("Type the ref's name, or choose No ref.");
          ref = { userId: null, name: g.refName.trim() };
        }
        checkCapPublic(g);
        const created = await store.createGame({
          sport: g.sport, date: g.date, time: g.time, location: g.location.trim(),
          createdBy: meId(), status: "open", teamA: t, teamB: null, ref, stats: {},
          cap: g.cap || null, isPublic: !!g.isPublic, lat: g.isPublic ? g.lat : null, lng: g.isPublic ? g.lng : null,
        });
        await store.setRsvp(created.id, meId(), "in");
        gid = created.id;
        toast("Game created. Send the link to the other captain.");
      } else if (editor.kind === "join") {
        const fresh = (await store.listGames()).find((x) => x.id === gid);
        if (fresh?.teamB) throw new Error("Someone already claimed the other side.");
        if (t.playerIds.some((p) => fresh.teamA.playerIds.includes(p))) throw new Error("A player can't be on both teams.");
        await store.updateGame(gid, { teamB: t, status: "ready", claimedAt: new Date().toISOString() });
        toast("Game on. Both sides are locked in.");
      } else {
        await store.updateGame(gid, editor.side === "A" ? { teamA: t } : { teamB: t });
        toast("Team saved");
      }
      editor = null;
      await reload();
      location.hash = `#/g/${gid}`;
    });
  });
}

/* ============================================================
   Game page
   ============================================================ */

function viewGame(id) {
  const g = state.games.find((x) => x.id === id);
  if (!g) return `<div class="empty">That game doesn't exist anymore. <a href="#/">Back to the feed</a></div>`;
  const cfg = sportOf(g);
  const idx = ratingIndex();
  const revealed = isRevealed(g);
  const voting = votingOpen(g);
  const top = motm(idx, g);
  const w = winner(g);
  const myCap = captainOf(g, meId());
  const mySide = teamOf(g, meId());

  const sideBlock = (side) => {
    const t = teamObj(g, side);
    if (!t) {
      const canClaim = !mySide && g.ref?.userId !== meId();
      return `<section class="panel pad open-side">
        <div class="ghost-team">?</div>
        <h3>Open spot</h3>
        <p class="muted">A game needs two captains. Whoever claims this side picks their players and sets their formation.</p>
        ${canClaim ? `<a class="btn primary" href="#/g/${g.id}/join">Captain this side</a>` : ""}
        ${myCap === "A" ? `<button class="btn" id="copy-link">Copy invite link</button>` : ""}
      </section>`;
    }
    return `<section class="panel pad team-card">
      <div class="team-head"><h3>${esc(t.name)}</h3>${meta(`${t.playerIds.length} players`, `Captain ${esc(firstName(t.captainId))}`)}
      ${myCap === side && g.status !== "final" ? `<a class="btn quiet small" href="#/g/${g.id}/edit">Edit team</a>` : ""}</div>
      ${g.sport === "soccer" && t.formation != null ? pitch(t, { idx, g }) : ""}
      <div class="lineup">${lineupList(g, t, idx)}</div>
    </section>`;
  };

  let refBlock = "";
  if (g.ref) {
    const rr = ratingFor(idx, g, "ref");
    const rv = votesFor(idx, g.id, "ref");
    const right = g.status !== "final" ? "" : revealed
      ? `<div class="rcol">${badge(rr)}<small>${rv} votes</small></div>`
      : `<div class="rcol"><span class="badge r-none hidden-r">?</span><small>Hidden</small></div>`;
    const inner = `${g.ref.userId ? avatar(g.ref.userId) : `<span class="avatar whistle">${icon("whistle")}</span>`}
      <div class="grow"><small class="muted">Referee</small><b>${esc(g.ref.userId ? uname(g.ref.userId) : g.ref.name)}</b></div>${right}`;
    refBlock = g.ref.userId ? `<a class="panel pad ref-card" href="#/p/${g.ref.userId}">${inner}</a>` : `<div class="panel pad ref-card">${inner}</div>`;
  }

  // RSVP: who's coming, before the game
  let rsvpBlock = "";
  if (g.status !== "final") {
    const lu = lineup(g);
    const my = rsvpOf(g, meId());
    const pos = lu.waitlist.indexOf(meId());
    const confirmedMe = lu.confirmed.includes(meId());
    const full = lu.cap && lu.confirmed.length >= lu.cap;
    const faces = (ids, n) => ids.map((id, i) => `<a href="#/p/${id}" title="${esc(uname(id))}">${avatar(id)}<small>${n ? `${i + 1}. ` : ""}${esc(firstName(id))}</small></a>`).join("");
    rsvpBlock = `
    <section class="panel pad rsvp">
      <div class="block-head tight"><h3>Who's in</h3><span class="muted small">${lu.cap ? `${lu.confirmed.length} of ${lu.cap} spots${full ? ", full" : ""}` : `${lu.confirmed.length} in`}${lu.maybe.length ? `, ${lu.maybe.length} maybe` : ""}${lu.out.length ? `, ${lu.out.length} out` : ""}</span></div>
      ${lu.cap ? `<div class="spots"><i style="width:${Math.min(100, (lu.confirmed.length / lu.cap) * 100)}%"></i></div>` : ""}
      <div class="rsvp-faces">${faces(lu.confirmed) || `<span class="muted small">Nobody yet. Be the first.</span>`}</div>
      ${lu.waitlist.length ? `<h4>Waitlist</h4><div class="rsvp-faces wait">${faces(lu.waitlist, true)}</div>` : ""}
      ${lu.maybe.length ? `<p class="muted small"><b>Maybe:</b> ${lu.maybe.map((id) => esc(firstName(id))).join(", ")}</p>` : ""}
      ${mySide ? `<p class="muted small">You're on ${esc(teamObj(g, mySide).name)}.</p>` : `
      <div class="rsvp-btns">
        <button class="btn ${my === "in" ? "primary" : ""}" data-rsvp="in">${icon("check")} ${my === "in" ? (pos >= 0 ? `Waitlist #${pos + 1}` : "You're in") : full ? "Join waitlist" : "I'm in"}</button>
        <button class="btn ${my === "maybe" ? "on-maybe" : "quiet"}" data-rsvp="maybe">${my === "maybe" ? "You're a maybe" : "Maybe"}</button>
        <button class="btn ${my === "out" ? "on-out" : "quiet"}" data-rsvp="out">${my === "out" ? "You're out" : "Can't make it"}</button>
      </div>
      ${pos >= 0 ? `<p class="muted small">The game is full. You're #${pos + 1} in line and move up automatically if someone drops out.</p>` : my === "in" ? `<p class="muted small">The captains see you at the top of their player list.</p>` : ""}`}
      <div class="rsvp-tools">
        ${confirmedMe ? `<button type="button" class="btn quiet small" id="add-cal">${icon("calendar")} Add to calendar</button>` : ""}
        <button type="button" class="btn quiet small" id="share-game">${icon("share")} Share invite</button>
      </div>
    </section>`;
  }

  let actionBlock = "";
  if (g.status === "ready" && myCap) {
    actionBlock = `<section class="panel pad cta"><div><h3>Game over?</h3><p class="muted">Either captain posts the final score and box score. That opens voting for 24 hours.</p></div><a class="btn primary" href="#/g/${g.id}/result">Enter final score</a></section>`;
  }

  // Voting status + rating form
  let rateBlock = "";
  if (g.status === "final") {
    const targets = rateTargets(g, meId());
    const cast = votesCast(g), need = expectedVotes(g);
    const statusLine = voting
      ? `<div class="vote-status">${icon("clock")}<div><b>Ratings are hidden until votes close in ${untilText(revealAt(g) - now())}</b><span class="muted small">${cast} of ${need} votes in. They reveal early if everyone votes.</span></div></div>
         <div class="progress"><span style="width:${Math.min(100, (cast / Math.max(1, need)) * 100).toFixed(0)}%"></span></div>`
      : "";
    if (!mySide) {
      rateBlock = voting ? `<section class="panel pad">${statusLine}<p class="muted small">Only players in this game vote. Everyone rates their own teammates and the ref, and can rate the other team too (shown separately).</p></section>` : "";
    } else if (!voting) {
      const mine = targets.filter((t) => myVote(g, t.target)).length;
      rateBlock = `<section class="panel pad closed"><h3>Voting closed</h3><p class="muted small">${mine ? `You rated ${mine} of ${targets.length}.` : "You didn't vote in this one."} A game rating counts once at least ${MIN_VOTES} people have voted.</p></section>`;
    } else if (!targets.length) {
      rateBlock = `<section class="panel pad">${statusLine}<p class="muted small">No teammates to rate in this one.</p></section>`;
    } else {
      rateBlock = `
      <section class="panel pad" id="rate">
        ${statusLine}
        <h3>Rate your team${g.ref && g.ref.userId !== meId() ? " and the ref" : ""}</h3>
        <p class="muted small">Your teammates' ratings set their main score. Drag, or tap the minus and plus to move by 0.1. Anywhere from 0.1 to 10. Around 6.0 is an average run, 7 is solid, 8 is cooking, 9 means somebody got cooked.</p>
        <form id="rate-form" class="rate-list">
          ${[...targets, ...oppTargets(g, meId())].map(({ target, opp }, i, all) => {
            const mine = myVote(g, target);
            const v = mine ? mine.score : 6.5;
            const isRef = target === "ref";
            const name = isRef ? (g.ref.userId ? uname(g.ref.userId) : g.ref.name) : uname(target);
            const sub = isRef ? "Referee" : statLine(g.sport, g.stats?.[target]) || slotLabel(teamObj(g, opp ? (mySide === "A" ? "B" : "A") : mySide), target) || "";
            const head = opp && !all[i - 1]?.opp ? `<div class="opp-head"><h4>Rate the other team</h4><small class="muted">Optional. Shown as a separate opponent rating. It doesn't change their main rating or MOTM.</small></div>` : "";
            return `${head}
            <div class="rate-row ${isRef ? "is-ref" : ""} ${opp ? "is-opp" : ""}">
              ${isRef ? (g.ref.userId ? avatar(g.ref.userId) : `<span class="avatar whistle">${icon("whistle")}</span>`) : avatar(target)}
              <div class="grow"><b>${esc(name)}</b>${sub ? `<small class="muted">${esc(sub)}</small>` : ""}
                <div class="slider-row">
                  <button type="button" class="nudge-btn" data-nudge="-0.1" data-t="${target}" aria-label="Lower ${esc(name)} by 0.1">−</button>
                  <input type="range" min="0.1" max="10" step="0.1" value="${v}" data-target="${target}" aria-label="Rating for ${esc(name)}">
                  <button type="button" class="nudge-btn" data-nudge="0.1" data-t="${target}" aria-label="Raise ${esc(name)} by 0.1">+</button>
                </div>
              </div>
              <span class="badge ${ratingClass(v)} live" data-for="${target}">${fmt(v)}</span>
            </div>`;
          }).join("")}
          <button class="btn primary block" type="submit">${targets.every((t) => myVote(g, t.target)) ? "Update my votes" : "Submit my votes"}</button>
        </form>
      </section>`;
    }
  }

  // Your stats: each player fills in only their own line, until voting closes
  let statsBlock = "";
  if (g.status === "final" && mySide) {
    const mineStats = g.stats?.[meId()] || {};
    statsBlock = voting ? `
    <section class="panel pad" id="my-stats">
      <div class="block-head tight"><h3>Your stats</h3><span class="muted small">Only you can edit these. They lock when voting closes.</span></div>
      <form id="stats-form" class="stat-inputs">
        ${cfg.stats.map(([k, l]) => `<label>${STAT_NAME[k] || l}<input type="number" min="0" max="${STAT_MAX[k] ?? 199}" inputmode="numeric" data-mystat="${k}" value="${esc(mineStats[k] ?? "")}" placeholder="0" aria-label="Your ${(STAT_NAME[k] || l).toLowerCase()}"></label>`).join("")}
        <button class="btn primary">Save my stats</button>
      </form>
    </section>` : "";
  }

  // Banter, threaded: replies sit under the comment they answer
  const comments = commentsFor(g);
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c) => { let r = c; const seen = new Set(); while (r.parentId && byId.has(r.parentId) && !seen.has(r.id)) { seen.add(r.id); r = byId.get(r.parentId); } return r; };
  const roots = comments.filter((c) => !c.parentId || !byId.has(c.parentId));
  const repliesOf = (root) => comments.filter((c) => c.id !== root.id && rootOf(c).id === root.id);
  const commentHtml = (c, isReply) => {
    const parent = c.parentId ? byId.get(c.parentId) : null;
    return `
      <div class="comment ${isReply ? "reply" : ""}" id="c-${c.id}">
        <a href="#/p/${c.userId}">${avatar(c.userId, isReply ? "xs" : "sm")}</a>
        <div class="grow"><div class="c-head"><b>${esc(uname(c.userId))}</b>${parent && isReply ? `<span class="c-to">to ${esc(firstName(parent.userId))}</span>` : ""}<small class="muted">${timeAgo(c.createdAt)}</small>
          ${c.userId === meId() ? `<button class="c-del" data-delcomment="${c.id}" aria-label="Delete comment">${icon("x")}</button>` : `<button class="c-report" data-report="${c.id}" aria-label="Report comment">${icon("flag")}</button>`}</div>
        <p>${esc(c.body)}</p>
        <button class="c-reply" data-reply="${c.id}">Reply</button>
        ${state.replyTo === c.id ? `
        <form class="reply-form" data-replyform="${c.id}">
          <textarea rows="1" maxlength="500" placeholder="Reply to ${esc(firstName(c.userId))}" aria-label="Reply to ${esc(uname(c.userId))}"></textarea>
          <button class="btn primary small">Reply</button>
          <button type="button" class="btn quiet small" data-cancelreply>Cancel</button>
        </form>` : ""}
        </div>
      </div>`;
  };
  const banter = `
  <section class="panel pad" id="banter">
    <div class="block-head tight"><h3>Banter</h3><span class="muted small">${comments.length || "No"} comment${comments.length === 1 ? "" : "s"}</span></div>
    <div class="comments">${roots.map((r) => `
      <div class="thread">${commentHtml(r, false)}${repliesOf(r).map((c) => commentHtml(c, true)).join("")}</div>`).join("")}</div>
    <form id="comment-form" class="comment-form">
      ${avatar(meId(), "sm")}
      <textarea id="comment-body" rows="1" maxlength="500" placeholder="${g.status === "final" ? "Talk your talk" : "Say something to the squad"}" aria-label="Write a comment"></textarea>
      <button class="btn primary">Post</button>
    </form>
  </section>`;

  return `
  <a class="back" href="#/">Feed</a>
  <section class="scoreboard" style="--img:url('${cfg.img}')">
    <div class="sb-meta">${meta(`${icon(cfg.icon)} ${cfg.label}`, formatLabel(g), esc(relDate(g.date)), fmtTime(g.time), esc(g.location))}</div>
    ${myCap ? `<button type="button" class="btn quiet small sb-edit" id="edit-when">${icon("clock")} Change date, time or place</button>` : ""}
    <div class="big-score">
      <div class="side ${w === "A" ? "win" : ""}">${avatar(g.teamA.captainId, "lg")}<span>${esc(g.teamA.name)}</span></div>
      <div class="bug ${g.status === "final" ? "" : "pre"}">
        <div class="bug-inner">${g.status === "final" ? `<b class="${w === "B" ? "dim" : ""}">${g.teamA.score}</b><i></i><b class="${w === "A" ? "dim" : ""}">${g.teamB.score}</b>` : `<span>VS</span>`}</div>
      </div>
      <div class="side ${w === "B" ? "win" : ""}">${g.teamB ? `${avatar(g.teamB.captainId, "lg")}<span>${esc(g.teamB.name)}</span>` : `<span class="avatar lg ghost"></span><span class="muted">Open</span>`}</div>
    </div>
    ${g.status === "final" && seriesGames(g) ? `<div class="series-line"><span class="sk">Series</span>${seriesLine(g)}</div>` : ""}
    <div class="sb-status">${g.status === "final" ? (w === "D" ? (seriesGames(g) ? "Series tied" : "Draw") : seriesGames(g) ? "Series final" : "Full time") : g.status === "open" ? "Waiting for a second captain" : "Upcoming"}</div>
    ${g.status === "final" ? `<button class="btn share-btn" id="share-card">${icon("share")} Share match card</button>` : ""}
  </section>
  ${myCap ? `
  <form class="panel pad stack" id="when-form" data-norefresh hidden>
    <h3>When and where</h3>
    <div class="row3">
      <label>Date<input type="date" name="date" value="${esc(g.date)}" required></label>
      <label>Kick-off<input type="time" name="time" value="${esc(g.time || "")}"></label>
      <label>Where<input name="location" placeholder="Park, cage, gym" value="${esc(g.location || "")}"></label>
    </div>
    ${g.createdBy === meId() ? capPublicFields("w", g) : ""}
    <p class="muted small">Everyone in the game sees the changes right away.</p>
    <div class="inline"><button class="btn primary">Save</button><button type="button" class="btn quiet" id="when-cancel">Cancel</button></div>
  </form>` : ""}

  ${top ? `
  <section class="motm-banner" style="--img:url('${IMG.motm}')">
    ${avatar(top.playerId, "xl")}
    <div class="grow"><span class="motm-k">${icon("star")} Man of the match</span><h2>${esc(uname(top.playerId))}</h2>
    ${meta(esc(teamObj(g, teamOf(g, top.playerId)).name), esc(statLine(g.sport, g.stats?.[top.playerId])), `${top.votes} votes`)}</div>
    ${badge(top.rating, "xxl")}
  </section>` : ""}

  ${actionBlock}
  ${statsBlock}
  ${rateBlock}
  ${rsvpBlock}
  <div class="two-col">${sideBlock("A")}${sideBlock("B")}</div>
  ${refBlock}
  ${banter}
  <div class="page-actions">
    ${g.status === "final" && myCap ? `<a class="btn quiet small" href="#/g/${g.id}/result">Fix score or stats</a>` : ""}
    ${g.createdBy === meId() ? `<button class="btn quiet danger small" id="del-game">Delete game</button>` : ""}
  </div>`;
}

function bindGame(id) {
  const g = state.games.find((x) => x.id === id);
  if (!g) return;
  $("#copy-link")?.addEventListener("click", async () => {
    const url = location.href.replace(/#.*/, "") + `#/g/${id}`;
    try { await navigator.clipboard.writeText(url); toast("Invite link copied"); } catch (_) { toast(url); }
  });
  $("#share-card")?.addEventListener("click", (e) => act(e.currentTarget, () => openShareCard(g)));
  $$("[data-rsvp]").forEach((b) => b.addEventListener("click", () => doRsvp(id, b.dataset.rsvp, b)));
  $("#add-cal")?.addEventListener("click", (e) => act(e.currentTarget, async () => {
    const how = await addToCalendar(g, `${SPORTS[g.sport]?.label || "Pickup"}: ${g.teamA.name}${g.teamB ? ` vs ${g.teamB.name}` : ""}`);
    if (how === "ics") toast("Calendar file downloaded. Open it to add the game.");
  }));
  $("#share-game")?.addEventListener("click", (e) => act(e.currentTarget, async () => {
    const lu = lineup(g);
    const when = `${relDate(g.date)}${g.time ? ` at ${fmtTime(g.time)}` : ""}`;
    const res = await shareLink(gameUrl(g.id), "Who Cooked", `${SPORTS[g.sport]?.label || "Pickup"} ${when}${g.location ? ` at ${g.location}` : ""}. ${lu.cap ? `${lu.confirmed.length}/${lu.cap} spots taken.` : `${lu.confirmed.length} in so far.`} You in?`);
    if (res === "copied") toast("Invite link copied");
  }));

  const form = $("#rate-form");
  if (form) {
    $$('input[type="range"]', form).forEach((inp) => inp.addEventListener("input", () => {
      const b = $(`[data-for="${inp.dataset.target}"]`, form);
      const v = Number(inp.value);
      b.textContent = fmt(v);
      b.className = `badge ${ratingClass(v)} live`;
    }));
    $$("[data-nudge]", form).forEach((btn) => btn.addEventListener("click", () => {
      const inp = $(`input[data-target="${btn.dataset.t}"]`, form);
      inp.value = Math.min(10, Math.max(0.1, Math.round((Number(inp.value) + Number(btn.dataset.nudge)) * 10) / 10));
      inp.dispatchEvent(new Event("input"));
    }));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const allowed = new Set([...rateTargets(g, meId()), ...oppTargets(g, meId())].map((t) => t.target));
      act($("button[type=submit]", form), async () => {
        if (!votingOpen(g)) throw new Error("Voting has closed for this game.");
        const list = $$('input[type="range"]', form)
          .filter((i) => allowed.has(i.dataset.target))
          .map((i) => ({ gameId: id, raterId: meId(), target: i.dataset.target, score: Math.round(Number(i.value) * 10) / 10 }));
        await store.upsertRatings(list);
        await reload();
        rerenderKeepScroll();
        toast(isRevealed(g) ? "Everyone's voted. Ratings are out." : "Votes saved. They stay hidden until voting closes.");
      });
    });
  }

  $("#stats-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const stats = {};
    $$("[data-mystat]", e.target).forEach((i) => { const k = i.dataset.mystat; const v = Math.min(STAT_MAX[k] ?? 199, Math.round(Number(i.value))); if (v > 0) stats[k] = v; });
    act($("button", e.target), async () => {
      if (!votingOpen(g)) throw new Error("Stats are locked because voting has closed.");
      if (!teamOf(g, meId())) throw new Error("You can only add stats for games you played in.");
      await store.setStats(id, meId(), stats);
      await reload();
      rerenderKeepScroll();
      toast("Your stats are saved");
    });
  });
  $$("[data-reply]").forEach((b) => b.addEventListener("click", () => {
    state.replyTo = state.replyTo === b.dataset.reply ? null : b.dataset.reply;
    rerenderKeepScroll();
    $(`[data-replyform="${state.replyTo}"] textarea`)?.focus();
  }));
  $$("[data-cancelreply]").forEach((b) => b.addEventListener("click", () => { state.replyTo = null; rerenderKeepScroll(); }));
  $$("[data-replyform]").forEach((f) => {
    const t = $("textarea", f);
    t.addEventListener("input", () => { t.style.height = "auto"; t.style.height = Math.min(140, t.scrollHeight) + "px"; });
    t.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      act($("button", f), async () => {
        await store.addComment(id, meId(), t.value, f.dataset.replyform);
        state.replyTo = null;
        await reload();
        rerenderKeepScroll();
        toast("Reply posted");
      });
    });
  });

  const cf = $("#comment-form");
  const ta = $("#comment-body");
  ta?.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; });
  ta?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); cf.requestSubmit(); } });
  cf?.addEventListener("submit", (e) => {
    e.preventDefault();
    act($("button", cf), async () => {
      await store.addComment(id, meId(), ta.value);
      await reload();
      rerenderKeepScroll();
      $("#comment-body")?.focus();
    });
  });
  $$("[data-report]").forEach((b) => b.addEventListener("click", () => {
    if (!b.dataset.armed) {
      b.dataset.armed = "1";
      b.classList.add("armed");
      b.innerHTML = "Report?";
      setTimeout(() => { if (b.isConnected && b.dataset.armed) { delete b.dataset.armed; b.classList.remove("armed"); b.innerHTML = icon("flag"); } }, 4000);
      return;
    }
    act(b, async () => {
      await store.report(meId(), "comment", b.dataset.report, "Reported from a game's banter");
      hideComment(b.dataset.report);
      rerenderKeepScroll();
      toast("Reported. We'll review it within 24 hours, and it's hidden for you.");
    });
  }));
  $$("[data-delcomment]").forEach((b) => b.addEventListener("click", () => act(b, async () => {
    await store.deleteComment(b.dataset.delcomment);
    await reload();
    rerenderKeepScroll();
  })));

  const whenForm = $("#when-form");
  if (whenForm) {
    const draft = { isPublic: g.isPublic, lat: g.lat, lng: g.lng };
    let bound = false;
    const toggle = (show) => {
      whenForm.hidden = !show; $("#edit-when").hidden = show;
      if (show && !bound) { bound = true; bindCapPublic("w", draft, whenForm.location); }
      if (show) whenForm.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    $("#edit-when")?.addEventListener("click", () => toggle(true));
    $("#when-cancel").addEventListener("click", () => toggle(false));
    whenForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.date.value) return toast("Pick a date");
      act($("button.primary", f), async () => {
        const patch = { date: f.date.value, time: f.time.value, location: f.location.value.trim() };
        if ($("#w-cap")) {
          Object.assign(patch, { cap: capValue($("#w-cap")), isPublic: $("#w-public").checked });
          Object.assign(patch, { lat: patch.isPublic ? draft.lat : null, lng: patch.isPublic ? draft.lng : null });
          checkCapPublic(patch);
        }
        await store.updateGame(id, patch);
        await reload();
        rerenderKeepScroll();
        toast("Game updated");
      });
    });
  }

  const del = $("#del-game");
  del?.addEventListener("click", () => {
    if (!del.dataset.armed) {
      del.dataset.armed = "1";
      del.textContent = "Tap again to delete this game and its ratings";
      setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Delete game"; } }, 4000);
      return;
    }
    act(del, async () => { await store.deleteGame(id); await reload(); location.hash = "#/"; toast("Game deleted"); });
  });
  if (location.hash.endsWith("#banter")) $("#banter")?.scrollIntoView({ block: "start" });
}

function rerenderKeepScroll() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

/* ============================================================
   Share card (image for stories / group chats)
   ============================================================ */

const DISPLAY = '"Big Shoulders Display", "Big Shoulders", "Oswald", "Arial Narrow", Impact, sans-serif';
const BODY = '"Instrument Sans", system-ui, -apple-system, sans-serif';

function loadImage(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => res(null), 3000);
    img.onload = () => { clearTimeout(t); res(img); };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = src;
  });
}

async function drawShareCard(g, { photos }) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const idx = ratingIndex();
  const top = motm(idx, g);
  const w = winner(g);
  const cfg = sportOf(g);

  x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
  const grd = x.createRadialGradient(W * 0.75, -120, 40, W * 0.75, -120, 1100);
  grd.addColorStop(0, "rgba(43,107,255,.55)"); grd.addColorStop(1, "rgba(43,107,255,0)");
  x.fillStyle = grd; x.fillRect(0, 0, W, H);
  // kit stripe
  x.save(); x.translate(W - 260, 0); x.transform(1, 0, -0.22, 1, 0, 0);
  x.fillStyle = "rgba(43,107,255,.12)"; x.fillRect(0, 0, 70, H); x.fillRect(100, 0, 22, H); x.restore();

  x.fillStyle = "#fff"; x.font = `900 52px ${DISPLAY}`; x.textBaseline = "alphabetic";
  x.fillText("WHO COOKED", 72, 118);
  x.textAlign = "right"; x.fillStyle = "#8a96ad"; x.font = `600 30px ${BODY}`;
  x.fillText(`${cfg.label}  ${formatLabel(g)}  ${relDate(g.date)}`, W - 72, 114);
  x.textAlign = "left";

  // Ticker rows
  const row = (y, side) => {
    const t = teamObj(g, side);
    const won = w === side;
    x.fillStyle = won ? "#fff" : "#8a96ad"; x.font = `800 84px ${DISPLAY}`;
    let name = t.name.toUpperCase();
    while (x.measureText(name).width > 640 && name.length > 3) name = name.slice(0, -2) + "…";
    x.fillText(name, 72, y + 88);
    x.save(); x.translate(820, y); x.transform(1, 0, -0.18, 1, 0, 0);
    x.fillStyle = won ? "#2b6bff" : "#141b2d"; x.fillRect(0, 0, 200, 120); x.restore();
    x.fillStyle = "#fff"; x.font = `900 104px ${DISPLAY}`; x.textAlign = "center";
    x.fillText(String(t.score), 908, y + 100); x.textAlign = "left";
  };
  row(220, "A");
  row(360, "B");
  x.fillStyle = "#5b6780"; x.font = `600 30px ${BODY}`;
  x.fillText(w === "D" ? "Draw" : "Full time", 72, 548);

  if (top) {
    x.fillStyle = "#5a8cff"; x.font = `700 34px ${BODY}`; x.fillText("Man of the match", 72, 680);
    const u = user(top.playerId);
    const cx = 172, cy = 820, r = 100;
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.closePath();
    x.fillStyle = "#141b2d"; x.fill(); x.clip();
    const img = photos ? await loadImage(u?.avatar) : null;
    if (img) x.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    else {
      x.fillStyle = u?.color || "#2b6bff"; x.font = `900 92px ${DISPLAY}`; x.textAlign = "center";
      x.fillText(firstName(top.playerId).slice(0, 1).toUpperCase(), cx, cy + 32); x.textAlign = "left";
    }
    x.restore();
    x.strokeStyle = "#2b6bff"; x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, r + 4, 0, Math.PI * 2); x.stroke();
    x.fillStyle = "#fff"; x.font = `900 112px ${DISPLAY}`;
    let nm = uname(top.playerId).toUpperCase();
    while (x.measureText(nm).width > 520 && nm.length > 3) nm = nm.slice(0, -2) + "…";
    x.fillText(nm, 312, 850);
    const sl = statLine(g.sport, g.stats?.[top.playerId]);
    x.fillStyle = "#8a96ad"; x.font = `600 30px ${BODY}`; x.fillText(sl || teamObj(g, teamOf(g, top.playerId)).name, 316, 900);
    x.fillStyle = RATING_HEX[ratingClass(top.rating)]; x.fillRect(850, 760, 160, 110);
    x.fillStyle = "#fff"; x.font = `900 86px ${DISPLAY}`; x.textAlign = "center"; x.fillText(fmt(top.rating), 930, 846); x.textAlign = "left";

    const others = gamePlayers(g).filter((p) => p !== top.playerId).map((p) => ({ p, r: ratingFor(idx, g, p) })).filter((o) => o.r != null).sort((a, b) => b.r - a.r).slice(0, 3);
    let y = 1010;
    for (const o of others) {
      x.fillStyle = "#eef2fa"; x.font = `700 40px ${BODY}`; x.fillText(uname(o.p), 72, y);
      x.fillStyle = RATING_HEX[ratingClass(o.r)]; x.fillRect(898, y - 40, 112, 52);
      x.fillStyle = "#fff"; x.font = `900 42px ${DISPLAY}`; x.textAlign = "center"; x.fillText(fmt(o.r), 954, y - 1); x.textAlign = "left";
      x.fillStyle = "#1b2438"; x.fillRect(72, y + 26, W - 144, 2);
      y += 86;
    }
  } else {
    x.fillStyle = "#eef2fa"; x.font = `800 64px ${DISPLAY}`; x.fillText(votingOpen(g) ? "RATINGS DROP SOON" : "RATED BY THE SQUAD", 72, 760);
    x.fillStyle = "#8a96ad"; x.font = `500 34px ${BODY}`;
    x.fillText(votingOpen(g) ? `Votes close in ${untilText(revealAt(g) - now())}.` : "Teammates rate teammates.", 72, 818);
  }

  x.fillStyle = "#5b6780"; x.font = `600 28px ${BODY}`;
  x.fillText([g.location, fmtTime(g.time)].filter(Boolean).join(", "), 72, H - 64);
  x.textAlign = "right"; x.fillStyle = "#2b6bff"; x.fillText("Rated on Who Cooked", W - 72, H - 64);
  return c;
}

async function openShareCard(g) {
  try { await document.fonts.load(`900 80px "Big Shoulders Display"`); await document.fonts.load(`700 30px "Instrument Sans"`); } catch (_) {}
  let canvas = await drawShareCard(g, { photos: true });
  let blob;
  try {
    blob = await new Promise((res, rej) => { try { canvas.toBlob((b) => (b ? res(b) : rej(new Error("blank"))), "image/png"); } catch (e) { rej(e); } });
  } catch (_) {
    canvas = await drawShareCard(g, { photos: false }); // photo host blocked cross-origin drawing
    blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  }
  const url = URL.createObjectURL(blob);
  const file = new File([blob], `who-cooked-${g.date}.png`, { type: "image/png" });
  const canShare = !!navigator.canShare?.({ files: [file] });
  const m = $("#modal");
  m.innerHTML = `
    <div class="modal-card" role="dialog" aria-label="Match card">
      <img src="${url}" alt="Match card for ${esc(g.teamA.name)} vs ${esc(g.teamB.name)}">
      <div class="modal-actions">
        ${canShare ? `<button class="btn primary" id="mc-share">${icon("share")} Share</button>` : ""}
        <a class="btn ${canShare ? "" : "primary"}" href="${url}" download="who-cooked-${g.date}.png">Save image</a>
        <button class="btn quiet" id="mc-close">Close</button>
      </div>
    </div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ""; URL.revokeObjectURL(url); };
  $("#mc-close").addEventListener("click", close);
  m.onclick = (e) => { if (e.target === m) close(); };
  $("#mc-share")?.addEventListener("click", () => navigator.share({ files: [file], title: "Who Cooked" }).catch(() => {}));
}

/* ============================================================
   Final score + box score
   ============================================================ */

// A series (best of 3, etc.) keeps each game's score; the headline score is games won.
const seriesGames = (g) => {
  const a = g.teamA?.games, b = g.teamB?.games;
  return Array.isArray(a) && Array.isArray(b) && a.length > 1 ? a.map((x, i) => [x, b[i]]) : null;
};
function seriesLine(g) {
  const list = seriesGames(g);
  return list ? list.map(([a, b], i) => `<span class="sg"><em>G${i + 1}</em> ${esc(a)}–${esc(b)}</span>`).join("") : "";
}

function resultRow(i, a = "", b = "", g) {
  return `<div class="score-input series-row" data-row>
    <span class="tname">${i === 0 ? esc(g.teamA.name) : ""}<em class="gnum">Game ${i + 1}</em></span>
    <input class="tscore" data-a type="number" min="0" inputmode="numeric" required value="${esc(a)}" placeholder="0" aria-label="Game ${i + 1} ${esc(g.teamA.name)}">
    <i></i>
    <input class="tscore" data-b type="number" min="0" inputmode="numeric" required value="${esc(b)}" placeholder="0" aria-label="Game ${i + 1} ${esc(g.teamB.name)}">
    <span class="tname right">${i === 0 ? esc(g.teamB.name) : ""}<button type="button" class="link-btn" data-rm aria-label="Remove game ${i + 1}">Remove</button></span>
  </div>`;
}

function viewResult(id) {
  const g = state.games.find((x) => x.id === id);
  if (!g || !g.teamB) return `<div class="empty">This game isn't ready for a score yet. <a href="#/g/${id}">Back to the game</a></div>`;
  if (!captainOf(g, meId())) return `<div class="empty">Only the two captains can post the score. <a href="#/g/${id}">Back to the game</a></div>`;
  const list = seriesGames(g);
  const rows = (list || [[g.teamA.score ?? "", g.teamB.score ?? ""]]).map(([a, b], i) => resultRow(i, a, b, g)).join("");
  return `
  <a class="back" href="#/g/${id}">Game</a>
  <h1 class="page-title">Final score</h1>
  <form id="result-form" class="stack">
    <div class="seg2 full">
      <button type="button" data-mode="single" class="${list ? "" : "on"}">Single game</button>
      <button type="button" data-mode="series" class="${list ? "on" : ""}">Series</button>
    </div>
    <section class="panel pad ${list ? "is-series" : ""}" id="score-rows">
      <div id="rows">${rows}</div>
      <div class="series-foot">
        <button type="button" class="btn quiet small" id="add-game">+ Add game</button>
        <span class="muted small" id="series-tally"></span>
      </div>
    </section>
    <p class="muted small">Captains only post the score. For a series, log every game; the result is games won, and everyone rates once for the whole run. Each player adds their own stats from the game page.${g.status === "final" ? "" : " Posting the score opens 24 hours of voting. Ratings stay hidden until then, or until everyone has voted."}</p>
    <button class="btn primary block big">${g.status === "final" ? "Save changes" : "Blow the whistle"}</button>
  </form>`;
}

function bindResult(id) {
  const f = $("#result-form");
  if (!f) return;
  const g = state.games.find((x) => x.id === id);
  const box = $("#score-rows"), rowsEl = $("#rows");
  const series = () => box.classList.contains("is-series");
  const read = () => [...rowsEl.querySelectorAll("[data-row]")].map((r) => [Number($("[data-a]", r).value) || 0, Number($("[data-b]", r).value) || 0]);
  const tally = () => {
    const list = read();
    const wa = list.filter(([a, b]) => a > b).length, wb = list.filter(([a, b]) => b > a).length;
    $("#series-tally").textContent = series() ? `Series: ${g.teamA.name} ${wa}–${wb} ${g.teamB.name}` : "";
    return [wa, wb];
  };
  const redraw = (list) => { rowsEl.innerHTML = list.map(([a, b], i) => resultRow(i, a, b, g)).join(""); tally(); };
  const current = () => [...rowsEl.querySelectorAll("[data-row]")].map((r) => [$("[data-a]", r).value, $("[data-b]", r).value]);
  f.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    f.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
    const on = b.dataset.mode === "series";
    box.classList.toggle("is-series", on);
    const list = current();
    if (on && list.length < 2) { while (list.length < 3) list.push(["", ""]); }
    redraw(on ? list : list.slice(0, 1));
  }));
  $("#add-game").addEventListener("click", () => redraw([...current(), ["", ""]]));
  rowsEl.addEventListener("click", (e) => {
    if (!e.target.closest("[data-rm]")) return;
    const list = current();
    if (list.length <= 2) return toast("A series needs at least 2 games");
    list.splice([...rowsEl.children].indexOf(e.target.closest("[data-row]")), 1);
    redraw(list);
  });
  rowsEl.addEventListener("input", tally);
  tally();
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const list = read();
    let teamA, teamB;
    if (series() && list.length > 1) {
      const [wa, wb] = tally();
      teamA = { ...g.teamA, score: wa, games: list.map((x) => x[0]) };
      teamB = { ...g.teamB, score: wb, games: list.map((x) => x[1]) };
    } else {
      const { games: _a, ...ta } = g.teamA, { games: _b, ...tb } = g.teamB;
      teamA = { ...ta, score: list[0][0] };
      teamB = { ...tb, score: list[0][1] };
    }
    act($("button.primary", f), async () => {
      await store.updateGame(id, { status: "final", finalAt: g.finalAt || new Date().toISOString(), teamA, teamB });
      await reload();
      location.hash = `#/g/${id}`;
      toast(g.status === "final" ? "Score saved" : "Full time. Add your stats and rate your team.");
    });
  });
}

/* ============================================================
   Squad
   ============================================================ */

function playerCard(u, s) {
  return `
    <div class="pcard" data-name="${esc((u.displayName + " " + u.username).toLowerCase())}">
      <a class="pc-link" href="#/p/${u.id}">
        ${avatar(u.id, "lg")}
        <div class="grow"><b>${esc(u.displayName)}${u.id === meId() ? ' <em class="ftag">you</em>' : ""}</b>
          ${meta(`@${esc(u.username)}`, `${s.games.length} games`, s.motms ? `${s.motms} MOTM` : "")}
          <div class="form">${s.games.slice(0, 5).reverse().map((x) => `<span class="fdot ${ratingClass(x.rating)}" title="${fmt(x.rating)}"></span>`).join("")}</div></div>
        ${badge(s.avg, "lg")}
      </a>
      ${u.id !== meId() ? `<div class="pc-actions">${friendButton(u.id, "small")}</div>` : ""}
    </div>`;
}

function viewSquad() {
  const friends = friendIds();
  const requests = incomingRequests();
  const tab = state.squadTab === "requests" && !requests.length ? "friends" : state.squadTab;
  let list = state.users;
  if (tab === "friends") list = state.users.filter((u) => friends.has(u.id) || u.id === meId());
  if (tab === "requests") list = requests.map((f) => user(f.from)).filter(Boolean);
  const rows = list.map((u) => ({ u, s: playerSummary(u.id) })).sort((a, b) => (b.s.avg ?? -1) - (a.s.avg ?? -1) || b.s.games.length - a.s.games.length);
  const outgoing = state.friendships.filter((f) => f.status === "pending" && f.from === meId());
  return `
  <h1 class="page-title">Squad</h1>
  <div class="seg2 full">
    <button class="${tab === "friends" ? "on" : ""}" data-sq="friends">Friends <span class="count">${friends.size}</span></button>
    ${requests.length ? `<button class="${tab === "requests" ? "on" : ""}" data-sq="requests">Requests <span class="count red">${requests.length}</span></button>` : ""}
    <button class="${tab === "everyone" ? "on" : ""}" data-sq="everyone">Find players</button>
  </div>
  <input class="search block" id="sq-search" placeholder="${tab === "everyone" ? "Search by name or @username" : "Search"}" aria-label="Search players">
  ${tab === "friends" && friends.size === 0 ? `<div class="empty">No friends yet. Open <b>Find players</b> and add the people you run with.</div>` : ""}
  <div class="panel plist">${rows.map(({ u, s }) => playerCard(u, s)).join("")}</div>
  ${tab === "friends" && outgoing.length ? `<p class="muted small center">Waiting on ${outgoing.length} request${outgoing.length > 1 ? "s" : ""} you sent.</p>` : ""}`;
}

function bindSquad() {
  $$("[data-sq]").forEach((b) => b.addEventListener("click", () => { state.squadTab = b.dataset.sq; render(); }));
  $("#sq-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase().replace(/^@/, "");
    $$(".pcard").forEach((c) => (c.hidden = q && !c.dataset.name.includes(q)));
  });
  bindFriendButtons($("#main"));
}

/* ============================================================
   Profile
   ============================================================ */

function headToHead(a, b) {
  const idx = ratingIndex();
  const out = { together: { w: 0, l: 0, d: 0 }, against: { w: 0, l: 0, d: 0 }, mine: [], theirs: [], higher: 0, lower: 0, shared: 0 };
  for (const g of state.games) {
    if (g.status !== "final") continue;
    const sa = teamOf(g, a), sb = teamOf(g, b);
    if (!sa || !sb) continue;
    out.shared++;
    const w = winner(g);
    const bucket = sa === sb ? out.together : out.against;
    if (w === "D") bucket.d++; else if (w === sa) bucket.w++; else bucket.l++;
    const ra = ratingFor(idx, g, a), rb = ratingFor(idx, g, b);
    if (ra != null && rb != null) {
      out.mine.push(ra); out.theirs.push(rb);
      if (ra > rb) out.higher++; else if (ra < rb) out.lower++;
    }
  }
  return out;
}

function h2hPanel(id, h) {
  const rec = (r) => `${r.w}-${r.l}${r.d ? "-" + r.d : ""}`;
  const name = esc(firstName(id));
  return `<section class="panel pad">
    <div class="block-head tight"><h3>Head to head with ${name}</h3><span class="pro-tag">PRO</span></div>
    ${!h.shared ? `<p class="muted">You haven't played a finished game with ${name} yet.</p>` : `
    <div class="statgrid h2h">
      <div><b>${h.shared}</b><small>Games vs or with</small></div>
      <div><b>${rec(h.together)}</b><small>As teammates</small></div>
      <div><b>${rec(h.against)}</b><small>Against ${name}</small></div>
      <div><b>${h.mine.length ? `${fmt(avg(h.mine))} / ${fmt(avg(h.theirs))}` : "–"}</b><small>Avg rating: you / ${name}</small></div>
      <div><b>${h.higher}-${h.lower}</b><small>Higher rating: you / ${name}</small></div>
    </div>`}
  </section>`;
}

function viewProfile(id) {
  const u = user(id);
  if (!u) return `<div class="empty">Player not found. <a href="#/squad">See the squad</a></div>`;
  const s = playerSummary(id);
  const ss = playerSummary(id, "all", currentSeason());
  const mine = id === meId();
  const trend = s.rated.map((x) => x.rating).reverse();
  const theirFriends = state.friendships.filter((f) => f.status === "accepted" && (f.from === id || f.to === id)).map((f) => (f.from === id ? f.to : f.from));
  const comingUp = state.games.filter((g) => g.status !== "final" && (gamePlayers(g).includes(id) || g.ref?.userId === id || rsvpOf(g, id) === "in")).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const together = mine ? null : (() => {
    const shared = state.games.filter((g) => g.status === "final" && teamOf(g, id) && teamOf(g, meId()));
    return { total: shared.length, same: shared.filter((g) => teamOf(g, id) === teamOf(g, meId())).length };
  })();
  const pro = billing.isPro();
  const seasons = [...new Set(s.games.map((x) => seasonKey(x.g.date)))].sort().reverse().map((k) => ({ key: k, s: playerSummary(id, "all", k) }));
  const h2h = mine ? null : headToHead(meId(), id);
  const badges = BADGES.map((b) => ({ ...b, earned: b.test(s) }));
  const earned = badges.filter((b) => b.earned).length;
  const sportRows = Object.entries(s.bySport).map(([sp, d]) => {
    const cfg = SPORTS[sp] || SPORTS.other;
    return `<div class="sport-block">
      <div class="sb-head"><span>${icon(cfg.icon)} ${cfg.label}</span><span class="muted small">${d.games} game${d.games === 1 ? "" : "s"}</span>${badge(avg(d.ratings))}</div>
      <div class="statgrid">${cfg.stats.map(([k, l]) => `<div><b>${fmt((d.totals[k] || 0) / d.games)}</b><small>${l} per game</small></div>`).join("")}</div>
    </div>`;
  }).join("");

  return `
  <a class="back" href="#/squad">Squad</a>
  <section class="profile-head ${THEMES[styleOf(id).theme] ? "themed" : ""}" style="--img:url('${IMG.hero}');${THEMES[styleOf(id).theme] ? `--accent:${THEMES[styleOf(id).theme]}` : ""}">
    <div class="ph-avatar">${avatar(id, "xxl")}
      ${mine ? `<label class="photo-btn" title="Change profile pic">${icon("camera")}<input type="file" id="avatar-file" accept="image/*" hidden></label>` : ""}</div>
    <div class="grow">
      <h1>${esc(u.displayName)}${styleOf(id).number != null && styleOf(id).number !== "" ? `<span class="jersey">#${esc(styleOf(id).number)}</span>` : ""}${styleOf(id).pro ? `<span class="pro-tag ph-pro">PRO</span>` : ""}</h1>
      ${styleOf(id).title ? `<p class="ph-title">${esc(styleOf(id).title)}</p>` : ""}
      ${meta(`@${esc(u.username)}`, together && together.total ? `${together.total} games together, ${together.same} as teammates` : "")}
      ${mine ? "" : `<div class="ph-actions">${isBlocked(id) ? "" : friendButton(id)}
        <button class="btn quiet small" id="report-user">${icon("flag")} Report</button>
        <button class="btn quiet small ${isBlocked(id) ? "" : "danger"}" id="block-user">${isBlocked(id) ? "Unblock" : "Block"}</button></div>`}
      ${!mine && isBlocked(id) ? `<p class="muted small mt">You blocked ${esc(firstName(id))}. You won't see their comments.</p>` : ""}
      <div class="ph-stats">
        <div><b>${s.games.length}</b><small>Games</small></div>
        <div><b>${s.wins}-${s.draws || 0}-${s.losses}</b><small>W-D-L</small></div>
        <div><b>${s.motms}</b><small>MOTM</small></div>
        <div><b>${theirFriends.length}</b><small>Friends</small></div>
        ${s.reffed ? `<div><b>${fmt(s.refAvg)}</b><small>As ref (${s.reffed})</small></div>` : ""}
      </div>
    </div>
    <div class="ovr">
      <div><small>Overall</small>${badge(s.avg, "xxl")}</div>
      <div class="ovr-season"><small>${esc(seasonLabel(currentSeason()).split(" ")[0])}</small>${badge(ss.avg, "lg")}</div>
    </div>
  </section>

  ${mine ? `
  <section class="panel pad">
    <h3>Your account</h3>
    <div class="photo-row">${avatar(id, "lg")}
      <label class="btn">${icon("camera")} ${u.avatar ? "Change profile pic" : "Upload a profile pic"}<input type="file" id="avatar-file-2" accept="image/*" hidden></label>
      <span class="muted small">Any photo from your phone works. We crop it square.</span></div>
    <form id="profile-form" class="inline">
      <input id="p-name" value="${esc(u.displayName)}" maxlength="30" aria-label="Display name">
      <button class="btn">Save name</button>
      <button type="button" class="btn quiet danger" id="signout">Log out</button>
    </form>
  </section>
  ${customizePanel(id, pro)}
  ${!proOffered() ? "" : `<section class="panel pad">
    <div class="block-head tight"><h3>Plan</h3>${pro ? `<span class="pro-tag">PRO</span>` : ""}</div>
    ${(() => {
      const a = billing.activeLabel();
      if (!billing.enabled) return `<p class="muted small">${pro ? "Previewing Pro on this device." : "Free plan."} <a class="inline-link" href="#/plans">${pro ? "Pro settings" : "See what Pro adds"}</a></p>`;
      if (!a) return `<p class="muted small">Free plan. Avatar frames, a custom profile, rating trend and season recaps come with Pro. <a class="inline-link" href="#/plans">Go Pro</a></p>`;
      const url = billing.manageUrl();
      return `<p>${esc(a.plan)} plan${a.trial ? ", free trial" : ""}${a.expires ? `<span class="muted small">, ${a.renews ? "renews" : "ends"} ${new Date(a.expires).toLocaleDateString()}</span>` : ""}</p>
        <div class="inline mt">${url && a.plan !== "Lifetime" ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Manage or cancel</a>` : ""}<a class="btn quiet" href="#/plans">Plans</a></div>`;
    })()}
  </section>`}
  <section class="panel pad danger-zone">
    <h3>Delete account</h3>
    <p class="muted small">Permanently deletes your profile, ratings, comments and stats. ${billing.enabled ? "Deleting your account doesn't cancel a subscription; cancel it first from Manage." : ""}</p>
    <button class="btn quiet danger" id="delete-account">Delete my account</button>
  </section>` : ""}

  <section class="panel pad">
    <div class="block-head tight"><h3>Badges</h3><span class="muted small">${earned} of ${badges.length} earned</span></div>
    <div class="badges">${badges.map((b) => `
      <div class="bdg ${b.earned ? "earned" : ""}" title="${esc(b.how)}">
        <span class="bdg-mark">${b.code}</span>
        <span class="bdg-text"><b>${b.name}</b><small>${b.how}</small></span>
      </div>`).join("")}</div>
  </section>

  <div class="two-col">
    <section class="panel pad">
      <h3>Form</h3>
      <div class="form-strip">${s.games.slice(0, 5).reverse().map((x) => `<a href="#/g/${x.g.id}" title="${esc(relDate(x.g.date))}">${x.revealed ? badge(x.rating) : `<span class="badge r-none hidden-r">?</span>`}<small class="res ${x.res}">${x.res}</small></a>`).join("") || `<span class="muted">No games yet</span>`}</div>
      ${pro && trend.length > 1 ? `<h4 class="mt">Rating trend</h4>${sparkline(trend)}` : ""}
    </section>
    ${!pro ? proLock("Best game &amp; rating trend", "Every rating you've had on one chart, plus the night you cooked hardest.") : `<section class="panel pad">
      <div class="block-head tight"><h3>Best game</h3><span class="pro-tag">PRO</span></div>
      ${s.best ? `<a class="best" href="#/g/${s.best.g.id}">${badge(s.best.rating, "xl")}<div><b>${esc(s.best.g.teamA.name)} ${s.best.g.teamA.score}–${s.best.g.teamB.score} ${esc(s.best.g.teamB.name)}</b>
        ${meta(esc(relDate(s.best.g.date)), esc(statLine(s.best.g.sport, s.best.stats)))}</div></a>` : `<p class="muted">Shows up after a revealed game with at least ${MIN_VOTES} votes.</p>`}
    </section>`}
  </div>
  ${mine ? "" : h2hPanel(id, h2h)}
  ${seasons.length ? !pro ? proLock("Season recaps", "Month by month: games, record, average rating, MOTMs and best night.") : `
  <section class="panel pad">
    <div class="block-head tight"><h3>Season recaps</h3><span class="pro-tag">PRO</span></div>
    <div class="table-scroll"><table class="recap">
      <thead><tr><th>Season</th><th>Games</th><th>Record</th><th>MOTM</th><th>Best</th><th>Avg</th></tr></thead>
      <tbody>${seasons.map(({ key, s: x }) => `<tr><td>${esc(seasonLabel(key))}</td><td>${x.games.length}</td><td>${x.wins}-${x.losses}${x.draws ? "-" + x.draws : ""}</td><td>${x.motms}</td><td>${x.best ? fmt(x.best.rating) : "–"}</td><td>${badge(x.avg)}</td></tr>`).join("")}</tbody>
    </table></div>
  </section>` : ""}
  ${sportRows ? `<section class="panel pad"><div class="block-head tight"><h3>By sport</h3></div>${sportRows}</section>` : ""}
  ${comingUp.length ? `
  <section class="panel pad">
    <h3>Coming up</h3>
    ${comingUp.map((g) => `
      <a class="log-row" href="#/g/${g.id}">
        <span class="res-pill up">${icon(sportOf(g).icon)}</span>
        <div class="grow"><b>${esc(g.teamA.name)} vs ${g.teamB ? esc(g.teamB.name) : "open spot"}</b>
        ${meta(esc(relDate(g.date)), fmtTime(g.time), esc(g.location), g.ref?.userId === id ? "Reffing" : captainOf(g, id) ? "Captain" : !teamOf(g, id) ? "RSVP'd in" : "")}</div>
        <span class="tag ${g.status === "open" ? "gold" : "blue"}">${g.status === "open" ? "Needs a captain" : "Upcoming"}</span>
      </a>`).join("")}
  </section>` : ""}
  ${theirFriends.length ? `
  <section class="panel pad">
    <h3>Friends</h3>
    <div class="friend-row">${theirFriends.slice(0, 24).map((f) => `<a href="#/p/${f}" title="${esc(uname(f))}">${avatar(f)}<small>${esc(firstName(f))}</small></a>`).join("")}</div>
  </section>` : ""}
  <section class="panel pad">
    <h3>Past games <span class="muted small">${s.games.length}</span></h3>
    ${s.games.map((x) => `
      <a class="log-row" href="#/g/${x.g.id}">
        <span class="res-pill ${x.res}">${x.res}</span>
        <div class="grow"><b>${esc(x.g.teamA.name)} ${x.g.teamA.score}–${x.g.teamB.score} ${esc(x.g.teamB.name)}</b>
        ${meta(esc(relDate(x.g.date)), `${sportOf(x.g).label} ${formatLabel(x.g)}`, x.captain ? "Captain" : "", esc(statLine(x.g.sport, x.stats)))}</div>
        ${x.motm ? '<span class="motm-inline">MOTM</span>' : ""}
        ${x.revealed ? badge(x.rating) : `<span class="badge r-none hidden-r" title="Hidden until voting closes">?</span>`}
      </a>`).join("") || `<p class="muted">No finished games yet.</p>`}
  </section>`;
}

// Pro: avatar frame, profile color, tagline, jersey number. Hidden in the iPhone app until payments are live.
function customizePanel(id, pro) {
  if (!proOffered()) return "";
  const st = styleOf(id);
  const locked = !pro;
  return `
  <section class="panel pad customize ${locked ? "locked" : ""}">
    <div class="block-head tight"><h3>Customize your profile</h3><span class="pro-tag">PRO</span></div>
    <form id="style-form" class="stack">
      <div>
        <h4>Avatar frame</h4>
        <div class="frame-pick">
          <label class="fp"><input type="radio" name="frame" value="" ${!st.frame ? "checked" : ""} ${locked ? "disabled" : ""}>${avatar(id, "lg").replace(/ fr-\w+/, "")}<small>None</small></label>
          ${Object.entries(FRAMES).map(([k, l]) => `<label class="fp"><input type="radio" name="frame" value="${k}" ${st.frame === k ? "checked" : ""} ${locked ? "disabled" : ""}>${avatar(id, "lg").replace(/ fr-\w+/, "").replace('class="avatar lg', `class="avatar lg fr-${k}`)}<small>${l}</small></label>`).join("")}
        </div>
      </div>
      <div>
        <h4>Profile color</h4>
        <div class="theme-pick">
          <label class="tp"><input type="radio" name="theme" value="" ${!st.theme ? "checked" : ""} ${locked ? "disabled" : ""}><span class="sw none"></span></label>
          ${Object.entries(THEMES).map(([k, c]) => `<label class="tp" title="${k}"><input type="radio" name="theme" value="${k}" ${st.theme === k ? "checked" : ""} ${locked ? "disabled" : ""}><span class="sw" style="background:${c}"></span></label>`).join("")}
        </div>
      </div>
      <div class="cust-row">
        <label>Tagline<input name="title" maxlength="32" placeholder="Midfield maestro" value="${esc(st.title || "")}" ${locked ? "disabled" : ""}></label>
        <label>Jersey #<input name="number" type="number" min="0" max="99" inputmode="numeric" placeholder="10" value="${esc(st.number ?? "")}" ${locked ? "disabled" : ""}></label>
      </div>
      ${locked ? `<a class="btn primary block" href="#/plans">Unlock with Pro</a>` : `<button class="btn primary block">Save look</button>`}
    </form>
  </section>`;
}

function bindProfile(id) {
  $("#style-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!billing.isPro()) { location.hash = "#/plans"; return; }
    const f = e.target;
    const num = f.number.value === "" ? null : Math.max(0, Math.min(99, parseInt(f.number.value, 10) || 0));
    const style = { pro: true, frame: f.frame.value || null, theme: f.theme.value || null, title: f.title.value.trim().slice(0, 32) || null, number: num };
    for (const k of Object.keys(style)) if (style[k] == null) delete style[k];
    act($("button.primary", f), async () => { await store.updateProfile(id, { style }); await reload(); rerenderKeepScroll(); toast("Looking fresh"); });
  });
  // Live preview while picking a frame or color.
  $$("#style-form input[name=frame], #style-form input[name=theme]").forEach((r) => r.addEventListener("change", () => {
    const f = $("#style-form"); const head = $(".profile-head");
    const c = THEMES[f.theme.value];
    head.classList.toggle("themed", !!c); if (c) head.style.setProperty("--accent", c); else head.style.removeProperty("--accent");
    const av = $(".ph-avatar .avatar"); if (av) { av.className = av.className.replace(/ ?fr-\w+/g, "") + (f.frame.value ? ` fr-${f.frame.value}` : ""); }
  }));

  bindFriendButtons($("#main"));
  const armed = (btn, label, run) => btn?.addEventListener("click", () => {
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1";
      const prev = btn.innerHTML;
      btn.textContent = label;
      setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.innerHTML = prev; } }, 4000);
      return;
    }
    act(btn, run);
  });
  armed($("#report-user"), "Tap again to report", async () => {
    await store.report(meId(), "user", id, "Reported from profile");
    toast("Reported. We'll review it within 24 hours.");
  });
  const blockBtn = $("#block-user");
  if (blockBtn && isBlocked(id)) {
    blockBtn.addEventListener("click", () => act(blockBtn, async () => { await store.unblock(meId(), id); await reload(); rerenderKeepScroll(); toast("Unblocked"); }));
  } else {
    armed(blockBtn, "Tap again to block", async () => {
      await store.block(meId(), id);
      await reload();
      rerenderKeepScroll();
      toast(`Blocked. You won't see ${firstName(id)}'s comments.`);
    });
  }
  const uploadPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    act(null, async () => {
      await store.uploadAvatar(id, file);
      await reload();
      render();
      toast("Profile pic updated");
    });
  };
  $("#avatar-file")?.addEventListener("change", uploadPhoto);
  $("#avatar-file-2")?.addEventListener("change", uploadPhoto);
  $("#profile-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    act(null, async () => {
      await store.updateProfile(id, { displayName: $("#p-name").value });
      await reload();
      render();
      toast("Name saved");
    });
  });
  const delBtn = $("#delete-account");
  delBtn?.addEventListener("click", () => {
    if (!delBtn.dataset.armed) {
      delBtn.dataset.armed = "1";
      delBtn.textContent = "Tap again to permanently delete your account";
      setTimeout(() => { if (delBtn.isConnected) { delete delBtn.dataset.armed; delBtn.textContent = "Delete my account"; } }, 5000);
      return;
    }
    act(delBtn, async () => {
      await store.deleteAccount(id);
      await billing.logOut();
      await reload();
      location.hash = "#/";
      render();
      toast("Your account was deleted");
    });
  });
  $("#signout")?.addEventListener("click", async () => {
    await billing.logOut();
    await store.signOut();
    await reload();
    location.hash = "#/";
    render();
  });
}

/* ============================================================
   Leaderboard
   ============================================================ */

function viewLeaders() {
  const sport = state.leadersSport;
  const seasons = [...new Set([currentSeason(), ...state.games.filter((g) => g.status === "final").map((g) => seasonKey(g.date))])].sort().reverse();
  const season = state.leadersSeason ?? currentSeason();
  const cfg = sport === "all" ? null : SPORTS[sport];
  const all = state.users
    .map((u) => {
      const s = playerSummary(u.id, sport, season);
      const d = cfg && s.bySport[sport];
      return { u, s, key: d ? (d.totals[cfg.key] || 0) / d.games : null };
    })
    .filter((r) => r.s.games.length);
  const ranked = all.filter((r) => r.s.avg != null).sort((a, b) => b.s.avg - a.s.avg || b.s.motms - a.s.motms);
  const unrated = all.filter((r) => r.s.avg == null);
  const refs = state.users.map((u) => ({ u, s: playerSummary(u.id, "all", season) })).filter((r) => r.s.reffed && r.s.refAvg != null).sort((a, b) => b.s.refAvg - a.s.refAvg);
  const podium = ranked.slice(0, 3);

  return `
  <h1 class="page-title">Leaders</h1>
  <div class="chips seasons">${seasons.map((k) => `<button class="chip ${season === k ? "on" : ""}" data-season="${k}">${k === currentSeason() ? "This season" : esc(seasonLabel(k))}</button>`).join("")}<button class="chip ${season === "all" ? "on" : ""}" data-season="all">All time</button></div>
  ${sportChips(sport, "lsport")}
  ${podium.length ? `
  <div class="podium">${podium.map((r, i) => `
    <a class="pod p${i + 1}" href="#/p/${r.u.id}">
      <span class="pod-rank">${i + 1}</span>${avatar(r.u.id, i === 0 ? "xl" : "lg")}
      <b>${esc(r.u.displayName)}</b>${badge(r.s.avg, i === 0 ? "xl" : "lg")}
      <small>${r.s.rated.length} rated game${r.s.rated.length === 1 ? "" : "s"}</small>
    </a>`).join("")}</div>` : ""}
  <section class="panel flush">
    <div class="table-wrap"><table class="leaders">
      <thead><tr><th>#</th><th>Player</th><th>GP</th><th>W-D-L</th><th>MOTM</th>${cfg ? `<th>${cfg.keyLabel}</th>` : ""}<th>Rating</th></tr></thead>
      <tbody>${ranked.map((r, i) => `
        <tr data-href="#/p/${r.u.id}" class="${r.u.id === meId() ? "me" : ""}">
          <td class="rank r${i + 1}">${i + 1}</td>
          <td><span class="pcell">${avatar(r.u.id, "sm")}${esc(r.u.displayName)}</span></td>
          <td>${r.s.games.length}</td><td>${r.s.wins}-${r.s.draws || 0}-${r.s.losses}</td><td>${r.s.motms}</td>
          ${cfg ? `<td>${fmt(r.key)}</td>` : ""}
          <td>${badge(r.s.avg)}</td>
        </tr>`).join("")}
        ${unrated.map((r) => `
        <tr data-href="#/p/${r.u.id}" class="unrated ${r.u.id === meId() ? "me" : ""}">
          <td class="rank">–</td>
          <td><span class="pcell">${avatar(r.u.id, "sm")}${esc(r.u.displayName)}</span></td>
          <td>${r.s.games.length}</td><td>${r.s.wins}-${r.s.draws || 0}-${r.s.losses}</td><td>${r.s.motms}</td>
          ${cfg ? `<td>${fmt(r.key)}</td>` : ""}
          <td><span class="muted small">N/A</span></td>
        </tr>`).join("")}
        ${!all.length ? `<tr><td colspan="7" class="muted center pad">No finished games ${season === "all" ? "" : "this season "}${cfg ? `in ${cfg.label.toLowerCase()} ` : ""}yet.</td></tr>` : ""}</tbody>
    </table></div>
  </section>
  ${refs.length ? `
  <section class="block">
    <div class="block-head"><h2>Refs</h2><span class="muted small">Rated by the players</span></div>
    <div class="panel flush"><div class="table-wrap"><table class="leaders">
      <thead><tr><th>Ref</th><th>Games</th><th>Rating</th></tr></thead>
      <tbody>${refs.map((r) => `<tr data-href="#/p/${r.u.id}"><td><span class="pcell">${avatar(r.u.id, "sm")}${esc(r.u.displayName)}</span></td><td>${r.s.reffed}</td><td>${badge(r.s.refAvg)}</td></tr>`).join("")}</tbody>
    </table></div></div>
  </section>` : ""}
  ${ads.slot()}
  <p class="muted small center footnote">A game rating counts once at least ${MIN_VOTES} teammates have rated you, and only after voting closes. Seasons reset every month.</p>`;
}

function bindLeaders() {
  $$("[data-lsport]").forEach((b) => b.addEventListener("click", () => { state.leadersSport = b.dataset.lsport; render(); }));
  $$("[data-season]").forEach((b) => b.addEventListener("click", () => { state.leadersSeason = b.dataset.season; render(); }));
  $$("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));
}

/* ============================================================
   Inbox
   ============================================================ */

function viewInbox() {
  const items = buildInbox();
  return `
  <h1 class="page-title">Inbox</h1>
  <div class="panel inbox">${items.map((i) => `
    <a class="note ${i.unread ? "unread" : ""}" href="${i.href}">
      <span class="note-ic">${icon(i.ic)}</span>
      <span class="grow"><span class="note-text">${i.html}</span><small>${timeAgo(new Date(i.t).toISOString())}</small></span>
      ${i.unread ? '<span class="note-dot" aria-label="New"></span>' : ""}
    </a>`).join("") || `<div class="empty">Nothing yet. Friend requests, games you're added to, rating reminders and banter show up here.</div>`}</div>
  ${store.mode === "shared" ? "" : `<p class="muted small center footnote">Phone push alerts need the shared league setup. Until then, check here.</p>`}`;
}

function bindInbox() {
  setSeen(now());
  updateBadges();
}

/* ============================================================
   Router
   ============================================================ */

let lastKey = null;

function updateBadges() {
  if (!state.me) return;
  const set = (sel, n) => { const el = $(sel); if (!el) return; el.hidden = !n; el.textContent = n > 9 ? "9+" : n; };
  set("#rate-dot", pendingGames().length);
  set("#squad-dot", incomingRequests().length);
  set("#inbox-dot", buildInbox().filter((i) => i.unread).length);
}

function render() {
  const hash = location.hash.replace(/^#/, "").split("#")[0] || "/";
  const [, route, param, sub] = hash.split("/");
  const main = $("#main");
  document.body.classList.toggle("signed-out", !state.me);

  if (!state.me) {
    main.innerHTML = viewAuth();
    bindAuth();
    ads.afterRender("auth");
    return;
  }
  if (store.recovery) {
    document.body.classList.add("signed-out");
    main.innerHTML = viewNewPassword();
    bindNewPassword();
    ads.afterRender("auth");
    return;
  }
  if (state.me.needsSetup) {
    document.body.classList.add("signed-out");
    main.innerHTML = viewSetup();
    bindSetup();
    ads.afterRender("auth");
    return;
  }

  if (route === "plans" && !proOffered()) { location.replace(`#/p/${meId()}`); return; }
  if (route === "plans") {
    document.body.classList.add("signed-out");
    main.innerHTML = viewPaywall();
    bindPaywall();
    ads.afterRender("plans");
    if (billing.enabled) billing.loadPlans().then((p) => { if (location.hash.startsWith("#/plans") && JSON.stringify(p) !== JSON.stringify(state.plans)) { state.plans = p; rerenderKeepScroll(); } });
    return;
  }
  const editorKey = route === "new" ? "new" : route === "g" && (sub === "join" || sub === "edit") ? `${param}/${sub}` : null;
  if (editorKey && editorKey !== lastKey) startEditor(route === "new" ? "create" : sub, param);
  lastKey = editorKey;

  let html, bind;
  if (route === "new" || (route === "g" && (sub === "join" || sub === "edit"))) [html, bind] = [viewEditor(), bindEditor];
  else if (route === "g" && sub === "result") [html, bind] = [viewResult(param), () => bindResult(param)];
  else if (route === "g") [html, bind] = [viewGame(param), () => bindGame(param)];
  else if (route === "squad") [html, bind] = [viewSquad(), bindSquad];
  else if (route === "p") [html, bind] = [viewProfile(param), () => bindProfile(param)];
  else if (route === "leaders") [html, bind] = [viewLeaders(), bindLeaders];
  else if (route === "nearby") [html, bind] = [viewNearby(), bindNearby];
  else if (route === "inbox") [html, bind] = [viewInbox(), bindInbox];
  else [html, bind] = [viewFeed(), bindFeed];

  main.innerHTML = html;
  bind();

  const active = route === "p" ? (param === meId() ? "me" : "squad") : route === "g" ? "" : route || "";
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === active));
  $("#nav-me").setAttribute("href", `#/p/${meId()}`);
  $("#nav-me-avatar").innerHTML = avatar(meId(), "xs");
  updateBadges();
  ads.afterRender(route === "new" ? "editor" : route || "");
}

let prevRoute = null;
window.addEventListener("hashchange", () => {
  const r = location.hash.split("#")[1]?.split("/").slice(0, 3).join("/");
  if (r !== prevRoute) state.replyTo = null;
  if (r !== prevRoute && !location.hash.endsWith("#banter")) window.scrollTo(0, 0);
  prevRoute = r;
  render();
});

// Native Google/Apple sign-in finishes in the system browser and comes back here.
window.addEventListener("but:auth", async (e) => {
  if (e.detail?.error) toast(e.detail.error);
  await reload();
  location.hash = "#/";
  render();
});

// In a shared league, pick up new activity every minute while the app is open.
let lastUnread = null;
setInterval(async () => {
  if (store.mode !== "shared" || !state.me || document.hidden || $("#main textarea:focus, #main input:focus") || $("#main [data-norefresh]:not([hidden])")) return;
  try {
    await reload();
    const unread = buildInbox().filter((i) => i.unread).length;
    if (lastUnread != null && unread > lastUnread) toast("New activity in your inbox");
    lastUnread = unread;
    rerenderKeepScroll();
  } catch (_) {}
}, 60000);

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-qrsvp]");
  if (!b) return;
  e.preventDefault();
  doRsvp(b.dataset.gid, b.dataset.qrsvp, b);
});

(async function boot() {
  reminders.init();
  const brand = $("#brand-icon");
  brand.src = IMG.logo;
  brand.onerror = () => brand.remove();
    $$("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  try {
    await store.init();
    // Open instantly with what this device saw last time, then refresh quietly.
    if (!location.hash.startsWith("#/plans") && !store.recovery && await loadSnapshot()) {
      render();
      reload().then(() => {
        if ($("#main textarea:focus, #main input:focus") || $("#main [data-norefresh]:not([hidden])")) return;
        if (!state.me) return render();
        rerenderKeepScroll();
      }).catch((err) => console.warn("Background refresh failed", err));
      return;
    }
    await reload();
  } catch (err) {
    $("#main").innerHTML = `<div class="empty">Couldn't connect to the league database. Check the keys in config.js.<br><small class="muted">${esc(err.message)}</small></div>`;
    return;
  }
  render();
})();
