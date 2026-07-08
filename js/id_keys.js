// id_keys.js — C&P Dichotomous Key feature scoring for Jamides ID

const ks = {
  couplets: null,      // array from id_key.json
  speciesInfo: null,   // Map<name, {common_name, inat_url}>
  answers: new Map(),  // Map<couplet_id, 'A' | 'B' | 'skip'>
  scores: [],
  showAll: false,
  expandedName: null,
};

const ANSWERS_KEY = 'jamides-ks-answers';

function ksSaveAnswers() {
  try { localStorage.setItem(ANSWERS_KEY, JSON.stringify([...ks.answers])); } catch (e) {}
}

function ksLoadAnswers() {
  try {
    const raw = localStorage.getItem(ANSWERS_KEY);
    if (!raw) return new Map();
    const pairs = JSON.parse(raw);
    if (!Array.isArray(pairs)) return new Map();
    const valid = new Set((ks.couplets || []).map(c => c.id));
    return new Map(pairs.filter(([id, v]) => valid.has(id) && ['A', 'B', 'skip'].includes(v)));
  } catch (e) { return new Map(); }
}

function ksClearAnswers() {
  try { localStorage.removeItem(ANSWERS_KEY); } catch (e) {}
}

// ── Data init ────────────────────────────────────────────────────────────────

