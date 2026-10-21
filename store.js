import { capPlugin } from "./native.js";
import { isReservedUsername } from "./reserved.js";
// Data layer with two interchangeable backends sharing one async API:
//   - LocalStore    : demo mode, everything in this browser's localStorage
//   - SupabaseStore : real accounts (Supabase Auth), shared database + avatar storage
//
// Shapes used by the app
//   user   { id, username, displayName, avatar, color }
//   team   { captainId, name, playerIds:[], formation:"2-3-1", gk:true,
//            slots:{ slotKey: playerId }, positions:{ playerId: "PG" }, score:null|number }
//   game   { id, sport, date, time, location, createdBy, createdAt,
//            status:"open"|"ready"|"final", teamA:team, teamB:team|null,
//            ref:{ userId:string|null, name:string }|null, stats:{ playerId:{...} } }
//   rating { id, gameId, raterId, target: playerId | "ref", score, note }
//   friendship { id, from, to, status:"pending"|"accepted", createdAt }
//   rsvp   { gameId, userId, status:"in"|"maybe"|"out", createdAt }  (createdAt = when they last changed it; sets waitlist order)
//   comment{ id, gameId, userId, body, parentId (comment it replies to, or null), createdAt }
//   playerStats { gameId, userId, stats:{...}, updatedAt }  each player enters only their own
//   game also carries finalAt (whistle time, starts the 24h voting window) and claimedAt.
//
// Sign-in: username/password (demo) or email/password, Google and phone codes (Supabase).

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const PALETTE = ["#c6ff3d", "#38bdf8", "#f97316", "#a78bfa", "#f472b6", "#facc15", "#2dd4bf", "#fb7185", "#818cf8", "#4ade80"];
export const colorFor = (i) => PALETTE[i % PALETTE.length];

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Shrink an uploaded photo to a square JPEG so it's light to store and fast to load.
export async function squareImage(file, size = 384) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That file isn't an image we can read."));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar || null, color: u.color, style: u.style || {} });

/* =====================================================================
   Local (demo) store
   ===================================================================== */

const KEY = "ballUpTop.v2";
const SESSION_KEY = "ballUpTop.session";

