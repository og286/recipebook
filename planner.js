/**
 * Meal planner: constrained weighted selection.
 *
 * Picks N meals from the book so that, as far as the pool allows:
 *   - no carbohydrate appears more than twice
 *   - chicken at most 3x, any other protein at most 2x
 *   - at least 1 high-effort and at least 2 low-effort nights
 *   - no two consecutive slots share a cuisine
 *   - nothing cooked in the last 21 days
 *
 * When the pool can't satisfy everything it relaxes rules in a FIXED order and
 * reports what it dropped. It never silently returns a bad week.
 *
 * Works in the browser and in node (no imports).
 */

export const RELAXATION_ORDER = [
  "cuisine",   // cosmetic, goes first
  "effort",    // annoying but survivable
  "recency",   // 21 -> 14 -> 7 -> 0 days
  "protein",   // getting serious
  "carb",      // Jon's most important rule — last resort
];

export const DEFAULT_RULES = {
  maxPerCarb: 2,
  maxChicken: 3,
  maxPerProtein: 2,
  minHighEffort: 1,
  minLowEffort: 2,
  recencyDays: 21,
  noRepeatCuisineAdjacent: true,
};

/* ------------------------------------------------------------------ utils */

const daysBetween = (a, b) => Math.round((a - b) / 86400000);

/** deterministic PRNG so a seed reproduces a week exactly (needed for tests) */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** history: [{recipeId, date: Date|string, cooked: bool}] */
export function usageStats(history, now = new Date()) {
  const stats = new Map();
  for (const h of history) {
    const d = h.date instanceof Date ? h.date : new Date(h.date);
    const days = daysBetween(now, d);
    const prev = stats.get(h.recipeId) ?? { lastUsedDays: Infinity, uses: 0 };
    // a meal that was planned but never marked cooked counts as half a use
    prev.uses += h.cooked === false ? 0.5 : 1;
    prev.lastUsedDays = Math.min(prev.lastUsedDays, days);
    stats.set(h.recipeId, prev);
  }
  return stats;
}

export function weightFor(recipe, stats) {
  const s = stats.get(recipe.id) ?? { lastUsedDays: Infinity, uses: 0 };
  const recency = Math.min((s.lastUsedDays === Infinity ? 60 : s.lastUsedDays) / 60, 1);
  const frequency = 1 / (1 + s.uses);
  const boost = recipe.plan?.boost ?? 1;
  return (0.15 + 0.85 * recency) * frequency * boost;
}