function ksInitData(keyData, speciesData) {
  ks.couplets = keyData.couplets;

  const sp2Map = new Map();
  for (const s of speciesData.species)
    sp2Map.set(s.name.split(' ').slice(0, 2).join(' '), s);

  // Build full-name → species-info map (keyed by full subspecific name)
  ks.speciesInfo = new Map();
  const allNames = new Set();
  for (const cp of ks.couplets) {
    for (const n of cp.species_a) allNames.add(n);
    for (const n of cp.species_b) allNames.add(n);
  }
  for (const name of allNames) {
    const sp2 = name.split(' ').slice(0, 2).join(' ');
    const sp = sp2Map.get(sp2);
    ks.speciesInfo.set(name, {
      common_name: sp ? (sp.common_name || '') : '',
      inat_url: sp ? sp.inat_url : `https://www.inaturalist.org/search?q=${encodeURIComponent(sp2)}`,
    });
  }
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function ksScoreAll() {
  if (!ks.couplets) { ks.scores = []; return; }

  // Collect all species across all couplets
  const allNames = new Set();
  for (const cp of ks.couplets) {
    for (const n of cp.species_a) allNames.add(n);
    for (const n of cp.species_b) allNames.add(n);
  }

  // Non-skip answered couplets only
  const answered = [...ks.answers.entries()].filter(([, v]) => v !== 'skip');

  ks.scores = [...allNames].map(name => {
    let score = 0, max = 0;
    for (const [id, ans] of answered) {
      const cp = ks.couplets.find(c => c.id === id);
      if (!cp) continue;
      const inA = cp.species_a.includes(name);
      const inB = cp.species_b.includes(name);
      if (!inA && !inB) continue; // species not in this couplet — neutral
      max++;
      if (inA && ans === 'A') score++;
      else if (inA && ans === 'B') score--;
      else if (inB && ans === 'B') score++;
      else if (inB && ans === 'A') score--;
    }
    return { name, score, max };
  }).sort((a, b) => {
    const pA = a.max > 0 ? a.score / a.max : 0;
    const pB = b.max > 0 ? b.score / b.max : 0;
    return pB - pA || a.name.localeCompare(b.name);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ksEsc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ksEscAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Apply guide link to a phrase within text; returns safe HTML
function ksLinkify(text, phrase, url) {
  if (!phrase || !url || !text) return ksEsc(text);
  const idx = text.indexOf(phrase);
  if (idx === -1) return ksEsc(text);
  return ksEsc(text.slice(0, idx))
    + `<a href="${ksEscAttr(url)}" class="ks-guide-link" target="_blank" rel="noopener">${ksEsc(phrase)}</a>`
    + ksEsc(text.slice(idx + phrase.length));
}

function ksRenderText(text, phrase, url) {
  return phrase ? ksLinkify(text, phrase, url) : ksEsc(text);
}

// ── Render ───────────────────────────────────────────────────────────────────

function ksRenderCandidates() {
  const listEl = document.getElementById('ks-candidates');

  const nonSkip = [...ks.answers.values()].filter(v => v !== 'skip').length;
  if (nonSkip === 0) {
    listEl.innerHTML = '<p class="ks-empty">Answer couplet questions below to rank candidates.</p>';
    return;
  }

  const top = ks.scores.slice(0, 8);
  const medals = ['🥇', '🥈', '🥉'];

  listEl.innerHTML = top.map((s, i) => {
    const info = ks.speciesInfo.get(s.name) || {};
    const barW = s.max > 0 ? Math.round(Math.max(0, s.score) / s.max * 100) : 0;
    const isExpanded = ks.expandedName === s.name;
    const inatHref = info.inat_url ? ksEscAttr(info.inat_url) : '';
    return `
      <div class="ks-cand${isExpanded ? ' expanded' : ''}" data-name="${ksEscAttr(s.name)}">
        <div class="ks-cand-row" role="button" tabindex="0" aria-expanded="${isExpanded}">
          <span class="ks-rank">${medals[i] || i + 1}</span>
          <span class="ks-cname">
            <em class="ks-sci">${ksEsc(s.name)}</em>
            ${info.common_name ? `<span class="ks-common">${ksEsc(info.common_name)}</span>` : ''}
          </span>
          <span class="ks-bar-wrap">
            <span class="ks-bar-bg">
              <span class="ks-bar${s.score < 0 ? ' neg' : ''}" style="width:${barW}%"></span>
            </span>
            <span class="ks-score-num${s.score < 0 ? ' neg' : ''}">${s.score > 0 ? '+' : ''}${s.score}</span>
          </span>
          ${inatHref ? `<a class="ks-inat-icon" href="${inatHref}" target="_blank" rel="noopener" title="View on iNaturalist" aria-label="View ${ksEscAttr(s.name)} on iNaturalist">🔗</a>` : ''}
        </div>
        ${isExpanded ? `<div class="ks-cand-detail">
          <a class="ks-inat-link" href="${inatHref}" target="_blank" rel="noopener">View on iNaturalist →</a>
        </div>` : ''}
      </div>`;
  }).join('');

  if (ks.expandedName && !top.some(s => s.name === ks.expandedName))
    ks.expandedName = null;
}

function ksRenderCouplets() {
  const el = document.getElementById('ks-couplets');
  if (!ks.couplets) return;

  const answeredCount = [...ks.answers.values()].filter(v => v !== 'skip').length;
  const unanswered = ks.couplets.filter(cp => !ks.answers.has(cp.id));

  const visible = ks.couplets.filter(cp => {
    if (ks.answers.has(cp.id)) return true;
    if (ks.showAll) return true;
    // Show first 10 unanswered
    return unanswered.indexOf(cp) < 10;
  });

  el.innerHTML = visible.map((cp, idx) => {
    const ans = ks.answers.get(cp.id) || null;

    const hintHTML = cp.hint
      ? `<details class="ks-hint">
           <summary>Hint</summary>
           <p>${ksEsc(cp.hint)}</p>
         </details>`
      : '';

    const aBtnCls = `ks-btn ks-btn-a${ans === 'A' ? ' sel' : ''}`;
    const bBtnCls = `ks-btn ks-btn-b${ans === 'B' ? ' sel' : ''}`;
    const skipBtnCls = `ks-btn ks-btn-skip${ans === 'skip' ? ' sel' : ''}`;

    const aHTML = ksRenderText(cp.a_text, cp.guide_phrase, cp.guide_link);
    const bHTML = ksRenderText(cp.b_text, cp.guide_phrase, cp.guide_link);

    const skipBtn = cp.upperside
      ? `<button class="${skipBtnCls}" data-id="${ksEscAttr(cp.id)}" data-v="skip">Skip — upperside feature</button>`
      : '';

    return `
      <div class="ks-cp${ans && ans !== 'skip' ? ' answered' : ''}${ans === 'skip' ? ' skipped' : ''}" id="ks-cp-${ksEscAttr(cp.id)}">
        <p class="ks-cp-label"><span class="ks-label-tag">${ksEsc(cp.label)}</span> ${ksEsc(cp.question)}</p>
        ${hintHTML}
        <div class="ks-btn-row">
          <button class="${aBtnCls}" data-id="${ksEscAttr(cp.id)}" data-v="A">
            <span class="ks-btn-side">A</span><span class="ks-btn-text">${aHTML}</span>
          </button>
          <button class="${bBtnCls}" data-id="${ksEscAttr(cp.id)}" data-v="B">
            <span class="ks-btn-side">B</span><span class="ks-btn-text">${bHTML}</span>
          </button>
          ${skipBtn}
        </div>
      </div>`;
  }).join('');

  if (unanswered.length > 10) {
    el.insertAdjacentHTML('beforeend', `
      <button class="ks-more" id="ks-show-more">
        ${ks.showAll ? '▲ Show fewer' : `▼ Show all ${unanswered.length} couplets`}
      </button>`);
  }
}

function ksRender() {
  ksScoreAll();
  ksRenderCandidates();
  ksRenderCouplets();

  const badge = document.getElementById('ks-answered-count');
  const n = [...ks.answers.values()].filter(v => v !== 'skip').length;
  if (badge) badge.textContent = n > 0 ? `${n} answered` : '';
}

// ── Event handlers ────────────────────────────────────────────────────────────

function ksOnCoupletClick(e) {
  if (e.target.id === 'ks-show-more' || e.target.closest('#ks-show-more')) {
    ks.showAll = !ks.showAll;
    ksRenderCouplets();
    return;
  }
  if (e.target.closest('.ks-guide-link')) return;

  const btn = e.target.closest('.ks-btn');
  if (!btn || !btn.dataset.id) return;
  const id = btn.dataset.id;
  const v = btn.dataset.v;
  if (ks.answers.get(id) === v) {
    ks.answers.delete(id);
  } else {
    ks.answers.set(id, v);
  }
  ksSaveAnswers();
  ksRender();
}

function ksOnCandidateClick(e) {
  if (e.target.closest('.ks-inat-icon')) return;
  const row = e.target.closest('.ks-cand-row');
  if (!row) return;
  const cand = row.closest('.ks-cand');
  if (!cand) return;
  const name = cand.dataset.name;
  ks.expandedName = ks.expandedName === name ? null : name;
  ksRenderCandidates();
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function ksInit() {
  try {
    const [keyData, speciesData] = await Promise.all([
      fetch('data/id_key.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('id_key.json'); return r.json(); }),
      fetch('data/species.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('species.json'); return r.json(); }),
    ]);

    ksInitData(keyData, speciesData);
    ks.answers = ksLoadAnswers();
    ksRender();

    document.getElementById('loading').style.display = 'none';
    document.getElementById('ks-app').style.display = 'block';

    document.getElementById('ks-couplets').addEventListener('click', ksOnCoupletClick);
    document.getElementById('ks-candidates').addEventListener('click', ksOnCandidateClick);
    document.getElementById('ks-candidates').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') ksOnCandidateClick(e);
    });
    document.getElementById('ks-reset').addEventListener('click', () => {
      ks.answers.clear();
      ks.showAll = false;
      ks.expandedName = null;
      ksClearAnswers();
      ksRender();
    });
  } catch (err) {
    document.getElementById('loading').innerHTML =
      `<p style="padding:2rem;color:#c0392b">Could not load data: ${ksEsc(err.message)}</p>`;
  }
}

ksInit();
