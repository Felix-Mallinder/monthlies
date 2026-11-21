/* Monthlies — two pages: Plan (income + budgets) and Actual (statements vs plan).
   Categories are the person's own: 8 to start with, all renamable, removable, and new ones can be added.
   Everything stays in this browser's storage on this device. */
(function () {
  'use strict';
  const E = window.Engine;
  const STORE_KEY = 'monthlies.v1';

  // ---------- helpers ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  const f2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = n => f0.format(Math.round(Math.abs(n)) || 0);
  const signed = n => (Math.round(n) < 0 ? '−' : '') + money(n);
  const money2 = n => f2.format(Math.abs(n));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pretty = s => { const d = E.toDate(s); return d.getUTCDate() + ' ' + MON3[d.getUTCMonth()]; };
  const prettyDay = s => { const d = E.toDate(s); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON3[d.getUTCMonth()]; };
  const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
  const DEFAULT_CATS = E.CATS.filter(c => !E.NOT_SPEND.has(c.id)).map(c => ({ id: c.id, name: c.name }));
  const NOT_SPEND = [{ id: 'transfer', name: 'Between my accounts' }, { id: 'income', name: 'Money in' }];
  // Card and loan costs swing month to month, so being a bit over isn't flagged
  const TOLERANCE = { debt: 0.5 };

  // ---------- state ----------
  const fresh = () => ({ v: 3, files: [], txns: [], rules: {}, overrides: {}, aims: {}, plan: { income: null }, cats: DEFAULT_CATS.map(c => ({ ...c })) });
  let S = load();
  let D = null;
  const ui = { tab: 'plan', period: 'avg', editing: false };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = Object.assign(fresh(), JSON.parse(raw));
        s.plan = Object.assign({ income: null }, s.plan);
        if (!s.cats || s.v < 3) { s.cats = DEFAULT_CATS.map(c => ({ ...c })); s.aims = {}; s.v = 3; }
        return s;
      }
    } catch (e) { /* storage unavailable */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('Couldn’t save on this device.'); } }
  function recompute() { D = S.txns.length ? E.derive(S.files, S.txns, S.rules, S.overrides) : null; }

  const catIds = () => new Set(S.cats.map(c => c.id));
  const catName = id => (S.cats.find(c => c.id === id) || NOT_SPEND.find(c => c.id === id) || { name: 'Other' }).name;
  // A payment whose category was removed shows under "Other" (or the last category if Other was removed too)
  function shown(t) {
    if (t.cat === 'transfer' || t.cat === 'income') return t.cat;
    const ids = catIds();
    return ids.has(t.cat) ? t.cat : ids.has('other') ? 'other' : S.cats[S.cats.length - 1].id;
  }

  // ---------- numbers ----------
  function periodTxns(p) { return p === 'avg' ? D.T : D.T.filter(t => t.d.startsWith(p)); }
  function aggregate(p) {
    const list = periodTxns(p), div = p === 'avg' ? D.months : 1;
    const byCat = {}; let income = 0;
    list.forEach(t => {
      const c = shown(t);
      if (c === 'transfer') return;
      if (c === 'income') { income -= t.out; return; }
      byCat[c] = (byCat[c] || 0) + t.out;
    });
    Object.keys(byCat).forEach(k => { byCat[k] /= div; });
    return { byCat, income: income / div, spend: sum(Object.values(byCat)), list, div };
  }
  function monthsList() {
    const set = new Set(D.T.filter(t => t.cat !== 'transfer').map(t => t.d.slice(0, 7)));
    return [...set].sort().map(ym => {
      const start = ym + '-01', end = E.addDays(E.addDays(start, 32).slice(0, 7) + '-01', -1);
      return { ym, partial: E.daysBetween(D.first, start) < -3 || E.daysBetween(end, D.last) < -3 };
    });
  }
  const budget = c => (S.aims[c] > 0 ? S.aims[c] : 0);
  const budgetTotal = () => sum(S.cats.map(c => budget(c.id)));
  const income = () => (S.plan.income != null ? S.plan.income : (D ? Math.round(aggregate('avg').income) : 0));
  const uncertain = () => D.T.filter(t => t.conf !== 'user' && t.cat !== 'transfer' && t.cat !== 'income' && (t.conf === 'none' || (t.conf === 'guess' && (t.fine === 'people' || t.fine === 'bills'))));

  // ---------- render ----------
  const view = $('#view'), title = $('#title'), tabs = $('#tabs');
  function render() {
    tabs.hidden = false;
    tabs.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
    title.textContent = ui.tab === 'plan' ? 'Plan' : 'Actual';
    view.innerHTML = ui.tab === 'plan' ? renderPlan() : renderActual();
  }
  function go(tab) { ui.tab = tab; ui.editing = false; render(); window.scrollTo(0, 0); }

  // ---------- Plan ----------
  function renderPlan() {
    const avg = D ? aggregate('avg').byCat : {};
    let h = `<section class="card plan-top">
      <div class="plan-line"><label for="income">Income each month</label><span class="money-input big-input">£<input id="income" type="number" inputmode="decimal" min="0" value="${S.plan.income != null ? S.plan.income : ''}" placeholder="${D ? Math.round(aggregate('avg').income) : '0'}" data-action="income"></span></div>
      <div class="plan-totals" id="planTotals">${planTotals()}</div>
    </section>
    <section class="plan-group"><div class="plan-head"><h3>Budgets</h3><button class="btn quiet" data-action="toggleEdit">${ui.editing ? 'Done' : 'Edit categories'}</button></div>`;
    S.cats.forEach(c => {
      const typical = avg[c.id] ? Math.round(avg[c.id]) : '';
      if (ui.editing) {
        h += `<div class="plan-row"><input class="name-input" value="${esc(c.name)}" data-action="rename" data-cat="${c.id}" aria-label="Category name">
          <button class="icon-btn" data-action="removeCat" data-cat="${c.id}" aria-label="Remove ${esc(c.name)}">×</button></div>`;
      } else {
        h += `<div class="plan-row"><label for="b-${c.id}">${esc(c.name)}</label>
          <span class="money-input">£<input id="b-${c.id}" type="number" inputmode="decimal" min="0" value="${S.aims[c.id] > 0 ? S.aims[c.id] : ''}" placeholder="${typical}" data-action="aim" data-cat="${c.id}"></span></div>`;
      }
    });
    if (ui.editing) h += `<p style="margin-top:12px"><button class="btn block" data-action="addCat">Add a category</button></p>
      <p class="tiny">Removing a category moves its payments to Other. <button class="link" data-action="resetCats">Go back to the original 8</button></p>`;
    h += '</section>';
    if (D && !ui.editing) h += `<p class="tiny">Grey numbers are what you usually spend.</p>`;
    return h;
  }
  function planTotals() {
    const inc = income(), b = budgetTotal(), left = inc - b;
    return `<div><span>Budgeted</span><b>${money(b)}</b></div><div><span>Left over</span><b class="${left < 0 ? 'warm' : ''}">${signed(left)}</b></div>`;
  }

  // ---------- Actual ----------
  function renderActual() {
    if (!D) return `<section class="empty">
        <button class="btn primary block" data-action="addFiles">Add statements</button>
        <p class="tiny" style="margin-top:12px">CSV or PDF statements from your bank or cards. They stay on this phone.</p>
        <p><button class="link" data-action="sample">Try with example statements</button></p>
      </section>${manage()}`;
    if (ui.period !== 'avg' && !monthsList().some(m => m.ym === ui.period)) ui.period = 'avg';
    const A = aggregate(ui.period);
    const left = A.income - A.spend;
    const planLeft = income() - budgetTotal();
    let h = `<div class="chips" role="group" aria-label="Period"><button class="chip" data-action="period" data-p="avg" aria-pressed="${ui.period === 'avg'}">Typical month</button>`;
    monthsList().forEach(m => { h += `<button class="chip" data-action="period" data-p="${m.ym}" aria-pressed="${ui.period === m.ym}">${MON3[+m.ym.slice(5) - 1]}${m.partial ? '*' : ''}</button>`; });
    h += `</div>
      <section class="summary">
        <div><span>In</span><b>${money(A.income)}</b></div>
        <div><span>Out</span><b>${money(A.spend)}</b>${budgetTotal() ? `<small>plan ${money(budgetTotal())}</small>` : ''}</div>
        <div><span>Left</span><b class="${left < 0 ? 'warm' : ''}">${signed(left)}</b>${budgetTotal() ? `<small>plan ${signed(planLeft)}</small>` : ''}</div>
      </section>`;
    const lines = insights(A);
    if (lines.length) h += `<section class="insights">${lines.join('')}</section>`;
    const cats = S.cats.filter(c => Math.abs(A.byCat[c.id] || 0) > 0.5 || budget(c.id) > 0)
      .sort((a, b) => over(b.id, A) - over(a.id, A) || (A.byCat[b.id] || 0) - (A.byCat[a.id] || 0));
    h += `<section class="rows">${cats.map(c => actualRow(c, A)).join('')}</section>`;
    const unsure = uncertain().length;
    if (unsure) h += `<p><button class="link" data-action="openUnsure">${plural(unsure, 'payment')} to check</button></p>`;
    h += `<p><button class="link" data-action="openCat" data-cat="transfer">Not counted: moves between my accounts</button></p>`;
    h += manage();
    return h;
  }
  function over(cat, A) { const b = budget(cat); return b ? Math.max(0, (A.byCat[cat] || 0) - b * (1 + (TOLERANCE[cat] || 0))) : 0; }
  function actualRow(c, A) {
    const amt = A.byCat[c.id] || 0, b = budget(c.id);
    const count = A.list.filter(t => shown(t) === c.id).length;
    const scale = Math.max(amt, b, 1);
    const isOver = b && amt > b * (1 + (TOLERANCE[c.id] || 0));
    const fill = !b ? 'var(--ink-3)' : isOver ? 'var(--warm)' : 'var(--accent)';
    const right = b ? `${money(amt)} <span class="of">/ ${money(b)}</span>` : money(amt);
    const note = b ? (isOver ? `<span class="status-above">${money(amt - b)} over</span>` : `<span>${money(Math.max(0, b - amt))} left</span>`) : '<span>no budget</span>';
    return `<button class="cat-row" data-action="openCat" data-cat="${c.id}">
      <div class="cat-top"><span class="cat-name">${esc(c.name)}</span><span class="cat-amt">${right}</span></div>
      <div class="track"><div class="fill" style="width:${Math.max(0, amt) / scale * 100}%;background:${fill}"></div>${b ? `<div class="marker" style="left:${b / scale * 100}%"></div>` : ''}</div>
      <div class="cat-note">${note}<span>${plural(count, 'payment')}</span></div></button>`;
  }

  // Short, factual observations — habits and totals that are easy to miss
  function insights(A) {
    const out = [];
    const cafe = A.list.filter(t => t.fine === 'cafe' && t.out > 0 && shown(t) === t.cat);
    if (cafe.length >= 6) {
      const weeks = Math.max(1, (A.div * 30.44) / 7);
      const days = new Set(cafe.map(t => t.d)).size;
      out.push(line(`Coffee and lunch out about <b>${Math.max(1, Math.round(days / weeks))} days a week</b>, usually ${money2(E.median(cafe.map(t => t.out)))}. Around <b>${money(sum(cafe.map(t => t.out)) / A.div)}</b> a month.`, shown(cafe[0])));
    }
    const take = A.list.filter(t => t.fine === 'takeaway' && t.out > 0 && shown(t) === t.cat);
    if (take.length >= 4) out.push(line(`Takeaways: <b>${Math.round(take.length / A.div)} a month</b>, around <b>${money(sum(take.map(t => t.out)) / A.div)}</b>.`, shown(take[0])));
    const subs = D.regs.filter(r => r.fine === 'subs');
    if (subs.length >= 2) { const m = sum(subs.map(r => r.monthly)); out.push(line(`${subs.length} subscriptions: <b>${money(m)}</b> a month, <b>${money(m * 12)}</b> a year.`, catIds().has('subs') ? 'subs' : 'other')); }
    return out.slice(0, 3);
  }
  const line = (html, cat) => `<button class="insight" data-action="openCat" data-cat="${cat}">${html}</button>`;

  function manage() {
    const byFile = {};
    S.txns.forEach(t => { (byFile[t.f] = byFile[t.f] || []).push(t.d); });
    return `<details class="manage"><summary>Statements${S.files.length ? ` (${S.files.length})` : ''}</summary><div class="body">
      ${S.files.length ? `<div class="list">${S.files.map(f => { const ds = (byFile[f.id] || []).sort(); return `<div class="item"><div class="main"><div class="title">${esc(f.label)}</div><div class="sub">${ds.length} payments · ${ds.length ? pretty(ds[0]) + '–' + pretty(ds[ds.length - 1]) : ''}</div></div><button class="btn quiet" data-action="editFile" data-id="${f.id}">Edit</button></div>`; }).join('')}</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn" data-action="addFiles">Add more</button><button class="btn" data-action="allPayments">All payments</button></div>` : ''}
      <div class="btn-row" style="margin-top:12px"><button class="btn" data-action="backup">Save a backup</button><button class="btn" data-action="restore">Restore</button></div>
      <p style="margin-top:12px"><button class="btn quiet danger" data-action="wipe">Remove everything from this phone</button></p>
      <p class="tiny">Everything stays on this phone. Nothing is uploaded.</p>
    </div></details>`;
  }

  // ---------- sheets ----------
  const sheet = $('#sheet');
  let sheetBack = null;
  function openSheet(html, back) {
    sheetBack = back || null;
    sheet.innerHTML = `<div class="sheet-backdrop" data-action="closeSheet"></div><div class="sheet-panel" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
    sheet.hidden = false; document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
  }
  function closeSheet() {
    sheet.classList.remove('open'); document.body.style.overflow = '';
    setTimeout(() => { if (!sheet.classList.contains('open')) { sheet.hidden = true; sheet.innerHTML = ''; } }, 250);
  }
  function replaceSheet(html) { const p = $('.sheet-panel', sheet); if (p) { p.innerHTML = '<div class="grabber"></div>' + html; p.scrollTop = 0; } else openSheet(html); }

  function txnRow(t, showCat) {
    return `<button class="item" data-action="pick" data-id="${t.id}">
      <div class="main"><div class="title">${esc(t.merch || t.desc)}</div><div class="sub">${prettyDay(t.d)}${showCat ? ' · ' + esc(catName(shown(t))) : ''}</div></div>
      <div class="amt ${t.out < 0 ? 'neg' : ''}">${t.out < 0 ? '+' : ''}${money2(t.out)}</div></button>`;
  }
  const head = (t, sub) => `<div class="sheet-head"><div><h2>${esc(t)}</h2>${sub ? `<div class="muted small">${sub}</div>` : ''}</div><button class="btn quiet" data-action="closeSheet">Done</button></div>`;

  function catSheet(catId) {
    const list = periodTxns(ui.period).filter(t => shown(t) === catId);
    const total = sum(list.map(t => t.out)) / (ui.period === 'avg' ? D.months : 1);
    openSheet(`${head(catName(catId), `${money(total)} ${ui.period === 'avg' ? 'a month' : 'in ' + MONTHS[+ui.period.slice(5) - 1]}`)}
      <p class="tiny">Tap one to move it.</p><div class="list">${list.map(t => txnRow(t, false)).join('') || '<div class="item">Nothing here.</div>'}</div>`, () => catSheet(catId));
  }

  function pickSheet(id) {
    const t = D.T.find(x => x.id === id); if (!t) return;
    const cur = shown(t);
    const pill = c => `<button class="pill ${c.id === cur ? 'on' : ''}" data-action="setCat" data-id="${t.id}" data-cat="${c.id}">${esc(c.name)}</button>`;
    replaceSheet(`<div class="sheet-head"><div><h2>${esc(t.merch || t.desc)}</h2><div class="muted small">${money2(t.out)} · ${prettyDay(t.d)}</div></div><button class="btn quiet" data-action="back">Back</button></div>
      <p class="tiny">${esc(t.desc)}</p>
      <div class="pills">${S.cats.map(pill).join('')}<button class="pill new" data-action="newCatFor" data-id="${t.id}">+ New category</button></div>
      <h3 style="margin-top:14px">Not counted</h3><div class="pills">${NOT_SPEND.map(pill).join('')}</div>`);
  }

  function setCategory(id, cat) {
    const t = D.T.find(x => x.id === id); if (!t) return;
    const same = D.T.filter(x => x.key === t.key && x.id !== t.id && shown(x) !== cat);
    if (!same.length) return applyCategory(id, cat, true);
    replaceSheet(`<h2>All from ${esc(t.merch)}?</h2>
      <p class="muted">${plural(same.length, 'other payment')} from here, and future ones too.</p>
      <div class="btn-row" style="flex-direction:column"><button class="btn primary block" data-action="applyCat" data-id="${id}" data-cat="${cat}" data-all="1">Yes, all of them</button>
      <button class="btn block" data-action="applyCat" data-id="${id}" data-cat="${cat}" data-all="0">Just this one</button></div>`);
  }
  function applyCategory(id, cat, all) {
    const t = D.T.find(x => x.id === id); if (!t) return;
    if (all) { S.rules[t.key] = cat; D.T.filter(x => x.key === t.key).forEach(x => { delete S.overrides[x.id]; }); }
    else S.overrides[id] = cat;
    save(); recompute(); render(); toast(`Moved to ${catName(cat)}`);
    if (sheetBack) sheetBack(); else closeSheet();
  }
  function newCategory(name) {
    name = (name || '').trim(); if (!name) return null;
    const id = 'c' + Date.now().toString(36);
    const otherIdx = S.cats.findIndex(c => c.id === 'other');
    S.cats.splice(otherIdx >= 0 ? otherIdx : S.cats.length, 0, { id, name });
    save(); return id;
  }

  function unsureSheet() {
    const list = uncertain();
    openSheet(`${head('To check', plural(list.length, 'payment'))}<div class="list">${list.map(t => txnRow(t, true)).join('') || '<div class="item">All sorted.</div>'}</div>`, unsureSheet);
  }
  function allSheet(q) {
    q = q || ''; const ql = q.toLowerCase();
    const list = D.T.filter(t => !ql || (t.merch || '').toLowerCase().includes(ql) || catName(shown(t)).toLowerCase().includes(ql) || t.desc.toLowerCase().includes(ql));
    const body = `<div class="list" id="allList">${list.slice(0, 250).map(t => txnRow(t, true)).join('')}</div>`;
    if ($('#allList')) { $('#allList').outerHTML = body; return; }
    openSheet(`${head('All payments', plural(D.T.length, 'payment'))}<input class="search" type="search" placeholder="Search" value="${esc(q)}" data-action="search" autocomplete="off">${body}`, () => allSheet($('.search') ? $('.search').value : ''));
  }
  function fileSheet(id) {
    const f = S.files.find(x => x.id === id); if (!f) return;
    openSheet(`${head('Statement')}
      <input class="search" value="${esc(f.label)}" data-action="fname" data-id="${id}" aria-label="Name">
      <div class="pills"><button class="pill ${f.kind === 'current' ? 'on' : ''}" data-action="fkind" data-id="${id}" data-kind="current">Bank account</button><button class="pill ${f.kind === 'credit' ? 'on' : ''}" data-action="fkind" data-id="${id}" data-kind="credit">Credit card</button></div>
      <button class="btn block" data-action="fflip" data-id="${id}">Swap money in and out</button>
      <p style="margin-top:10px"><button class="btn block danger" data-action="fremove" data-id="${id}">Remove</button></p>`);
  }

  // ---------- import ----------
  const fileInput = $('#fileInput'), backupInput = $('#backupInput');
  async function handleFiles(files) {
    const results = [];
    for (const file of files) {
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        try {
          const r = window.PdfReader ? await window.PdfReader.read(file) : { error: 'pdf' };
          if (r.error) results.push({ name: file.name, error: 'pdf' });
          else results.push(Object.assign({ name: r.name, text: r.text, holder: r.holder }, E.readFile(r.name, r.text)));
        } catch (e) { results.push({ name: file.name, error: 'pdf' }); }
        continue;
      }
      const text = await file.text();
      results.push(Object.assign({ name: file.name, text }, E.readFile(file.name, text)));
    }
    processResults(results, 0, { added: 0, dupes: 0, problems: [] });
  }
  function processResults(results, i, tally) {
    if (i >= results.length) return finishImport(tally);
    const r = results[i];
    const next = () => processResults(results, i + 1, tally);
    if (r.error === 'columns' || r.error === 'norows') return mapSheet(r, map => { const again = E.readFile(r.name, r.text, map); if (again.error) tally.problems.push(r.name); else addParsed(again, tally); next(); }, () => { tally.problems.push(r.name); next(); });
    if (r.error) { tally.problems.push(r.name + (r.error === 'pdf' ? ' (couldn’t find a table of payments in this PDF)' : '')); return next(); }
    addParsed(r, tally, r.holder); next();
  }
  function addParsed(parsed, tally, holder) {
    const existing = {};
    S.txns.forEach(t => { const b = `${t.d}|${t.o.toFixed(2)}|${t.desc}`; existing[b] = (existing[b] || 0) + 1; });
    const fileId = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const counts = {}, added = [];
    parsed.txns.forEach(t => {
      counts[t.base] = (counts[t.base] || 0) + 1;
      if (counts[t.base] > (existing[t.base] || 0)) {
        const o = Object.assign({}, t, { f: fileId }); delete o.base;
        if (S.txns.some(x => x.id === o.id)) o.id += fileId.slice(-4);
        added.push(o);
      }
    });
    tally.dupes += parsed.txns.length - added.length;
    if (!added.length) return;
    S.files.push({ id: fileId, label: parsed.meta.label, kind: parsed.meta.kind, flip: false, acctName: parsed.meta.acctName, holder: holder || '' });
    S.txns.push(...added); tally.added += added.length;
  }
  function finishImport(tally) {
    save(); recompute(); ui.tab = 'actual'; ui.period = 'avg'; render(); window.scrollTo(0, 0);
    if (tally.problems.length) openSheet(`<h2>Couldn’t read</h2><p class="muted">${esc(tally.problems.join(', '))}</p><button class="btn primary block" data-action="closeSheet">OK</button>`);
    else toast(tally.added ? `${plural(tally.added, 'payment')} added` : 'Nothing new — already added');
  }
  function mapSheet(r, onDone, onSkip) {
    const rows = E.parseCSV(r.text).slice(0, 6), width = Math.max(...rows.map(x => x.length));
    const opts = sel => `<option value="-1">—</option>` + Array.from({ length: width }, (_, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${i + 1}: ${esc((rows[0][i] || '').slice(0, 24))}</option>`).join('');
    openSheet(`<h2>Which column is which?</h2><p class="muted small">${esc(r.name)}</p>
      <div class="preview"><table>${rows.map(row => `<tr>${row.map(c => `<td>${esc(c.slice(0, 30))}</td>`).join('')}</tr>`).join('')}</table></div>
      <label class="small">Date</label><select id="mDate">${opts(0)}</select>
      <label class="small">Description</label><select id="mDesc">${opts(1)}</select>
      <label class="small">Amount</label><select id="mAmt">${opts(2)}</select>
      <label class="small">or Money out</label><select id="mOut">${opts(-1)}</select>
      <label class="small">and Money in</label><select id="mIn">${opts(-1)}</select>
      <div class="btn-row" style="margin-top:18px;flex-direction:column"><button class="btn primary block" id="mGo">Read it</button><button class="btn block" id="mSkip">Skip</button></div>`);
    $('#mGo').onclick = () => {
      const v = id => parseInt($(id).value, 10);
      const hasHeader = !E.parseDate(rows[0][v('#mDate')]);
      const map = { header: hasHeader ? 0 : -1, date: v('#mDate'), desc: v('#mDesc'), amount: v('#mOut') >= 0 || v('#mIn') >= 0 ? -1 : v('#mAmt'), debit: v('#mOut'), credit: v('#mIn'), dc: -1, type: -1, town: -1, mcc: -1, acct: -1, bankCat: -1, time: -1, raw: -1 };
      closeSheet(); onDone(map);
    };
    $('#mSkip').onclick = () => { closeSheet(); onSkip(); };
  }
  function loadSample() {
    const s = document.createElement('script');
    s.src = 'sample.js';
    s.onload = () => {
      const keep = { aims: S.aims, plan: S.plan, cats: S.cats };
      S = Object.assign(fresh(), keep);
      const results = window.SampleStatements.generate().map(f => Object.assign({ name: f.name, text: f.text }, E.readFile(f.name, f.text)));
      processResults(results, 0, { added: 0, dupes: 0, problems: [] });
    };
    document.body.appendChild(s);
  }
  async function backup() {
    const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    const name = `monthlies-backup-${new Date().toISOString().slice(0, 10)}.json`;
    try { const file = new File([blob], name, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Monthlies backup' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function restore(file) {
    try { const data = JSON.parse(await file.text()); if (!data || !Array.isArray(data.txns)) throw 0; S = Object.assign(fresh(), data); save(); recompute(); render(); toast('Backup restored'); }
    catch (e) { toast('That isn’t a Monthlies backup.'); }
  }
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action],[data-tab]'); if (!el) return;
    const a = el.dataset.action;
    if (!a && el.dataset.tab) return go(el.dataset.tab);
    const f = el.dataset.id ? S.files.find(x => x.id === el.dataset.id) : null;
    switch (a) {
      case 'addFiles': fileInput.value = ''; return fileInput.click();
      case 'sample': return loadSample();
      case 'period': ui.period = el.dataset.p; return render();
      case 'openCat': return catSheet(el.dataset.cat);
      case 'closeSheet': return closeSheet();
      case 'back': return sheetBack ? sheetBack() : closeSheet();
      case 'pick': return pickSheet(el.dataset.id);
      case 'setCat': return setCategory(el.dataset.id, el.dataset.cat);
      case 'applyCat': return applyCategory(el.dataset.id, el.dataset.cat, el.dataset.all === '1');
      case 'newCatFor': { const id = newCategory(prompt('Name for the new category (e.g. Joint account)')); if (id) setCategory(el.dataset.id, id); return; }
      case 'openUnsure': return unsureSheet();
      case 'allPayments': return allSheet('');
      case 'editFile': return fileSheet(el.dataset.id);
      case 'toggleEdit': ui.editing = !ui.editing; return render();
      case 'addCat': if (newCategory(prompt('Name for the new category'))) render(); return;
      case 'removeCat': {
        const c = S.cats.find(x => x.id === el.dataset.cat);
        if (S.cats.length <= 1 || !confirm(`Remove “${c.name}”? Its payments will show under Other.`)) return;
        S.cats = S.cats.filter(x => x.id !== c.id); delete S.aims[c.id]; save(); return render();
      }
      case 'resetCats': if (confirm('Go back to the original 8 categories? Your own categories and budgets will be cleared.')) { S.cats = DEFAULT_CATS.map(c => ({ ...c })); S.aims = {}; save(); ui.editing = false; render(); } return;
      case 'fkind': f.kind = el.dataset.kind; save(); recompute(); render(); return fileSheet(f.id);
      case 'fflip': f.flip = !f.flip; save(); recompute(); render(); return toast('Swapped');
      case 'fremove': if (!confirm(`Remove “${f.label}”?`)) return; S.txns = S.txns.filter(t => t.f !== f.id); S.files = S.files.filter(x => x.id !== f.id); save(); recompute(); closeSheet(); return render();
      case 'backup': return backup();
      case 'restore': backupInput.value = ''; return backupInput.click();
      case 'wipe': if (!confirm('Remove all statements and budgets from this phone? This can’t be undone.')) return; S = fresh(); try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ } recompute(); return go('plan');
    }
  });
  document.addEventListener('input', e => {
    const el = e.target, a = el.dataset.action;
    if (a === 'aim') { const v = parseFloat(el.value); if (v > 0) S.aims[el.dataset.cat] = v; else delete S.aims[el.dataset.cat]; $('#planTotals').innerHTML = planTotals(); }
    else if (a === 'income') { const v = parseFloat(el.value); S.plan.income = isNaN(v) ? null : v; $('#planTotals').innerHTML = planTotals(); }
    else if (a === 'rename') { const c = S.cats.find(x => x.id === el.dataset.cat); if (c) c.name = el.value; }
    else if (a === 'search') allSheet(el.value);
    else if (a === 'fname') { const f = S.files.find(x => x.id === el.dataset.id); f.label = el.value; save(); }
  });
  document.addEventListener('change', e => {
    const a = e.target.dataset.action;
    if (a === 'aim' || a === 'income') save();
    if (a === 'rename') { const c = S.cats.find(x => x.id === e.target.dataset.cat); if (c && !c.name.trim()) c.name = 'Untitled'; save(); }
    if (a === 'fname') { recompute(); render(); }
  });
  fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFiles([...fileInput.files]); });
  backupInput.addEventListener('change', () => { if (backupInput.files[0]) restore(backupInput.files[0]); });

  recompute();
  render();
  window.__monthlies = { get S() { return S; }, get D() { return D; }, aggregate };
})();
