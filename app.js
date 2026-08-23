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
    desc: 'Click any recipe to see full ingredients and method. Blue figures are Jon\'s portions, pink are Jo\'s.' },
  { id: 'breakfast', label: 'Breakfast',      eyebrow: 'Morning meals',   title: 'Breakfasts',
    desc: 'All around 480–500 kcal. Simple, repeatable, and quick to prepare before work.' },
  { id: 'lunch',     label: 'Lunch',          eyebrow: 'Midday meals',    title: 'Lunches',
    desc: 'Rotating across the week. Jon and Jo have different portion sizes — portions are shown separately on each recipe.' },
  { id: 'dinner',    label: 'Dinner',         eyebrow: 'Evening meals',   title: 'Dinners',
    desc: 'Cooked as a full dish and portioned out afterwards — check the tip on each recipe for the gram weight that hits your calorie target.' },
  { id: 'smoothie',  label: 'Smoothie',       eyebrow: 'Daily drink',     title: 'Smoothie',
    desc: 'Your everyday breakfast. 2/3 of the original recipe — same for both Jon and Jo.' },
  { id: 'treat',     label: 'Weekend Treat',  eyebrow: 'Weekend treat',   title: 'Weekend Treat',
    desc: 'For when you want something more indulgent. Still calorie-tracked so you know where you stand.' },
  { id: 'sides',     label: 'Sides & Snacks', eyebrow: 'Extras',          title: 'Sides & Snacks',
    desc: 'Dips and extras that aren\'t a meal on their own — shown per 100g so you can portion them against whatever they\'re served with.' },
  { id: 'basics',    label: 'Basics',         eyebrow: 'Building blocks', title: 'Basics',
    desc: 'Doughs, sauces and other components that aren\'t a meal by themselves — combine with toppings or other recipes to build a full dish.' },
  { id: 'baking',    label: 'Baking',         eyebrow: 'Cakes & bakes',   title: 'Baking',
    desc: 'Cakes, pastries and baked treats — occasional bakes rather than everyday eating, but calorie-tracked all the same.' },
];

function recipesFor(catId) {
  return catId === 'all' ? recipes : recipes.filter(r => r.category === catId);
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

function drawerContentHTML(r) {
  return `
    <div class="drawer-desc">${r.desc}</div>
    <div class="drawer-kcal">${drawerKcalHTML(r)}</div>
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
