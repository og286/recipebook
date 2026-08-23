/**
 * Shopping list generation — the single implementation, used by both the
 * browser page and the command-line tool. Kept separate so the two can't drift.
 *
 * No imports, works in the browser and node.
 */

const WHOLE = new Set(["each", "tin", "clove", "rasher", "slice", "bunch"]);

const UNIT_LABEL = {
  one:  { each: "", tin: " tin", clove: " clove", rasher: " rasher", slice: " slice", bunch: " bunch" },
  many: { each: "", tin: " tins", clove: " cloves", rasher: " rashers", slice: " slices", bunch: " bunches" },
};

/** Build the preferred-unit map once per rules file. */
export function targetUnits(rules) {
  const m = new Map();
  for (const d of Object.values(rules.items)) {
    if (d.canonical && d.unit && !m.has(d.canonical)) m.set(d.canonical, d.unit);
  }
  return m;
}

/**
 * Convert between units for the same item. Returns null when genuinely
 * incompatible, so callers can report rather than guess.
 */
export function convert(qty, from, to, item, rules) {
  if (from === to) return qty;
  const g = rules.gramsEach?.[item];
  if (g) {
    if (from === "each" && to === "g") return qty * g;
    if (from === "g" && to === "each") return qty / g;
  }
  if ((from === "g" && to === "ml") || (from === "ml" && to === "g")) return qty;
  // tins are not all 400g — a tuna tin is 145g
  const tin = rules.packSizes?.[item]?.size ?? 400;
  if (from === "tin" && (to === "g" || to === "ml")) return qty * tin;
  if ((from === "g" || from === "ml") && to === "tin") return qty / tin;
  return null;
}

/**
 * @param {object[]} chosen    planned recipes — each scaled to feed the family once
 * @param {object}   rules     ingredient-rules.json
 * @param {number}   familyKcal
 * @param {object[]} standing  things eaten every week regardless of the plan,
 *                             as [{ recipe, servings }] — e.g. 14 breakfast
 *                             smoothies, two a day for Jon and Jo. Scaled by
 *                             serving count, not by the family calorie target.
 * @returns {{ items, pantry, vague, scales }}
 */
export function buildList(chosen, rules, familyKcal = 2500, standing = []) {
  const units = targetUnits(rules);
  const agg = new Map();
  const pantry = new Map();
  const vague = [];
  const scales = new Map();

  const entries = [
    ...chosen.map((r) => ({ r, scale: r.totalKcal ? familyKcal / r.totalKcal : 1, label: r.title })),
    ...standing.map(({ recipe, servings }) => ({
      r: recipe,
      scale: servings / (recipe.serves || 1),
      label: `${recipe.title} ×${servings}`,
    })),
  ];

  for (const { r, scale, label } of entries) {
    scales.set(r.id, scale);
    for (const ing of r.ingredients ?? []) {
      const b = ing.buy;
      if (!b || b.skip) continue;

      if (b.pantry) {
        if (!pantry.has(b.item)) pantry.set(b.item, { aisle: b.aisle, from: new Set() });
        pantry.get(b.item).from.add(label);
        continue;
      }
      if (b.qty == null || b.unit === "splash") {
        vague.push({ item: b.item, aisle: b.aisle, from: label });
        continue;
      }
      const to = units.get(b.item) ?? b.unit;
      const q = convert(b.qty * scale, b.unit, to, b.item, rules);
      if (q == null) {
        vague.push({ item: b.item, aisle: b.aisle, from: label });
        continue;
      }
      if (!agg.has(b.item)) agg.set(b.item, { item: b.item, unit: to, qty: 0, aisle: b.aisle, from: new Set() });
      const e = agg.get(b.item);
      e.qty += q;
      e.from.add(label);
    }
  }
  return { items: agg, pantry, vague, scales };
}

/** Format a summed quantity as something you can actually buy. */
export function formatQty(qty, unit, item, rules) {
  const pack = rules.packSizes?.[item];
  if (pack && pack.unit === unit) {
    // 10% tolerance — don't send you back for a second jar to cover 25g
    const n = Math.max(1, Math.ceil(qty / pack.size / 1.1 - 0.001));
    return `${n} × ${pack.label}`;
  }
  if (WHOLE.has(unit)) {
    const n = Math.ceil(qty - 0.001);
    return n + (n === 1 ? UNIT_LABEL.one[unit] : UNIT_LABEL.many[unit]);
  }
  const n = Math.ceil(qty / 5) * 5;
  return n >= 1000
    ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + (unit === "g" ? "kg" : "L")
    : n + unit;
}

/** Rows grouped into aisle order, ready to render. */
export function groupByAisle(list, rules) {
  const out = [];
  for (const aisle of rules.aisleOrder) {
    const rows = [...list.items.values()]
      .filter((e) => e.aisle === aisle)
      .sort((a, b) => a.item.localeCompare(b.item))
      .map((e) => ({
        key: e.item,
        item: e.item,
        qty: formatQty(e.qty, e.unit, e.item, rules),
        from: [...e.from].join(", "),
      }));
    const vg = list.vague
      .filter((v) => v.aisle === aisle)
      .map((v) => ({ key: v.item + "~", item: v.item, qty: "some", from: v.from }));
    if (rows.length || vg.length) {
      out.push({ aisle, name: rules.aisleNames[aisle], rows: [...rows, ...vg] });
    }
  }
  return out;
}

export { WHOLE };
