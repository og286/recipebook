/* ── DATA ────────────────────────────────────────────────────────
   recipes.json is the single source of truth for this data. Any other
   tool (e.g. the gym tracker at rouston.co.uk/gymtrackers) should fetch
   it directly — same-origin, no scraping needed:
     fetch('https://www.rouston.co.uk/recipebook/recipes.json')
------------------------------------------------------------------ */
let recipes = [];

/* ── PAGE CONFIG ─────────────────────────────────────────────── */
const categories = [
  { id: 'all',       label: 'All',            eyebrow: 'Full collection', title: 'All Recipes',
    desc: 'Click any recipe to see full ingredients and method.' },
  { id: 'breakfast', label: 'Breakfast',      eyebrow: 'Morning meals',   title: 'Breakfasts',
    desc: 'All around 480–500 kcal. Simple, repeatable, and quick to prepare before work.' },
  { id: 'lunch',     label: 'Lunch',          eyebrow: 'Midday meals',    title: 'Lunches',
    desc: 'Rotating across the week. Jon and Jo have different portion sizes — portions are shown separately on each recipe.' },
  { id: 'dinner',    label: 'Dinner',         eyebrow: 'Evening meals',   title: 'Dinners',
    desc: 'Cooked as a full dish and portioned out afterwards — check the tip on each recipe for the gram weight that hits your calorie target.' },
  { id: 'dessert',   label: 'Desserts',       eyebrow: 'Something sweet', title: 'Desserts',
    desc: 'Puddings, cakes and bakes. Calorie-tracked like everything else, so you know what you are spending.' },
  { id: 'sides',     label: 'Sides & Snacks', eyebrow: 'Extras',          title: 'Sides & Snacks',
    desc: 'Dips and extras that aren\'t a meal on their own — shown per 100g so you can portion them against whatever they\'re served with.' },
  { id: 'basics',    label: 'Basics',         eyebrow: 'Building blocks', title: 'Basics',
    desc: 'Doughs, sauces and other components that aren\'t a meal by themselves — combine with toppings or other recipes to build a full dish.' },
];

function recipesFor(catId) {
  return catId === 'all' ? recipes : recipes.filter(r => r.category === catId);
}

/* ── SEARCH ──────────────────────────────────────────────────── */
let query = '';

/** Everything worth matching on, lowercased once per recipe. */
function haystack(r) {
  if (!r._hay) {
    r._hay = [
      r.title, r.desc, r.subtitle, r.category,
      r.plan && r.plan.carb, r.plan && r.plan.protein, r.plan && r.plan.cuisine,
      ...(r.ingredients || []).map(i => i.name),
      ...(r.badgeLabels || []),
    ].filter(Boolean).join(' ').toLowerCase();
  }
  return r._hay;
}

/** Every word must appear somewhere, so "chicken rice" narrows rather than widens. */
function searchRecipes(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return recipes.filter(r => {
    const hay = haystack(r);
    return words.every(w => hay.includes(w));
  });
}

function renderSearch() {
  const pages = document.getElementById('pages');
  const results = searchRecipes(query);
  document.querySelector('.tabs-wrap').style.display = 'none';
  pages.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <div class="page-eyebrow">Search</div>
        <div class="page-title">${results.length} result${results.length === 1 ? '' : 's'} for &ldquo;${escapeHTML(query)}&rdquo;</div>
      </div>
      ${results.length
        ? `<div class="recipe-grid">${results.map(cardHTML).join('')}</div>`
        : `<div class="no-results">Nothing matched. Try a single ingredient, like <em>chicken</em> or <em>lentils</em>.</div>`}
    </div>`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

function applySearch(value) {
  query = value.trim();
  document.getElementById('search-clear').hidden = !query;
  if (query) {
    renderSearch();
  } else {
    document.querySelector('.tabs-wrap').style.display = '';
    renderPages();
    const active = document.querySelector('.tab-btn.active');
    const cat = active ? active.dataset.cat : 'all';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${cat}`);
    if (page) page.classList.add('active');
  }
}

/* ── CARD RENDER ─────────────────────────────────────────────── */
function kcalPillsHTML(r) {
  const v = r.kcal && (r.kcal.both || r.kcal.jon);
  return v ? `<span class="kcal-pill both">${v}</span>` : '';
}

function badgesHTML(r) {
  if (!r.badges || !r.badges.length) return '';
  return `<div class="card-badges">${r.badges.map((b,i) =>
    `<span class="badge ${b}">${r.badgeLabels[i]}</span>`).join('')}</div>`;
}

function cardHTML(r) {
  return `
    <div class="recipe-card" data-id="${r.id}">
      <div class="card-colour" style="background:${r.colour}"></div>
      <div class="card-body">
        <div class="card-category">${r.subtitle}</div>
        ${badgesHTML(r)}
        <div class="card-title">${r.title}</div>
        <div class="card-desc">${r.desc}</div>
        <div class="card-footer">
          <div class="kcal-pills">${kcalPillsHTML(r)}</div>
          <div class="card-arrow">→</div>
        </div>
      </div>
    </div>`;
}

/* ── DRAWER RENDER ───────────────────────────────────────────── */
function drawerKcalHTML(r) {
  const v = r.kcal && (r.kcal.both || r.kcal.jon);
  if (!v) return '';
  const label = r.serves ? `Serves ${r.serves}` : 'Per portion';
  return `<div class="drawer-kcal-block dkb-both"><span class="dkb-name">${label}</span><span class="dkb-val">${v}</span></div>`;
}

