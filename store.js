/**
 * Gist storage for meal plans.
 *
 * Reading needs no token — the raw gist URL is public, so any device can view
 * the current or a past plan. Only writing needs the token, which lives in
 * localStorage on the machines you plan from.
 *
 * IMPORTANT: reads use the SHA-less raw URL. The URL GitHub shows you in the
 * web UI contains a commit SHA and is pinned to that revision forever, which
 * would mean your phone showing the first plan you ever made.
 */

const GIST_ID = "ed79e3fd6fcb62c572762985eead7613";
const GIST_USER = "og286";
const TOKEN_KEY = "recipebook_gist_token";

const RAW = (file) =>
  `https://gist.githubusercontent.com/${GIST_USER}/${GIST_ID}/raw/${file}`;

/* ------------------------------------------------------------------ token */

export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t.trim());
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export const canWrite = () => !!getToken();

/* ------------------------------------------------------------------- read */

/**
 * Read a file from the gist. No auth.
 * GitHub's CDN caches raw URLs for up to a minute, so we bust it with a
 * timestamp — otherwise you save a plan and the phone still shows the old one.
 */
export async function readFile(file, fallback) {
  try {
    const res = await fetch(`${RAW(file)}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    return text.trim() ? JSON.parse(text) : fallback;
  } catch (e) {
    console.warn(`readFile(${file}) failed:`, e.message);
    return fallback;
  }
}

export const readPlans = () => readFile("plans.json", []);
export const readSettings = () => readFile("settings.json", {});

/* ------------------------------------------------------------------ write */

async function writeFiles(files) {
  const token = getToken();
  if (!token) throw new Error("No token saved. Add one in Settings to save plans.");

  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files }),
  });

  if (res.status === 401) throw new Error("Token rejected. It may have expired or lack the Gists write permission.");
  if (res.status === 403) throw new Error("Forbidden — check the token has 'Gists' write permission.");
  if (res.status === 404) throw new Error("Gist not found. Check the ID, and that the token belongs to the same account.");
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  return res.json();
}

/**
 * Save a plan. Reads first and checks the revision, so two devices editing the
 * same week warn instead of silently overwriting each other — the Gist API has
 * no conditional-write support, so this is the best available guard.
 */
export async function savePlan(plan, { force = false } = {}) {
  const plans = await readPlans();
  const existing = plans.findIndex((p) => p.id === plan.id);

  if (existing > -1 && !force) {
    const theirs = plans[existing].revision ?? 0;
    const ours = plan.revision ?? 0;
    if (theirs > ours) {
      const err = new Error(
        `This week was changed elsewhere (revision ${theirs}, you have ${ours}). Reload, or save again to overwrite.`
      );
      err.conflict = true;
      err.theirs = plans[existing];
      throw err;
    }
  }

  const next = { ...plan, revision: (plan.revision ?? 0) + 1, updatedAt: new Date().toISOString() };
  if (existing > -1) plans[existing] = next;
  else plans.unshift(next);

  // keep the last 26 weeks; the gist's own version history holds the rest
  const trimmed = plans.slice(0, 26);
  await writeFiles({ "plans.json": { content: JSON.stringify(trimmed, null, 2) } });
  return next;
}

export async function saveSettings(settings) {
  await writeFiles({ "settings.json": { content: JSON.stringify(settings, null, 2) } });
  return settings;
}

/** Verify a token works without changing anything meaningful. */
export async function testToken(token) {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/vnd.github+json" },
  });
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, message: "Token not recognised." };
  if (res.status === 403) return { ok: false, message: "Token lacks Gists permission." };
  if (res.status === 404) return { ok: false, message: "Can't see that gist with this token." };
  return { ok: false, message: `GitHub returned ${res.status}.` };
}

/* --------------------------------------------------------------- helpers */

/** Flatten stored plans into the history format the planner expects. */
export function historyFromPlans(plans) {
  const out = [];
  for (const p of plans) {
    for (const s of p.slots ?? []) {
      // an evening with no meal is not a use of anything
      if (!s.recipeId) continue;
      out.push({ recipeId: s.recipeId, date: p.weekOf, cooked: s.cooked !== null && s.cooked !== undefined });
    }
  }
  return out;
}

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekOf(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export { GIST_ID, GIST_USER };