class LocalStore {
  constructor() {
    this.mode = "local";
    this.db = null;
  }
  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db));
    } catch (e) {
      throw new Error("Browser storage is full. Try a smaller profile photo.");
    }
  }
  async init() {
    try { this.db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
    if (!this.db || this.db.version !== 4) {
      this.db = await seedData();
      this.db.friends = seedFriends(this.db.users);
      this.#save();
    }
  }
  get supportsSocialLogin() { return false; }
  async signInWithGoogle() { throw new Error("Google sign-in turns on once the shared league database is connected (see README)."); }
  async signInWithApple() { throw new Error("Sign in with Apple turns on once the shared league database is connected (see README)."); }
  get recovery() { return false; }
  async sendPasswordReset() { throw new Error("Demo accounts live in this browser only, so there's no email to send a reset link to. Create a new demo account instead."); }
  async updatePassword() {}
  async deleteAccount(id) {
    this.db.users = this.db.users.filter((u) => u.id !== id);
    this.db.friends = this.db.friends.filter((f) => f.from !== id && f.to !== id);
    this.db.ratings = this.db.ratings.filter((r) => r.raterId !== id && r.target !== id);
    this.db.comments = this.db.comments.filter((c) => c.userId !== id);
    this.db.rsvps = this.db.rsvps.filter((r) => r.userId !== id);
    this.db.playerStats = this.db.playerStats.filter((r) => r.userId !== id);
    this.db.games = this.db.games.filter((g) => g.createdBy !== id);
    this.#save();
    await this.signOut();
  }
  async sendPhoneCode() { throw new Error("Phone sign-in turns on once the shared league database is connected (see README)."); }
  async verifyPhoneCode() { throw new Error("Phone sign-in isn't available in demo mode."); }
  async completeSetup() {}

  /* auth */
  async currentUser() {
    let id = null;
    try { id = localStorage.getItem(SESSION_KEY); } catch (_) {}
    const u = this.db.users.find((x) => x.id === id);
    return u ? publicUser(u) : null;
  }
  async signUp({ username, displayName, password }) {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error("Username: 3–20 letters, numbers, _ or .");
    if (password.length < 6) throw new Error("Password needs at least 6 characters.");
    if (isReservedUsername(username) || this.db.users.some((u) => u.username === username)) throw new Error("That username is taken.");
    const salt = uid();
    const u = {
      id: uid(), username, displayName: displayName.trim() || username, salt,
      passHash: await sha256(salt + password), avatar: null,
      color: colorFor(this.db.users.length), createdAt: new Date().toISOString(),
    };
    this.db.users.push(u);
    this.#save();
    try { localStorage.setItem(SESSION_KEY, u.id); } catch (_) {}
    return publicUser(u);
  }
  async signIn({ login, password }) {
    const u = this.db.users.find((x) => x.username === login.trim().toLowerCase());
    if (!u || (await sha256(u.salt + password)) !== u.passHash) throw new Error("Wrong username or password.");
    try { localStorage.setItem(SESSION_KEY, u.id); } catch (_) {}
    return publicUser(u);
  }
  // Who's signed in on this device, without a network call (used to open instantly from the last snapshot).
  async sessionUserId() { try { return localStorage.getItem(SESSION_KEY); } catch (_) { return null; } }
  async signOut() {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }

  /* users */
  async listUsers() { return this.db.users.map(publicUser); }
  async updateProfile(id, patch) {
    const u = this.db.users.find((x) => x.id === id);
    if (patch.displayName != null) u.displayName = patch.displayName.trim() || u.username;
    if (patch.style != null) u.style = structuredClone(patch.style);
    this.#save();
  }
  async uploadAvatar(id, file) {
    const { dataUrl } = await squareImage(file, 256);
    const u = this.db.users.find((x) => x.id === id);
    const prev = u.avatar;
    u.avatar = dataUrl;
    try { this.#save(); } catch (e) { u.avatar = prev; throw e; }
    return dataUrl;
  }

  /* games */
  async listGames() { return structuredClone(this.db.games); }
  async createGame(g) {
    const game = { ...structuredClone(g), id: uid(), createdAt: new Date().toISOString() };
    this.db.games.push(game);
    this.#save();
    return game;
  }
  async updateGame(id, patch) {
    const g = this.db.games.find((x) => x.id === id);
    if (!g) throw new Error("Game not found.");
    Object.assign(g, structuredClone(patch));
    this.#save();
    return structuredClone(g);
  }
  async deleteGame(id) {
    this.db.games = this.db.games.filter((g) => g.id !== id);
    this.db.ratings = this.db.ratings.filter((r) => r.gameId !== id);
    this.db.rsvps = this.db.rsvps.filter((r) => r.gameId !== id);
    this.db.comments = this.db.comments.filter((c) => c.gameId !== id);
    this.db.playerStats = this.db.playerStats.filter((r) => r.gameId !== id);
    this.#save();
  }

  /* ratings */
  async listRatings() { return structuredClone(this.db.ratings); }
  async upsertRatings(list) {
    const now = new Date().toISOString();
    for (const { gameId, raterId, target, score, note = "" } of list) {
      const ex = this.db.ratings.find((r) => r.gameId === gameId && r.raterId === raterId && r.target === target);
      if (ex) Object.assign(ex, { score, note });
      else this.db.ratings.push({ id: uid(), gameId, raterId, target, score, note, createdAt: now });
    }
    this.#save();
  }

  /* rsvps */
  async listRsvps() { return structuredClone(this.db.rsvps); }
  async setRsvp(gameId, userId, status) {
    this.db.rsvps = this.db.rsvps.filter((r) => !(r.gameId === gameId && r.userId === userId));
    if (status) this.db.rsvps.push({ gameId, userId, status, createdAt: new Date().toISOString() });
    this.#save();
  }

  /* comments */
  async listComments() { return structuredClone(this.db.comments); }
  async addComment(gameId, userId, body, parentId = null) {
    body = body.trim();
    if (!body) throw new Error("Write something first.");
    if (body.length > 500) throw new Error("Keep it under 500 characters.");
    this.db.comments.push({ id: uid(), gameId, userId, body, parentId, createdAt: new Date().toISOString() });
    this.#save();
  }
  async deleteComment(id) {
    // Deleting a comment removes the replies under it too.
    const gone = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of this.db.comments) if (c.parentId && gone.has(c.parentId) && !gone.has(c.id)) { gone.add(c.id); grew = true; }
    }
    this.db.comments = this.db.comments.filter((c) => !gone.has(c.id));
    this.#save();
  }

  /* safety: blocks and reports */
  async listBlocks(me) { return (this.db.blocks || []).filter((b) => b.blocker === me).map((b) => b.blocked); }
  async block(me, id) {
    this.db.blocks = (this.db.blocks || []).filter((b) => !(b.blocker === me && b.blocked === id));
    this.db.blocks.push({ blocker: me, blocked: id });
    this.#save();
  }
  async unblock(me, id) { this.db.blocks = (this.db.blocks || []).filter((b) => !(b.blocker === me && b.blocked === id)); this.#save(); }
  async report(me, kind, targetId, reason) {
    (this.db.reports ||= []).push({ reporter: me, kind, targetId, reason, createdAt: new Date().toISOString() });
    this.#save();
  }

  /* player stats (your own line only) */
  async listStats() { return structuredClone(this.db.playerStats); }
  async setStats(gameId, userId, stats) {
    this.db.playerStats = this.db.playerStats.filter((r) => !(r.gameId === gameId && r.userId === userId));
    this.db.playerStats.push({ gameId, userId, stats, updatedAt: new Date().toISOString() });
    this.#save();
  }

  /* friends */
  async listFriendships() { return structuredClone(this.db.friends); }
  async requestFriend(from, to) {
    if (from === to) throw new Error("You can't add yourself.");
    const ex = this.db.friends.find((f) => (f.from === from && f.to === to) || (f.from === to && f.to === from));
    if (ex) {
      if (ex.status === "pending" && ex.to === from) ex.status = "accepted"; // they already asked you
      this.#save();
      return;
    }
    this.db.friends.push({ id: uid(), from, to, status: "pending", createdAt: new Date().toISOString() });
    this.#save();
  }
  async respondFriend(id, accept) {
    const f = this.db.friends.find((x) => x.id === id);
    if (!f) return;
    if (accept) f.status = "accepted";
    else this.db.friends = this.db.friends.filter((x) => x.id !== id);
    this.#save();
  }
  async removeFriend(id) {
    this.db.friends = this.db.friends.filter((x) => x.id !== id);
    this.#save();
  }

  /* demo-only helpers */
  async reset(withDemo) {
    this.db = withDemo ? await seedData() : { version: 4, users: [], games: [], ratings: [], friends: [], rsvps: [], comments: [], playerStats: [] };
    if (withDemo) this.db.friends = seedFriends(this.db.users);
    this.#save();
    await this.signOut();
  }
}