function ingredientsTableHTML(r) {
  const rows = r.ingredients.map(i => `
    <tr>
      <td class="td-name">${i.name}</td>
      <td class="td-note">${i.note || ''}</td>
      <td class="td-jon">${i.qty || i.jon || ''}</td>
    </tr>`).join('');
  return `
    <table class="ing-table">
      <thead><tr>
        <td>Ingredient</td><td>Note</td><td>Qty</td>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function stepsHTML(r) {
  return `<ol class="steps">${r.steps.map((s,i) =>
    `<li><span class="step-num">${i+1}</span><span>${s}</span></li>`).join('')}</ol>`;
}

function drawerHeadingHTML(r) {
  return `
    <div class="drawer-eyebrow">${r.subtitle}</div>
    <div class="drawer-title">${r.title}</div>`;
}

/**
 * How to serve a 500 kcal portion. Three shapes of dish need three different
 * instructions: a starch cooked alongside a main needs a weight for each part,
 * a homogeneous dish needs one weight, and a burger needs a count.
 */
function portionHTML(r) {
  const whole = r.totalKcal
    ? `Whole dish is about ${r.totalKcal.toLocaleString()} kcal.` : '';

  if (r.plate500 && r.plate500.parts && r.plate500.parts.length) {
    const parts = r.plate500.parts
      .map(p => `<strong>${p.g}g</strong> ${p.label} <span style="color:var(--mid)">(${p.kcal} kcal)</span>`)
      .join(' &nbsp;+&nbsp; ');
    return `<div class="portion-box"><div class="pb-title">A 500 kcal plate</div>${parts}
      <div class="pb-sub">${whole}</div></div>`;
  }
  if (r.serveBy === 'weight' && r.gramsPer500kcal) {
    return `<div class="portion-box"><div class="pb-title">500 kcal portion</div>
      <strong>${r.gramsPer500kcal}g</strong>${r.kcalPer100g ? ` &middot; about ${r.kcalPer100g} kcal per 100g` : ''}
      <div class="pb-sub">${whole}</div></div>`;
  }
  if (r.portionLabel) {
    return `<div class="portion-box"><div class="pb-title">500 kcal portion</div>
      Roughly <strong>${r.portionLabel}</strong>
      <div class="pb-sub">Served by the piece, so there is no useful weight. ${whole}</div></div>`;
  }
  return '';
}

function drawerContentHTML(r) {
  return `
    <div class="drawer-desc">${r.desc}</div>
    <div class="drawer-kcal">${drawerKcalHTML(r)}</div>
    ${portionHTML(r)}
    <div class="drawer-section-title">Ingredients</div>
    ${ingredientsTableHTML(r)}
    <div class="drawer-section-title">Method</div>
    ${stepsHTML(r)}
    ${r.dressing ? `<div class="dressing-box"><strong>${r.dressingLabel || 'Dressing'}</strong>${r.dressing}</div>` : ''}
    ${r.tip ? `<div class="tip-box">${r.tip}</div>` : ''}
  `;
}

/* ── MAIN RENDER ─────────────────────────────────────────────── */
function renderTabs() {
  const wrap = document.getElementById('tabs');
  wrap.innerHTML = categories.map((c,i) => `
    <button class="tab-btn ${i===0 ? 'active' : ''}" data-cat="${c.id}">
      ${c.label} <span class="tab-count">${recipesFor(c.id).length}</span>
    </button>`).join('');
}

function renderPages() {
  const wrap = document.getElementById('pages');
  wrap.innerHTML = categories.map((c,i) => `
    <div class="page ${i===0 ? 'active' : ''}" id="page-${c.id}">
      <div class="page-header">
        <div class="page-eyebrow">${c.eyebrow}</div>
        <div class="page-title">${c.title}</div>
        <div class="page-desc">${c.desc}</div>
      </div>
      <div class="recipe-grid">
        ${recipesFor(c.id).map(cardHTML).join('')}
      </div>
    </div>`).join('');
}

function openDrawer(id) {
  const r = recipes.find(x => x.id === id);
  if (!r) return;
  document.getElementById('drawer-heading').innerHTML = drawerHeadingHTML(r);
  document.getElementById('drawer-body').innerHTML = drawerContentHTML(r);
  document.querySelector('.overlay').classList.add('open');
  document.querySelector('.drawer').classList.add('open');
}

function closeDrawer() {
  document.querySelector('.overlay').classList.remove('open');
  document.querySelector('.drawer').classList.remove('open');
}

function attachEvents() {
  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${btn.dataset.cat}`).classList.add('active');
  });

  document.getElementById('pages').addEventListener('click', e => {
    const card = e.target.closest('.recipe-card');
    if (!card) return;
    openDrawer(card.dataset.id);
  });

  const search = document.getElementById('search');
  search.addEventListener('input', () => applySearch(search.value));
  document.getElementById('search-clear').addEventListener('click', () => {
    search.value = '';
    applySearch('');
    search.focus();
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { search.value = ''; applySearch(''); }
  });

  document.querySelector('.drawer-close').addEventListener('click', closeDrawer);
  document.querySelector('.overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
}

async function init() {
  const res = await fetch('./recipes.json');
  recipes = await res.json();
  document.getElementById('recipe-count').textContent = `${recipes.length} recipes`;
  renderTabs();
  renderPages();
  attachEvents();
}

document.addEventListener('DOMContentLoaded', init);