function weightedPick(candidates, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return candidates[Math.floor(rng() * candidates.length)];
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/* ------------------------------------------------------------ constraints */

function capsOk(chosen, cand, rules, active) {
  if (active.has("carb")) {
    const carb = cand.plan.carb;
    if (carb !== "none") {
      const n = chosen.filter((c) => c && c.plan.carb === carb).length;
      if (n >= rules.maxPerCarb) return false;
    }
  }
  if (active.has("protein")) {
    const p = cand.plan.protein;
    const cap = p === "chicken" ? rules.maxChicken : rules.maxPerProtein;
    const n = chosen.filter((c) => c && c.plan.protein === p).length;
    if (n >= cap) return false;
  }
  return true;
}

function cuisineOk(chosen, cand, idx, active) {
  if (!active.has("cuisine")) return true;
  const c = cand.plan.cuisine;
  if (!c || c === "none") return true;
  for (const j of [idx - 1, idx + 1]) {
    if (chosen[j] && chosen[j].plan.cuisine === c) return false;
  }
  return true;
}

/** minimums are checked once the week is full, plus a feasibility guard */
function effortShortfall(chosen, rules) {
  const filled = chosen.filter(Boolean);
  const high = filled.filter((c) => c.plan.effort === "high").length;
  const low = filled.filter((c) => c.plan.effort === "low").length;
  return {
    high: Math.max(0, rules.minHighEffort - high),
    low: Math.max(0, rules.minLowEffort - low),
  };
}

/* ---------------------------------------------------------------- solver */

function attempt(pool, slots, rules, active, rng, locked) {
  const chosen = new Array(slots).fill(null);
  for (const [i, r] of Object.entries(locked ?? {})) chosen[+i] = r;

  const order = [...Array(slots).keys()]
    .filter((i) => !chosen[i])
    .sort(() => rng() - 0.5);

  for (const idx of order) {
    const remaining = order.length - order.indexOf(idx) - 1;

    let cands = pool.filter((r) => {
      if (chosen.includes(r)) return false;
      if (!capsOk(chosen, r, rules, active)) return false;
      if (!cuisineOk(chosen, r, idx, active)) return false;
      return true;
    });

    // effort minimums: if we're running out of slots, force the shortfall now
    if (active.has("effort")) {
      const need = effortShortfall(chosen, rules);
      const totalNeed = need.high + need.low;
      if (totalNeed > remaining) {
        const wanted = need.high > 0 ? "high" : "low";
        const forced = cands.filter((r) => r.plan.effort === wanted);
        if (forced.length) cands = forced;
      }
    }

    if (!cands.length) return null;
    chosen[idx] = weightedPick(cands, cands.map((r) => r.weight), rng);
  }

  if (active.has("effort")) {
    const need = effortShortfall(chosen, rules);
    if (need.high || need.low) return null;
  }
  return chosen;
}

/**
 * @param {object[]} recipes  full book
 * @param {object}   opts     { mealType, slots, history, now, rules, seed, locked, exclude }
 * @returns {{ slots, relaxed, notes }}
 */
export function planWeek(recipes, opts = {}) {
  const {
    mealType = "dinner",
    slots = 7,
    history = [],
    now = new Date(),
    seed = Math.floor(Math.random() * 2 ** 31),
    locked = {},
    exclude = [],
  } = opts;
  const rules = { ...DEFAULT_RULES, ...(opts.rules ?? {}) };
  const rng = makeRng(seed);
  const stats = usageStats(history, now);

  const eligible = recipes.filter(
    (r) => r.plan?.eligible && r.plan.mealTypes?.includes(mealType) && !exclude.includes(r.id)
  );

  const lockedRecipes = {};
  for (const [i, id] of Object.entries(locked)) {
    const r = eligible.find((x) => x.id === id) ?? recipes.find((x) => x.id === id);
    if (r) lockedRecipes[i] = r;
  }

  const relaxed = [];
  const recencySteps = [rules.recencyDays, 14, 7, 0];
  let recencyIdx = 0;
  let active = new Set(["carb", "protein", "effort", "cuisine"]);
  if (!rules.noRepeatCuisineAdjacent) active.delete("cuisine");

  for (let stage = 0; stage <= RELAXATION_ORDER.length; stage++) {
    const cutoff = recencySteps[recencyIdx];
    const pool = eligible
      .filter((r) => {
        const s = stats.get(r.id);
        return !s || s.lastUsedDays >= cutoff;
      })
      .map((r) => ({ ...r, weight: weightFor(r, stats) }));

    const lockedInPool = {};
    for (const [i, r] of Object.entries(lockedRecipes)) {
      lockedInPool[i] = pool.find((p) => p.id === r.id) ?? { ...r, weight: 0 };
    }

    if (pool.length + Object.keys(lockedInPool).length >= slots) {
      for (let tries = 0; tries < 300; tries++) {
        const result = attempt(pool, slots, rules, active, rng, lockedInPool);
        if (result) {
          return {
            slots: result.map((r) => ({
              recipeId: r.id,
              title: r.title,
              carb: r.plan.carb,
              protein: r.plan.protein,
              effort: r.plan.effort,
              cuisine: r.plan.cuisine,
              locked: Object.values(locked).includes(r.id),
            })),
            relaxed,
            notes: describeRelaxations(relaxed, cutoff, rules),
          };
        }
      }
    }

    // couldn't do it — relax the next rule in the fixed order
    const next = RELAXATION_ORDER[stage];
    if (next === "recency") {
      if (recencyIdx < recencySteps.length - 1) {
        recencyIdx++;
        relaxed.push({ rule: "recency", to: recencySteps[recencyIdx] });
        stage--; // try each recency step before moving on
        continue;
      }
      relaxed.push({ rule: "recency", to: 0 });
    } else if (next) {
      active.delete(next);
      relaxed.push({ rule: next });
    } else {
      return { slots: [], relaxed, notes: ["No valid plan could be built, even with every rule relaxed. The pool is too small."] };
    }
  }
  return { slots: [], relaxed, notes: ["Planner exhausted all options."] };
}

function describeRelaxations(relaxed, cutoff, rules) {
  const notes = [];
  for (const r of relaxed) {
    if (r.rule === "cuisine") notes.push("Allowed two nights running with the same cuisine.");
    else if (r.rule === "effort") notes.push(`Couldn't guarantee ${rules.minHighEffort} high-effort and ${rules.minLowEffort} low-effort nights.`);
    else if (r.rule === "recency") notes.push(`Allowed repeats after ${r.to} days instead of ${rules.recencyDays} — not enough unused recipes.`);
    else if (r.rule === "protein") notes.push("Exceeded the protein limits — add more variety to the book.");
    else if (r.rule === "carb") notes.push("Exceeded the carbohydrate limit. This is the rule you care most about, so it's worth adding recipes to fix it.");
  }
  return notes;
}

/** Re-roll a single slot, holding the rest of the week fixed. */
export function swapSlot(recipes, currentSlots, index, opts = {}) {
  const locked = {};
  currentSlots.forEach((s, i) => { if (i !== index && s) locked[i] = s.recipeId; });
  return planWeek(recipes, {
    ...opts,
    locked,
    exclude: [...(opts.exclude ?? []), currentSlots[index]?.recipeId].filter(Boolean),
  });
}