/* =====================================================================
   Supabase store (real accounts)
   ===================================================================== */

class SupabaseStore {
  constructor(url, key) {
    this.mode = "shared";
    this.url = url;
    this.key = key;
  }
  async init() {
    // The iPhone app bundles the library (window.supabase); the website loads it from the CDN.
    const createClient = window.supabase?.createClient || (await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")).createClient;
    this.native = !!window.Capacitor?.isNativePlatform?.();
    this.createClient = createClient;
    // Password-reset links come back with the session in the URL hash (#access_token=...&type=recovery),
    // which works in any browser. Take it out before the hash router or the auth library sees it.
    const hp = new URLSearchParams(location.hash.slice(1));
    const fromLink = hp.get("access_token") ? { access_token: hp.get("access_token"), refresh_token: hp.get("refresh_token"), type: hp.get("type") }
      : hp.get("error_description") ? { error: hp.get("error_code") === "otp_expired" ? "That reset link has expired or was already used. Request a new one." : hp.get("error_description").replace(/\+/g, " ") } : null;
    if (fromLink) history.replaceState(null, "", location.pathname + location.search + "#/");
    this.sb = createClient(this.url, this.key, { auth: { flowType: "pkce", detectSessionInUrl: !this.native, persistSession: true } });
    // A password-reset link lands here with ?reset=1 (plus ?code=...); remember it so the app asks for a new password.
    this.recovery = false;
    this.sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") this.recovery = true; });
    const qs = new URLSearchParams(location.search);
    // Email links (password reset, confirm email) carry a one-time token_hash, so they work in whatever
    // browser opens them, even if the request was made in the iPhone app.
    this.linkError = fromLink?.error || null;
    if (fromLink?.access_token) {
      const { error } = await this.sb.auth.setSession({ access_token: fromLink.access_token, refresh_token: fromLink.refresh_token });
      if (error) this.linkError = "That reset link has expired or was already used. Request a new one.";
      else if (fromLink.type === "recovery") this.recovery = true;
    }
    if (qs.has("token_hash")) {
      const type = qs.get("type") || "recovery";
      const { error } = await this.sb.auth.verifyOtp({ token_hash: qs.get("token_hash"), type });
      if (error) this.linkError = /expired|invalid/i.test(error.message) ? "That link has expired or was already used. Request a new one." : error.message;
      else if (type === "recovery") this.recovery = true;
    }
    // Finish a Google/Apple/reset redirect (?code=...) before the app reads the session, then tidy the URL.
    const { data: sess } = await this.sb.auth.getSession();
    if (qs.has("reset") && sess?.session) this.recovery = true;
    if (qs.has("code") || qs.has("reset") || qs.has("token_hash")) history.replaceState(null, "", location.pathname + (location.hash || "#/"));
    if (this.native) try {
      // In the iPhone app, OAuth runs in the system browser and comes back through the app's URL scheme.
      const App = capPlugin("App");
      App.addListener("appUrlOpen", async ({ url }) => {
        if (!url?.startsWith(NATIVE_REDIRECT)) return;
        const code = new URL(url.replace(/#/, "?")).searchParams.get("code");
        try { capPlugin("Browser").close(); } catch (_) {}
        if (code) {
          const { error } = await this.sb.auth.exchangeCodeForSession(code);
          window.dispatchEvent(new CustomEvent("but:auth", { detail: { error: error?.message } }));
        }
      });
    } catch (err) {
      console.warn("Deep-link listener unavailable", err);
    }
  }
  get supportsSocialLogin() { return true; }
  async #oauth(provider) {
    if (this.native) {
      const { data, error } = await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } });
      if (error) throw new Error(error.message);
      await capPlugin("Browser").open({ url: data.url, presentationStyle: "popover" });
      return;
    }
    this.#ok(await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } }));
  }
  async signInWithGoogle() { return this.#oauth("google"); }
  async signInWithApple() {
    if (this.native) {
      // Native Sign in with Apple sheet, then hand the identity token to Supabase.
      const raw = crypto.randomUUID() + crypto.randomUUID();
      const hashed = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const Apple = capPlugin("SignInWithApple");
      const res = await Apple.authorize({ clientId: APP_BUNDLE_ID, redirectURI: this.url + "/auth/v1/callback", scopes: "email name", nonce: hashed });
      const token = res?.response?.identityToken;
      if (!token) throw new Error("Apple didn't return a sign-in token. Try again.");
      this.#ok(await this.sb.auth.signInWithIdToken({ provider: "apple", token, nonce: raw }));
      const given = [res.response.givenName, res.response.familyName].filter(Boolean).join(" ");
      if (given) await this.sb.auth.updateUser({ data: { full_name: given } });
      return;
    }
    return this.#oauth("apple");
  }
  async deleteAccount(id) {
    // Remove profile pictures first (Storage API), then the account itself.
    try {
      const { data } = await this.sb.storage.from("avatars").list(id);
      if (data?.length) await this.sb.storage.from("avatars").remove(data.map((f) => `${id}/${f.name}`));
    } catch (_) {}
    this.#ok(await this.sb.rpc("delete_my_account"));
    await this.sb.auth.signOut();
  }
  async sendPhoneCode(phone) {
    this.#ok(await this.sb.auth.signInWithOtp({ phone: phone.trim() }));
  }
  async verifyPhoneCode(phone, token) {
    this.#ok(await this.sb.auth.verifyOtp({ phone: phone.trim(), token: token.trim(), type: "sms" }));
    return this.currentUser();
  }
  async completeSetup(id, { username, displayName }) {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error("Username: 3–20 letters, numbers, _ or .");
    const taken = this.#ok(await this.sb.from("profiles").select("id").eq("username", username).neq("id", id));
    if (taken.length || isReservedUsername(username)) throw new Error("That username is taken.");
    this.#ok(await this.sb.from("profiles").update({ username, display_name: displayName.trim() || username, onboarded: true }).eq("id", id));
  }
  #ok({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
  }
  #user(r) {
    return { id: r.id, username: r.username, displayName: r.display_name, avatar: r.avatar_url, color: r.color, style: r.style || {}, needsSetup: r.onboarded === false };
  }
  #game(r) {
    return {
      id: r.id, sport: r.sport, date: r.played_on, time: r.kickoff || "", location: r.location || "",
      createdBy: r.created_by, createdAt: r.created_at, status: r.status,
      teamA: r.team_a, teamB: r.team_b, ref: r.ref, stats: r.stats || {},
      finalAt: r.final_at, claimedAt: r.claimed_at,
      cap: r.cap ?? null, isPublic: !!r.is_public, lat: r.lat ?? null, lng: r.lng ?? null,
    };
  }

  /* auth */
  async currentUser() {
    const { data } = await this.sb.auth.getUser();
    if (!data?.user) return null;
    const rows = this.#ok(await this.sb.from("profiles").select("*").eq("id", data.user.id));
    if (rows[0]) return this.#user(rows[0]);
    // Profile row missing (e.g. email confirmation flow) – create it from signup metadata.
    const meta = data.user.user_metadata || {};
    const count = (await this.listUsers()).length;
    const row = this.#ok(
      await this.sb.from("profiles").insert({
        id: data.user.id,
        username: meta.username || data.user.email.split("@")[0],
        display_name: meta.display_name || meta.username || "Player",
        color: colorFor(count),
      }).select().single()
    );
    return this.#user(row);
  }
  async signUp({ username, displayName, password, email }) {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error("Username: 3–20 letters, numbers, _ or .");
    const taken = this.#ok(await this.sb.from("profiles").select("id").eq("username", username));
    if (taken.length || isReservedUsername(username)) throw new Error("That username is taken.");
    const res = this.#ok(
      await this.sb.auth.signUp({
        email: email.trim(), password,
        options: { data: { username, display_name: displayName.trim() || username } },
      })
    );
    if (!res.session) throw new Error("Check your email to confirm your account, then log in.");
    return this.currentUser();
  }
  async signIn({ login, password }) {
    this.#ok(await this.sb.auth.signInWithPassword({ email: login.trim(), password }));
    return this.currentUser();
  }
  async signOut() { this.recovery = false; await this.sb.auth.signOut(); }
  async sessionUserId() { try { return (await this.sb.auth.getSession()).data.session?.user?.id || null; } catch (_) { return null; } }
  async sendPasswordReset(email) {
    email = (email || "").trim();
    if (!email) throw new Error("Enter the email you signed up with.");
    // Reset links always open the website, even when asked for from the iPhone app.
    const back = this.native ? SITE_URL : location.origin + location.pathname;
    // Request it with the implicit flow so the link signs in wherever it's opened (Safari, Gmail, another phone).
    // The default PKCE flow only works in the same browser that asked, which broke resets requested in the app.
    const once = this.createClient(this.url, this.key, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "wc-reset" } });
    this.#ok(await once.auth.resetPasswordForEmail(email, { redirectTo: back + "?reset=1" }));
  }
  async updatePassword(password) {
    if (!password || password.length < 6) throw new Error("Use at least 6 characters.");
    this.#ok(await this.sb.auth.updateUser({ password }));
    this.recovery = false;
  }

  /* users */
  async listUsers() {
    return this.#ok(await this.sb.from("profiles").select("*").order("created_at")).map((r) => this.#user(r));
  }
  async updateProfile(id, patch) {
    const row = {};
    if (patch.displayName != null) row.display_name = patch.displayName;
    if (patch.style != null) row.style = patch.style;
    this.#ok(await this.sb.from("profiles").update(row).eq("id", id));
  }
  async uploadAvatar(id, file) {
    const { blob } = await squareImage(file, 384);
    const path = `${id}/${Date.now()}.jpg`;
    this.#ok(await this.sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true }));
    const url = this.sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    this.#ok(await this.sb.from("profiles").update({ avatar_url: url }).eq("id", id));
    return url;
  }

  /* games */
  async listGames() {
    return this.#ok(await this.sb.from("games").select("*").order("played_on", { ascending: false })).map((r) => this.#game(r));
  }
  #row(g) {
    const out = {};
    if ("sport" in g) out.sport = g.sport;
    if ("date" in g) out.played_on = g.date;
    if ("time" in g) out.kickoff = g.time || null;
    if ("location" in g) out.location = g.location;
    if ("createdBy" in g) out.created_by = g.createdBy;
    if ("status" in g) out.status = g.status;
    if ("teamA" in g) out.team_a = g.teamA;
    if ("teamB" in g) out.team_b = g.teamB;
    if ("ref" in g) out.ref = g.ref;
    if ("stats" in g) out.stats = g.stats;
    if ("finalAt" in g) out.final_at = g.finalAt;
    if ("cap" in g) out.cap = g.cap || null;
    if ("isPublic" in g) out.is_public = !!g.isPublic;
    if ("lat" in g) out.lat = g.lat ?? null;
    if ("lng" in g) out.lng = g.lng ?? null;
    if ("claimedAt" in g) out.claimed_at = g.claimedAt;
    return out;
  }
  async createGame(g) {
    return this.#game(this.#ok(await this.sb.from("games").insert(this.#row(g)).select().single()));
  }
  async updateGame(id, patch) {
    return this.#game(this.#ok(await this.sb.from("games").update(this.#row(patch)).eq("id", id).select().single()));
  }
  async deleteGame(id) { this.#ok(await this.sb.from("games").delete().eq("id", id)); }

  /* ratings */
  async listRatings() {
    return this.#ok(await this.sb.from("ratings").select("*")).map((r) => ({
      id: r.id, gameId: r.game_id, raterId: r.rater_id, target: r.target, score: Number(r.score), note: r.note || "", createdAt: r.created_at,
    }));
  }
  async upsertRatings(list) {
    if (!list.length) return;
    this.#ok(
      await this.sb.from("ratings").upsert(
        list.map((r) => ({ game_id: r.gameId, rater_id: r.raterId, target: r.target, score: r.score, note: r.note || "" })),
        { onConflict: "game_id,rater_id,target" }
      )
    );
  }
}

SupabaseStore.prototype.listRsvps = async function () {
  const { data, error } = await this.sb.from("rsvps").select("*");
  if (error) throw new Error(error.message);
  return data.map((r) => ({ gameId: r.game_id, userId: r.user_id, status: r.status, createdAt: r.created_at }));
};
SupabaseStore.prototype.setRsvp = async function (gameId, userId, status) {
  const q = status
    ? this.sb.from("rsvps").upsert({ game_id: gameId, user_id: userId, status, created_at: new Date().toISOString() }, { onConflict: "game_id,user_id" })
    : this.sb.from("rsvps").delete().eq("game_id", gameId).eq("user_id", userId);
  const { error } = await q;
  if (error) throw new Error(error.message);
};
SupabaseStore.prototype.listComments = async function () {
  const { data, error } = await this.sb.from("comments").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return data.map((r) => ({ id: r.id, gameId: r.game_id, userId: r.user_id, body: r.body, parentId: r.parent_id, createdAt: r.created_at }));
};
SupabaseStore.prototype.addComment = async function (gameId, userId, body, parentId = null) {
  body = body.trim();
  if (!body) throw new Error("Write something first.");
  const { error } = await this.sb.from("comments").insert({ game_id: gameId, user_id: userId, body: body.slice(0, 500), parent_id: parentId });
  if (error) throw new Error(error.message);
};
SupabaseStore.prototype.listStats = async function () {
  const { data, error } = await this.sb.from("player_stats").select("*");
  if (error) throw new Error(error.message);
  return data.map((r) => ({ gameId: r.game_id, userId: r.user_id, stats: r.stats || {}, updatedAt: r.updated_at }));
};
SupabaseStore.prototype.setStats = async function (gameId, userId, stats) {
  const { error } = await this.sb.from("player_stats").upsert(
    { game_id: gameId, user_id: userId, stats, updated_at: new Date().toISOString() },
    { onConflict: "game_id,user_id" }
  );
  if (error) throw new Error(error.message);
};
SupabaseStore.prototype.deleteComment = async function (id) {
  const { error } = await this.sb.from("comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
};

SupabaseStore.prototype.listFriendships = async function () {
  const { data, error } = await this.sb.from("friendships").select("*");
  if (error) throw new Error(error.message);
  return data.map((r) => ({ id: r.id, from: r.requester, to: r.addressee, status: r.status, createdAt: r.created_at }));
};
SupabaseStore.prototype.requestFriend = async function (from, to) {
  if (from === to) throw new Error("You can't add yourself.");
  const existing = (await this.listFriendships()).find((f) => (f.from === from && f.to === to) || (f.from === to && f.to === from));
  if (existing) {
    if (existing.status === "pending" && existing.to === from) return this.respondFriend(existing.id, true);
    return;
  }
  const { error } = await this.sb.from("friendships").insert({ requester: from, addressee: to });
  if (error) throw new Error(error.message);
};
SupabaseStore.prototype.respondFriend = async function (id, accept) {
  const q = accept
    ? this.sb.from("friendships").update({ status: "accepted" }).eq("id", id)
    : this.sb.from("friendships").delete().eq("id", id);
  const { error } = await q;
  if (error) throw new Error(error.message);
};
SupabaseStore.prototype.removeFriend = async function (id) {
  const { error } = await this.sb.from("friendships").delete().eq("id", id);
  if (error) throw new Error(error.message);
};

const APP_BUNDLE_ID = "com.bizboxd.balluptop";
const NATIVE_REDIRECT = APP_BUNDLE_ID + "://auth";
const SITE_URL = "https://whocooked.gg/";

export function createStore() {
  const cfg = window.BUT_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) return new SupabaseStore(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  return new LocalStore();
}

/* =====================================================================
   Demo league
   ===================================================================== */

const AV = "https://d8j0ntlcm91z4.cloudfront.net/user_3APYC1QfmdVhtIeeTSVdRpRxODl/hf_";

async function seedData() {
  const people = [
    ["marcus", "Marcus", AV + "20261015_020406_78355916-25ea-45e7-8e22-461b0b6e55df_min.webp"],
    ["dre", "Dre", AV + "20261015_020405_d1860ab0-598b-41b8-8c19-224c6b764366_min.webp"],
    ["sofia", "Sofia", AV + "20261015_020406_c04af587-0cd8-49a2-802e-8b1563b0c9e0_min.webp"],
    ["jay", "Jay", AV + "20261015_020406_efd93652-1fda-4c59-b029-a0abca0bd80e_min.webp"],
    ["kev", "Kev", AV + "20261015_020407_f7aef140-b478-4acc-b064-a88c64c49fa2_min.webp"],
    ["tasha", "Tasha", AV + "20261015_020407_5e4b80c7-8ea9-4daa-86a9-da4d3e26d872_min.webp"],
    ["luis", "Luis", AV + "20261015_020407_eef99f41-e768-471a-b165-fda179bd5157_min.webp"],
    ["nina", "Nina", AV + "20261015_020406_bb0e062c-e66e-41f3-8c37-d099b63b7df5_min.webp"],
    ["omar", "Omar", null],
    ["benji", "Benji", null],
    ["zeke", "Zeke", null],
    ["mo", "Mo", null],
    ["ty", "Ty", null],
    ["cam", "Cam", null],
    ["rico", "Rico", null],
    ["coach_ray", "Ray (Ref)", null],
  ];
  const users = [];
  for (const [i, [username, displayName, avatar]] of people.entries()) {
    const salt = uid();
    users.push({
      id: uid(), username, displayName, salt, passHash: await sha256(salt + "demo123"),
      avatar, color: colorFor(i), createdAt: new Date(Date.now() - (60 - i) * 864e5).toISOString(),
    });
  }
  const U = Object.fromEntries(users.map((u) => [u.username, u.id]));
  const H = 36e5;
  const ago = (hours) => new Date(Date.now() - hours * H).toISOString();
  const dayOf = (hoursAgo) => {
    const d = new Date(Date.now() - hoursAgo * H);
    return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  };
  const games = [], ratings = [], rsvps = [], comments = [];

  const team = (captain, name, players, formation, gk, score, positions = {}) => {
    const ids = players.map((p) => U[p]);
    const slots = {};
    if (formation) {
      let i = 0;
      if (gk) slots.gk = ids[i++];
      formation.split("-").map(Number).forEach((n, li) => { for (let j = 0; j < n; j++) slots[`${li}-${j}`] = ids[i++]; });
    }
    return { captainId: U[captain], name, playerIds: ids, formation, gk, slots, positions, score };
  };

  // Every teammate rates every teammate (and the ref). `skip` leaves some raters out (voting still open).
  const rateGame = (g, base, refBase, skip = []) => {
    const jit = (a, b) => (((a.charCodeAt(0) + b.charCodeAt(2) + a.charCodeAt(5)) % 9) - 4) * 0.1;
    const t0 = new Date(g.finalAt).getTime();
    for (const t of [g.teamA, g.teamB]) {
      for (const r of t.playerIds) {
        if (skip.includes(r)) continue;
        const at = new Date(t0 + ((r.charCodeAt(0) % 9) + 1) * 0.4 * H).toISOString();
        for (const e of t.playerIds) {
          if (r === e) continue;
          const name = users.find((u) => u.id === e).username;
          const score = Math.max(1, Math.min(10, Math.round(((base[name] ?? 6.5) + jit(r, e)) * 10) / 10));
          ratings.push({ id: uid(), gameId: g.id, raterId: r, target: e, score, note: "", createdAt: at });
        }
        if (g.ref && refBase) ratings.push({ id: uid(), gameId: g.id, raterId: r, target: "ref", score: Math.round((refBase + jit(r, "ref")) * 10) / 10, note: "", createdAt: at });
      }
    }
  };
  const say = (g, who, hoursAgo, body, parent = null) => {
    const c = { id: uid(), gameId: g.id, userId: U[who], body, parentId: parent?.id || null, createdAt: ago(hoursAgo) };
    comments.push(c);
    return c;
  };

  // Tonight's 6v6, full time 3 hours ago. Votes are still coming in, so ratings are hidden.
  const g0 = {
    id: uid(), sport: "soccer", date: dayOf(4), time: "18:30", location: "Hope High cage",
    createdBy: U.marcus, createdAt: ago(30), claimedAt: ago(26), finalAt: ago(3), status: "final",
    teamA: team("marcus", "Marcus FC", ["luis", "marcus", "sofia", "nina", "omar", "zeke"], "2-2-1", true, 3),
    teamB: team("jay", "Jay's Squad", ["kev", "jay", "dre", "tasha", "benji", "rico"], "2-1-2", true, 5),
    ref: { userId: U.coach_ray, name: "Ray (Ref)" },
    stats: { [U.sofia]: { goals: 2 }, [U.marcus]: { assists: 2 }, [U.nina]: { goals: 1 }, [U.jay]: { goals: 2, assists: 1 }, [U.dre]: { goals: 2, assists: 2 }, [U.rico]: { goals: 1 }, [U.kev]: { saves: 7 }, [U.luis]: { saves: 4 } },
  };
  games.push(g0);
  rateGame(g0, { sofia: 8.4, marcus: 7.6, nina: 7.1, omar: 6.4, luis: 7.3, zeke: 6.2, kev: 8.6, jay: 8.2, dre: 8.9, tasha: 6.9, benji: 6.3, rico: 7.4 }, 6.8, [U.marcus, U.jay, U.nina, U.benji]);
  const kevPost = say(g0, "dre", 2.6, "Kev in goal was unreal tonight. 7 saves.");
  say(g0, "kev", 2.4, "Had to bail y'all out, the defence was on vacation", kevPost);
  const rematch = say(g0, "sofia", 2.2, "We had that until the last ten minutes, rematch next week");
  const marcusIn = say(g0, "marcus", 2.0, "Run it back Sunday. Same pitch.", rematch);
  say(g0, "jay", 1.8, "Bring a keeper this time", marcusIn);
  say(g0, "jay", 1.4, "Rate your teammates before the window closes!");

  // 7v8 soccer two nights ago, revealed.
  const g1 = {
    id: uid(), sport: "soccer", date: dayOf(50), time: "19:30", location: "Slater Park turf",
    createdBy: U.marcus, createdAt: ago(90), claimedAt: ago(80), finalAt: ago(48), status: "final",
    teamA: team("marcus", "Night Shift", ["luis", "marcus", "omar", "sofia", "kev", "tasha", "nina"], "2-3-1", true, 5),
    teamB: team("jay", "Cage FC", ["benji", "zeke", "mo", "ty", "dre", "cam", "rico", "jay"], "3-3-1", true, 4),
    ref: { userId: U.coach_ray, name: "Ray (Ref)" },
    stats: {
      [U.sofia]: { goals: 2, assists: 1 }, [U.marcus]: { goals: 1, assists: 2 }, [U.nina]: { goals: 1 }, [U.tasha]: { goals: 1, assists: 1 },
      [U.luis]: { saves: 6 }, [U.jay]: { goals: 3 }, [U.dre]: { goals: 1, assists: 2 }, [U.benji]: { saves: 4 }, [U.rico]: { assists: 1 },
    },
  };
  games.push(g1);
  rateGame(g1, { sofia: 8.5, marcus: 8, nina: 7, omar: 6.5, luis: 7.6, kev: 6.6, tasha: 7.1, jay: 9.1, dre: 7.5, benji: 6.5, zeke: 6.4, mo: 6.0, ty: 6.5, cam: 6.4, rico: 7.0 }, 7.2);
  const ht = say(g1, "jay", 46, "Hat-trick and we still lost. Football is cruel");
  say(g1, "marcus", 45, "8 vs 7 and you still couldn't do it 😂", ht);
  say(g1, "tasha", 40, "Ray actually reffed it straight for once");

  // 4v4 soccer last week, revealed.
  const g2 = {
    id: uid(), sport: "soccer", date: dayOf(100), time: "18:00", location: "Hope High cage",
    createdBy: U.dre, createdAt: ago(130), claimedAt: ago(120), finalAt: ago(98), status: "final",
    teamA: team("dre", "Bibs", ["kev", "dre", "jay", "nina"], "2-1", true, 6),
    teamB: team("sofia", "No Bibs", ["omar", "sofia", "luis", "marcus"], "1-2", true, 6),
    ref: null,
    stats: { [U.jay]: { goals: 3 }, [U.dre]: { goals: 2, assists: 3 }, [U.nina]: { goals: 1 }, [U.sofia]: { goals: 3, assists: 1 }, [U.marcus]: { goals: 2 }, [U.luis]: { goals: 1, assists: 2 }, [U.kev]: { saves: 5 }, [U.omar]: { saves: 3 } },
  };
  games.push(g2);
  rateGame(g2, { kev: 7.1, dre: 8.6, jay: 8.1, nina: 6.6, omar: 6.4, sofia: 9.0, luis: 7.0, marcus: 7.5 });

  // 3v3 basketball, revealed, with a ref who isn't on the app.
  const g3 = {
    id: uid(), sport: "basketball", date: dayOf(146), time: "20:00", location: "Slater Park courts",
    createdBy: U.jay, createdAt: ago(170), claimedAt: ago(160), finalAt: ago(144), status: "final",
    teamA: team("jay", "Shirts", ["jay", "tasha", "kev"], null, false, 21),
    teamB: team("marcus", "Skins", ["marcus", "dre", "benji"], null, false, 17),
    ref: { userId: null, name: "Big Mike" },
    stats: { [U.jay]: { pts: 9, reb: 4, ast: 3 }, [U.tasha]: { pts: 7, ast: 5 }, [U.kev]: { pts: 5, reb: 8, blk: 2 }, [U.marcus]: { pts: 8, reb: 3 }, [U.dre]: { pts: 7, ast: 4, stl: 2 }, [U.benji]: { pts: 2, reb: 6 } },
  };
  g3.teamA.positions = { [U.jay]: "SG", [U.tasha]: "PG", [U.kev]: "C" };
  g3.teamB.positions = { [U.marcus]: "SF", [U.dre]: "PG", [U.benji]: "C" };
  games.push(g3);
  rateGame(g3, { jay: 8.0, tasha: 8.1, kev: 7.4, marcus: 7.0, dre: 7.6, benji: 5.9 }, 5.4);

  // Open run in two days, waiting on a second captain. People are RSVPing.
  const g4 = {
    id: uid(), sport: "soccer", date: dayOf(-48), time: "19:00", location: "Slater Park turf",
    createdBy: U.sofia, createdAt: ago(6), status: "open",
    teamA: team("sofia", "Sofia's Squad", ["luis", "sofia", "nina", "omar", "tasha"], "2-1-1", true, null),
    teamB: null,
    ref: { userId: U.coach_ray, name: "Ray (Ref)" },
    stats: {},
  };
  games.push(g4);
  for (const [who, st, h] of [["sofia", "in", 6], ["luis", "in", 5.5], ["nina", "in", 5], ["dre", "in", 4], ["jay", "in", 3], ["kev", "in", 2.5], ["benji", "out", 2], ["rico", "in", 1]]) {
    rsvps.push({ gameId: g4.id, userId: U[who], status: st, createdAt: ago(h) });
  }
  say(g4, "sofia", 5.8, "Need a second captain. Who's taking the other side?");

  return { version: 4, users, games, ratings, rsvps, comments, friends: [], playerStats: [] };
}

function seedFriends(users) {
  const U = Object.fromEntries(users.map((u) => [u.username, u.id]));
  const out = [];
  const add = (a, b, status = "accepted") => {
    if (U[a] && U[b]) out.push({ id: uid(), from: U[a], to: U[b], status, createdAt: new Date().toISOString() });
  };
  // A friend group around Marcus and Jay, plus a couple of open requests to show the flow.
  for (const b of ["dre", "sofia", "jay", "luis", "nina"]) add("marcus", b);
  for (const b of ["dre", "kev", "tasha", "benji"]) add("jay", b);
  add("sofia", "nina"); add("dre", "kev"); add("tasha", "nina");
  add("omar", "marcus", "pending");
  add("rico", "jay", "pending");
  return out;
}

SupabaseStore.prototype.listBlocks = async function (me) {
  const { data, error } = await this.sb.from("blocks").select("blocked").eq("blocker", me);
  if (error) return []; // older databases without the table: treat as no blocks
  return data.map((r) => r.blocked);
};
SupabaseStore.prototype.block = async function (me, id) {
  const { error } = await this.sb.from("blocks").upsert({ blocker: me, blocked: id }, { onConflict: "blocker,blocked" });
  if (error) throw new Error(error.message);
};
SupabaseStore.prototype.unblock = async function (me, id) {
  const { error } = await this.sb.from("blocks").delete().eq("blocker", me).eq("blocked", id);
  if (error) throw new Error(error.message);
};
SupabaseStore.prototype.report = async function (me, kind, targetId, reason) {
  const { error } = await this.sb.from("reports").insert({ reporter: me, kind, target_id: targetId, reason: reason || "" });
  if (error) throw new Error(error.message);
};
