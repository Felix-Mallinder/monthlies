/* Monthlies — screens. Everything stays in this browser's storage on this device. */
(function () {
  'use strict';
  const E = window.Engine;
  const { CATS, CAT, GROUPS, NOT_SPEND } = E;
  const STORE_KEY = 'monthlies.v1';

  // ---------- helpers ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  const f2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = n => f0.format(Math.round(Math.abs(n)) || 0);
  const money2 = n => f2.format(Math.abs(n));
  const round5 = n => Math.round(n / 5) * 5;
  const sum = a => a.reduce((x, y) => x + y, 0);
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pretty = s => { const d = E.toDate(s); return d.getUTCDate() + ' ' + MON3[d.getUTCMonth()]; };
  const prettyDay = s => { const d = E.toDate(s); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON3[d.getUTCMonth()]; };
  const monthName = ym => MONTHS[+ym.slice(5, 7) - 1];
  const gColor = g => `var(--g-${g})`;
  const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));

  // ---------- state ----------
  const fresh = () => ({ v: 1, files: [], txns: [], rules: {}, overrides: {}, aims: {}, plan: { income: null, split: 50, wkLo: 75, wkHi: 200 }, reviewed: {}, sample: false });
  let S = load();
  let D = null; // derived
  const ui = { tab: 'overview', period: 'avg', planOpenFixed: false };

  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return Object.assign(fresh(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); return true; } catch (e) { toast('Couldn’t save on this device — your changes will last until you close the page.'); return false; }
  }
  function recompute() { D = S.txns.length ? E.derive(S.files, S.txns, S.rules, S.overrides) : null; }

  // ---------- aggregates ----------
  function periodTxns(period) { return period === 'avg' ? D.T : D.T.filter(t => t.d.startsWith(period)); }

  function aggregate(period) {
    const list = periodTxns(period);
    const div = period === 'avg' ? D.months : 1;
    const byCat = {}; let income = 0, savings = 0;
    list.forEach(t => {
      if (t.cat === 'transfer') return;
      if (t.cat === 'income') { income -= t.out; return; }
      if (t.cat === 'savings') { savings += t.out; return; }
      byCat[t.cat] = (byCat[t.cat] || 0) + t.out;
    });
    Object.keys(byCat).forEach(k => { byCat[k] /= div; });
    income /= div; savings /= div;
    const byGroup = {};
    Object.entries(byCat).forEach(([k, v]) => { const g = CAT[k].group; byGroup[g] = (byGroup[g] || 0) + v; });
    const spend = sum(Object.values(byCat));
    return { byCat, byGroup, income, savings, spend, left: income - spend, list, div };
  }

  function monthsList() {
    const set = new Set(D.T.filter(t => t.cat !== 'transfer').map(t => t.d.slice(0, 7)));
    return [...set].sort().map(ym => {
      const startD = ym + '-01';
      const endD = E.addDays(E.addDays(startD, 32).slice(0, 7) + '-01', -1);
      const partial = E.daysBetween(D.first, startD) < -3 || E.daysBetween(endD, D.last) < -3;
      return { ym, partial };
    });
  }

  function hasPlan() { return Object.keys(S.aims).length > 0; }
  function aimFor(cat, avg) { return cat in S.aims ? S.aims[cat] : round5(avg[cat] || 0); }
  // Card and loan costs swing a lot month to month (interest, one-off overpayments), so they get a much wider range
  const WIDE = new Set(["debt", "interest"]);
  function rangeFor(aim, cat) { if (!aim) return [0, 0]; const w = WIDE.has(cat) ? Math.max(20, aim * 0.5) : Math.max(5, aim * 0.1); return [Math.max(0, round5(aim - w)), round5(aim + w)]; }

  function weekends() {
    const spendCats = new Set(['cafe', 'dinners', 'takeaway', 'drinks', 'indie', 'clothes', 'online', 'gifts', 'care', 'hobbies', 'travel', 'taxis', 'cash', 'homegarden']);
    const w = {};
    D.T.forEach(t => {
      const d = E.dow(t.d);
      if (!(d === 5 || d === 6 || d === 0) || !spendCats.has(t.cat)) return;
      const sat = E.addDays(t.d, d === 5 ? 1 : d === 0 ? -1 : 0);
      w[sat] = (w[sat] || 0) + t.out;
    });
    // include quiet weekends with nothing spent
    const out = [];
    for (let s = D.first; s <= D.last; s = E.addDays(s, 1)) {
      if (E.dow(s) === 6 && E.addDays(s, -1) >= D.first && E.addDays(s, 1) <= D.last) out.push({ sat: s, amt: Math.max(0, w[s] || 0) });
    }
    return out;
  }

  function uncertain() { return D.T.filter(t => t.conf !== 'user' && !NOT_SPEND.has(t.cat) && (t.conf === 'none' || (t.conf === 'guess' && (t.cat === 'people' || t.cat === 'bills')))); }

  // ---------- render root ----------
  const view = $('#view'), title = $('#title'), tabs = $('#tabs');

  function render() {
    const scrollY = window.scrollY;
    if (!D) {
      tabs.hidden = true;
      title.textContent = '';
      $('#top').hidden = true;
      view.innerHTML = renderWelcome();
      return;
    }
    $('#top').hidden = false;
    tabs.hidden = false;
    tabs.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
    const T = { overview: ['Your month', renderOverview], regulars: ['Regulars', renderRegulars], plan: ['Your plan', renderPlan], statements: ['Statements', renderStatements] }[ui.tab];
    title.textContent = T[0];
    view.innerHTML = T[1]();
    return scrollY;
  }

  function go(tab) { ui.tab = tab; render(); window.scrollTo(0, 0); }

  // ---------- Welcome ----------
  const lockIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  // Bank-specific tips only appear once a statement from that bank has been added
  function bankTips() {
    const seen = S.files.map(f => f.label + ' ' + (f.acctName || '')).join(' ').toUpperCase();
    let h = '';
    if (/\bRBS\b|ROYAL BANK/.test(seen)) h += `<details><summary>Adding more from RBS</summary><div class="body"><p>In RBS Digital Banking on the website, open the account, then look for <b>Download transactions</b> and choose CSV.</p></div></details>`;
    if (/VIRGIN/.test(seen)) h += `<details><summary>Adding more from Virgin Money</summary><div class="body"><p>In Virgin Money online banking, open the card, go to <b>Transactions</b>, then <b>Download</b> or <b>Export</b> and choose CSV.</p></div></details>`;
    return h;
  }

  function howTo() {
    return `
      <details>
        <summary>Getting your statements</summary>
        <div class="body">
          <p>Most banks and card providers let you download your transactions as a spreadsheet file. It’s usually easier on their website (Safari is fine) than in their app.</p>
          <ol>
            <li>Log in to online banking in your browser.</li>
            <li>Open an account or card.</li>
            <li>Look for <b>Download transactions</b>, <b>Export</b> or <b>Statements → Download</b>.</li>
            <li>Choose the last three months, and the <b>CSV</b> (spreadsheet) format.</li>
            <li>Save it to Files, then add it here. Do the same for each account and card.</li>
          </ol>
          <p class="tiny">Menus vary. If it looks different, look for anything saying “download” or “export”.</p>
        </div>
      </details>
      ${bankTips()}
      <details>
        <summary>What happens to my information?</summary>
        <div class="body">
          <p>It stays on this phone. The page reads your statements itself — nothing is uploaded, and the page is set up so it can’t send anything anywhere, even if it wanted to.</p>
          <p>There’s no account or sign-in. If you’d like a copy (for a new phone, say), use “Save a backup” in Statements.</p>
        </div>
      </details>`;
  }

  function renderWelcome() {
    return `<div class="welcome">
      <div class="wordmark">Monthlies</div>
      <h1 style="margin-top:14px">Where it all goes</h1>
      <p class="lead">A quiet, private place to see what goes out each month, and decide, if you want to, what you’d like to change.</p>
      <ol class="steps">
        <li><span>Add your bank and card statements</span></li>
        <li><span>Have a look around. No rush.</span></li>
        <li><span>Make a plan, if you like</span></li>
      </ol>
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn primary block" data-action="addFiles">Add statements</button>
        <button class="btn block" data-action="sample">Try it with example statements</button>
      </div>
      <p class="privacy">${lockIcon}<span>Nothing you add leaves this phone. No account, no sign-in, and nobody else can see it.</span></p>
      <div style="margin-top:28px">${howTo()}</div>
    </div>`;
  }

  // ---------- Overview ----------
  function periodChips() {
    const ms = monthsList();
    let html = `<div class="chips" role="group" aria-label="Period"><button class="chip" data-action="period" data-p="avg" aria-pressed="${ui.period === 'avg'}">Typical month</button>`;
    ms.forEach(m => { html += `<button class="chip" data-action="period" data-p="${m.ym}" aria-pressed="${ui.period === m.ym}">${MON3[+m.ym.slice(5) - 1]}${m.partial ? ' (part)' : ''}</button>`; });
    return html + '</div>';
  }

  function periodLabel() {
    if (ui.period === 'avg') return `A typical month, from ${pretty(D.first)} to ${pretty(D.last)}`;
    const p = monthsList().find(m => m.ym === ui.period);
    return monthName(ui.period) + (p && p.partial ? ' (only part of the month is in your statements)' : '');
  }

  function renderOverview() {
    if (ui.period !== 'avg' && !monthsList().some(m => m.ym === ui.period)) ui.period = 'avg';
    const A = aggregate(ui.period);
    const avg = ui.period === 'avg' ? A : aggregate('avg');
    const left = A.left;
    let h = periodChips();

    h += `<section class="headline">
      <div class="label small">${esc(periodLabel())}</div>
      <p class="statement">${money(A.income)} came in, and ${money(A.spend)} went out${left >= 0 ? `, leaving about <b>${money(left)}</b>.` : '.'}</p>
      <div class="inout">
        <div><span>Money in</span><b>${money(A.income)}</b></div>
        <div><span>Spent</span><b>${money(A.spend)}</b></div>
        <div><span>Put aside</span><b>${money(A.savings)}</b></div>
      </div>
      ${left < 0 ? `<div class="note">That’s about ${money(left)} more going out than in. It’s more common than you’d think, and it’s exactly what this is for. Below is where it goes, and the Plan tab lets you try out changes.</div>` : ''}
    </section>`;

    const obs = observations(A, avg);
    if (obs.length) h += `<section><h3>Worth a look</h3><div class="obs">${obs.join('')}</div></section>`;

    // Where it goes
    const groups = GROUPS.filter(g => (A.byGroup[g.id] || 0) > 0.5);
    const total = sum(groups.map(g => A.byGroup[g.id]));
    h += `<section><h3>Where it goes</h3>
      <div class="stack" role="img" aria-label="Spending by group">${groups.map(g => `<span style="flex:${A.byGroup[g.id] / total};background:${gColor(g.id)}" title="${esc(g.name)} ${money(A.byGroup[g.id])}"></span>`).join('')}</div>
      <div class="legend">${groups.map(g => `<span><i style="background:${gColor(g.id)}"></i>${esc(g.name)} ${Math.round(A.byGroup[g.id] / total * 100)}%</span>`).join('')}</div>`;
    if (hasPlan()) h += `<div class="key"><span><span class="kband"></span>your range</span><span><span class="kfill"></span>${ui.period === 'avg' ? 'typical month' : 'this month'}</span></div>`;
    else h += `<p class="tiny" style="margin-top:6px">Tap any line to see the payments in it. To add your own ranges, use the <button class="link" data-action="tab" data-tab="plan">Plan</button> tab.</p>`;

    const sortedGroups = [...groups].sort((a, b) => A.byGroup[b.id] - A.byGroup[a.id]);
    sortedGroups.forEach(g => {
      const cats = CATS.filter(c => c.group === g.id && Math.abs(A.byCat[c.id] || 0) > 0.5).sort((a, b) => (A.byCat[b.id] || 0) - (A.byCat[a.id] || 0));
      const gmax = Math.max(1, ...Object.values(A.byCat));
      h += `<div class="group"><div class="group-head"><span class="gname"><i style="background:${gColor(g.id)}"></i>${esc(g.name)}</span><span class="gamt">${money(A.byGroup[g.id])}</span></div>`;
      cats.forEach(c => { h += catRow(c, A.byCat[c.id] || 0, gmax, avg.byCat, g.id); });
      h += '</div>';
    });
    h += '</section>';

    // Weekends
    const W = weekends();
    if (W.length >= 3) h += weekendSection(W);

    h += `<section><p class="tiny">Moves between your own accounts (like paying off a card) aren’t counted as spending, so nothing is counted twice. ${D.T.filter(t => t.cat === 'transfer').length} payments were matched up this way.</p></section>`;
    return h;
  }

  function catRow(c, amt, gmax, avgByCat, gid) {
    let note = '', track;
    const count = periodTxns(ui.period).filter(t => t.cat === c.id).length;
    if (hasPlan()) {
      const aim = aimFor(c.id, avgByCat);
      const [lo, hi] = rangeFor(aim, c.id);
      const scale = Math.max(hi / 0.72, amt * 1.04, 1);
      const status = amt > hi + 0.5 ? 'above' : amt < lo - 0.5 ? 'below' : 'within';
      const color = status === 'above' ? 'var(--warm)' : status === 'below' ? 'var(--calm)' : 'var(--accent)';
      const words = status === 'above' ? `${money(amt - hi)} above your range` : status === 'below' ? `${money(lo - amt)} under your range` : 'within your range';
      track = `<div class="track"><div class="band" style="left:${lo / scale * 100}%;width:${Math.max(1, (hi - lo) / scale * 100)}%"></div><div class="fill" style="width:${Math.min(100, amt / scale * 100)}%;background:${color}"></div></div>`;
      note = `<div class="cat-note"><span class="status-${status}">${words}</span><span>${money(lo)}–${money(hi)}</span></div>`;
    } else {
      track = `<div class="track"><div class="fill" style="width:${Math.max(0, amt / gmax * 100)}%;background:${gColor(gid)}"></div></div>`;
      const extra = c.id === 'cafe' ? `${count} visits` : plural(count, 'payment');
      const vs = ui.period !== 'avg' && avgByCat[c.id] ? (() => { const d = amt - avgByCat[c.id]; return Math.abs(d) < Math.max(5, avgByCat[c.id] * 0.1) ? 'about usual' : `${money(d)} ${d > 0 ? 'more' : 'less'} than usual`; })() : '';
      note = `<div class="cat-note"><span>${esc(extra)}</span><span>${vs}</span></div>`;
    }
    return `<button class="cat-row" data-action="openCat" data-cat="${c.id}">
      <div class="cat-top"><span class="cat-name">${esc(c.name)}</span><span class="cat-amt">${money(amt)}</span></div>
      ${track}${note}</button>`;
  }

  function observations(A, avg) {
    const out = [];
    const list = A.list;
    const perMonth = A.div;
    // Café habit
    const cafe = list.filter(t => t.cat === 'cafe' && t.out > 0);
    if (cafe.length >= 8) {
      const days = new Set(cafe.map(t => t.d)).size;
      const weeks = Math.max(1, (perMonth * 30.44) / 7);
      const med = E.median(cafe.map(t => t.out));
      out.push(ob(`${Math.round(days / weeks)} days a week`, `you bought lunch or coffee out, usually around ${money2(med)} a time. That comes to about ${money(sum(cafe.map(t => t.out)) / perMonth)} a month.`, 'cafe'));
    }
    // Midweek expenses
    const away = list.filter(t => t.cat === 'worktrips');
    if (away.length) {
      out.push(ob(`${money(sum(away.map(t => t.out)) / perMonth)} a month`, `on midweek expenses.`, 'worktrips'));
    }
    // Regulars
    const regs = D.regs;
    if (regs.length) {
      const m = sum(regs.map(r => r.monthly));
      out.push(ob(`${money(m)} a month`, `goes on ${regs.length} regular payments, which is ${money(m * 12)} a year.`, null, false, 'regulars'));
    }
    // Furthest above range
    if (hasPlan()) {
      let worst = null;
      Object.entries(A.byCat).forEach(([k, v]) => { const [, hi] = rangeFor(aimFor(k, avg.byCat), k); if (v - hi > 10 && (!worst || v - hi > worst[1])) worst = [k, v - hi]; });
      if (worst) out.push(ob(money(worst[1]), `above the range you set for ${CAT[worst[0]].name.toLowerCase()}.`, worst[0]));
    }
    return out.slice(0, 4);
  }

  function ob(num, text, cat, total, tab) {
    const act = cat ? `<div class="act"><button class="link" data-action="openCat" data-cat="${cat}">See the payments</button></div>` : tab ? `<div class="act"><button class="link" data-action="tab" data-tab="${tab}">See them all</button></div>` : '';
    return `<div class="ob"><span class="num">${esc(num)}</span><p>${esc(text)}</p>${act}</div>`;
  }

  function weekendSection(W) {
    const lo = S.plan.wkLo, hi = S.plan.wkHi;
    const max = Math.max(hi * 1.5, ...W.map(w => w.amt)) * 1.05;
    const pct = v => Math.min(98, Math.max(2, v / max * 100));
    const rows = [];
    const placed = [...W].sort((a, b) => a.amt - b.amt).map(w => {
      const x = pct(w.amt); let row = 0;
      while (rows[row] !== undefined && x - rows[row] < 4.5) row++;
      rows[row] = x; return { w, x, row: Math.min(row, 3) };
    });
    const count = { q: 0, n: 0, b: 0 };
    W.forEach(w => { count[w.amt < lo ? 'q' : w.amt <= hi ? 'n' : 'b']++; });
    const typical = E.median(W.map(w => w.amt));
    return `<section><h3>Weekends</h3>
      <div class="card">
        <p style="margin-bottom:4px">A typical weekend came to about <b>${money(typical)}</b>, counting meals, drinks, shopping and days out from Friday to Sunday.</p>
        <p class="tiny">${count.q} quiet · ${count.n} normal · ${count.b} bigger, out of ${W.length} weekends</p>
        <div class="wk-track" role="img" aria-label="Each weekend's spending as a dot">
          <div class="wk-zone q" style="left:0;width:${pct(lo)}%"></div>
          <div class="wk-zone n" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></div>
          <div class="wk-zone b" style="left:${pct(hi)}%;right:0"></div>
          ${placed.map(p => `<span class="wk-dot" title="Weekend of ${prettyDay(p.w.sat)}: ${money(p.w.amt)}" style="left:${p.x}%;bottom:${30 + p.row * 15}px"></span>`).join('')}
          <div class="wk-labels"><span style="left:${pct(lo) / 2}%">Quiet</span><span style="left:${(pct(lo) + pct(hi)) / 2}%">Normal ${money(lo)}–${money(hi)}</span><span style="left:${(pct(hi) + 100) / 2}%">Bigger</span></div>
        </div>
        <p class="tiny" style="margin:8px 0 0">You can change what counts as a normal weekend in Plan.</p>
      </div></section>`;
  }

  // ---------- Regulars ----------
  function renderRegulars() {
    const regs = D.regs;
    const homeSet = new Set(['mortgage', 'bills', 'insurance', 'debt', 'interest', 'charity', 'commute']);
    const subsSet = new Set(['subs', 'health']);
    const sections = [
      ['Home & bills', regs.filter(r => homeSet.has(r.cat))],
      ['Subscriptions & memberships', regs.filter(r => subsSet.has(r.cat))],
      ['Other regulars', regs.filter(r => !homeSet.has(r.cat) && !subsSet.has(r.cat))]
    ];
    const total = sum(regs.map(r => r.monthly));
    const marked = regs.filter(r => S.reviewed[r.key]);
    let h = `<section><p class="muted">Payments that come round on a schedule. They’re easy to forget about because they look after themselves.</p>
      <div class="inout" style="grid-template-columns:1fr 1fr">
        <div><span>Each month</span><b>${money(total)}</b></div><div><span>Each year</span><b>${money(total * 12)}</b></div>
      </div>
      <p class="tiny" style="margin-top:12px">Tap the circle next to anything you’d like to look at again later.${marked.length ? ` You’ve marked ${marked.length}, worth ${money(sum(marked.map(r => r.monthly)))} a month.` : ''}</p></section>`;
    sections.forEach(([name, list]) => {
      if (!list.length) return;
      h += `<section><h3>${esc(name)} · ${money(sum(list.map(r => r.monthly)))} a month</h3><div class="list">`;
      list.forEach(r => {
        h += `<div class="item"><button class="mark ${S.reviewed[r.key] ? 'on' : ''}" data-action="mark" data-key="${esc(r.key)}" aria-label="Mark ${esc(r.name)} to look at later" aria-pressed="${!!S.reviewed[r.key]}"></button>
          <div class="main"><div class="title">${esc(r.name)}</div><div class="sub">${esc(r.freq)} · ${esc(CAT[r.cat].name)}</div></div>
          <div class="amt">${money2(r.monthly)}<small>${money(r.yearly)} a year</small></div></div>`;
      });
      h += '</div></section>';
    });
    // Little and often
    const regKeys = new Set(regs.map(r => r.key));
    const g = {};
    D.T.forEach(t => { if (t.out > 0 && !NOT_SPEND.has(t.cat) && !regKeys.has(t.key) && !['cash', 'commute'].includes(t.cat)) (g[t.key] = g[t.key] || []).push(t); });
    const habits = Object.values(g).filter(l => l.length >= 5).map(l => ({ name: l[0].merch, count: l.length, typical: E.median(l.map(t => t.out)), monthly: sum(l.map(t => t.out)) / D.months, cat: l[0].cat, indie: l.some(t => t.indie) }))
      .sort((a, b) => b.monthly - a.monthly).slice(0, 10);
    if (habits.length) {
      h += `<section><h3>Little and often</h3><p class="muted small">Places you go back to again and again. Small amounts, but they add up.</p><div class="list">`;
      habits.forEach(x => {
        h += `<div class="item"><div class="main"><div class="title">${esc(x.name)}</div><div class="sub">${x.count} times · usually ${money2(x.typical)}</div></div>
          <div class="amt">${money(x.monthly)}<small>a month</small></div></div>`;
      });
      h += '</div></section>';
    }
    return h;
  }

  // ---------- Plan ----------
  function renderPlan() {
    const avg = aggregate('avg');
    if (S.plan.income == null) S.plan.income = Math.round(avg.income);
    const cats = CATS.filter(c => !NOT_SPEND.has(c.id) && ((avg.byCat[c.id] || 0) > 0.5 || c.id in S.aims));
    const flex = cats.filter(c => !c.fixed), fixed = cats.filter(c => c.fixed);
    let h = `<section><p class="muted">Start with what comes in, then move the sliders (or type an amount) to try things out. It’s only a sketch: nothing changes unless you want it to. Each aim becomes a comfortable range, shown on the Overview.</p></section>
      <section class="card"><div class="income-field"><label for="income">Money in each month</label>
        <span class="money-input big-input">£<input id="income" type="number" inputmode="numeric" min="0" step="10" value="${Math.round(S.plan.income)}" data-action="income"></span></div>
        <p class="tiny" style="margin:8px 0 0">Worked out from your statements as ${money(avg.income)}. Change it if that’s not quite right.</p></section>
      <div class="plan-strip" id="planStrip">${planStrip(avg)}</div>
      <section class="card plan-sum" id="planSum">${planSummary(avg)}</section>
      <section><h3>Day to day</h3>${flex.map(c => planRow(c, avg)).join('')}</section>
      <section><h3>Fixed costs</h3><p class="tiny">These usually only change when you switch provider, so they start as they are. Loans, credit and interest get a wider range, because they tend to go up and down from month to month.</p>${fixed.map(c => planRow(c, avg)).join('')}</section>
      <section><h3>A normal weekend</h3>
        <p class="muted small">Friday to Sunday: meals, drinks, shopping and days out.</p>
        <div class="field" style="flex-wrap:wrap"><label for="wkLo">From</label><input id="wkLo" type="number" inputmode="numeric" min="0" step="5" value="${S.plan.wkLo}" data-action="wk">
        <label for="wkHi">to</label><input id="wkHi" type="number" inputmode="numeric" min="0" step="5" value="${S.plan.wkHi}" data-action="wk"></div>
      </section>
      ${hasPlan() ? '<section><button class="btn block danger" data-action="resetPlan">Start the plan again</button></section>' : ''}`;
    return h;
  }

  function planNumbers(avg) {
    const cats = CATS.filter(c => !NOT_SPEND.has(c.id));
    let lo = 0, hi = 0, mid = 0, now = 0;
    cats.forEach(c => { const a = aimFor(c.id, avg.byCat); const [l, u] = rangeFor(a, c.id); lo += l; hi += u; mid += a; now += avg.byCat[c.id] || 0; });
    return { lo, hi, mid, now, freed: now - mid, income: S.plan.income };
  }

  function planSummary(avg) {
    const n = planNumbers(avg);
    const leftLo = n.income - n.hi, leftHi = n.income - n.lo;
    const freed = Math.max(0, n.freed);
    const sv = freed * S.plan.split / 100, cd = freed - sv;
    const left = n.income - n.mid;
    const signed = v => (v >= 0 ? money(v) + ' spare' : money(v) + ' short');
    return `<div class="small muted">With these aims, each month you’d have about</div>
      <div class="big">${money(left)}</div>
      <div class="muted small">${left >= 0 ? 'left over' : 'more going out than coming in'}. Allowing for the ranges, somewhere between ${signed(leftLo)} and ${signed(leftHi)}.</div>
      <hr class="rule">
      ${freed >= 5 ? `<p style="margin:0 0 6px">That frees up about <b>${money(freed)} a month</b>, or ${money(freed * 12)} a year, compared with now.</p>
        <div class="split-labels"><span>Savings</span><span>Cards &amp; loans</span></div>
        <input type="range" min="0" max="100" step="5" value="${100 - S.plan.split}" data-action="split" aria-label="How to split what you free up">
        <p class="tiny" style="margin:0" id="splitLine">In a year: <b>${money(sv * 12)}</b> into savings and <b>${money(cd * 12)}</b> off cards &amp; loans.</p>`
        : `<p class="tiny" style="margin:0">Move a slider down to see how much it frees up over a year.</p>`}`;
  }

  function planStrip(avg) {
    const n = planNumbers(avg), v = n.income - n.mid;
    const left = `about <b>${money(v)}</b> ${v >= 0 ? 'spare' : 'short'}`;
    return `<span>${left} a month</span><span>${n.freed >= 5 ? `frees <b>${money(n.freed)}</b>` : "move a slider"}</span>`;
  }

  // Sliders give room above both the current spend and the aim; typing a bigger number stretches the slider to fit
  function sliderMax(v) { return Math.max(50, round5(v * 1.6 + 20)); }

  function planRow(c, avg) {
    const now = avg.byCat[c.id] || 0;
    const aim = aimFor(c.id, avg.byCat);
    const max = sliderMax(Math.max(now, aim));
    const [lo, hi] = rangeFor(aim, c.id);
    const diff = now - aim;
    return `<div class="plan-row" data-row="${c.id}">
      <div class="row-top"><label for="aim-${c.id}">${esc(c.name)}</label><span class="money-input">£<input id="aim-${c.id}" type="number" inputmode="numeric" min="0" step="5" value="${aim}" data-action="aim" data-cat="${c.id}" aria-label="Monthly aim for ${esc(c.name)}"></span></div>
      <input type="range" min="0" max="${max}" step="5" value="${aim}" data-action="aim" data-cat="${c.id}" aria-label="Monthly aim for ${esc(c.name)}">
      <div class="row-sub"><span>Now about ${money(now)}</span><span data-rangelabel class="${Math.abs(diff) >= 5 ? 'moved' : ''}">${Math.abs(diff) >= 5 ? (diff > 0 ? money(diff) + ' less' : money(-diff) + ' more') + ' · ' : ''}${money(lo)}–${money(hi)}</span></div>
    </div>`;
  }

  // ---------- Statements ----------
  function renderStatements() {
    const unsure = uncertain();
    const byFile = {};
    S.txns.forEach(t => { (byFile[t.f] = byFile[t.f] || []).push(t.d); });
    let h = `<section><button class="btn primary block" data-action="addFiles">Add statements</button>
      <p class="tiny" style="margin-top:10px">CSV files from your bank or card provider. Most UK banks offer them. You can add several at once, and adding the same months twice won’t count anything twice.</p></section>`;
    if (unsure.length) {
      h += `<section class="card"><h2>${plural(unsure.length, 'payment')} to check</h2><p class="muted small" style="margin-bottom:10px">These ones weren’t obvious. Sorting them is optional, and the totals will just get a little more accurate.</p><button class="btn block" data-action="openUnsure">Have a look</button></section>`;
    }
    h += `<section><h3>Your accounts</h3><div class="list">`;
    S.files.forEach(f => {
      const ds = (byFile[f.id] || []).sort();
      h += `<div class="item"><div class="main"><div class="title">${esc(f.label)}</div><div class="sub">${f.kind === 'credit' ? 'Credit card' : 'Bank account'} · ${ds.length} payments · ${ds.length ? pretty(ds[0]) + '–' + pretty(ds[ds.length - 1]) : ''}</div></div>
        <button class="btn quiet" data-action="editFile" data-id="${f.id}">Edit</button></div>`;
    });
    h += `</div></section>
      <section><button class="btn block" data-action="allPayments">See every payment</button></section>
      <section><h3>Help</h3>${howTo()}</section>
      <section><h3>Your information</h3>
        <p class="privacy">${lockIcon}<span>Everything here is stored on this phone only. If you clear Safari’s website data, it goes too, so save a backup if you want to keep it.</span></p>
        <div class="btn-row"><button class="btn" data-action="backup">Save a backup</button><button class="btn" data-action="restore">Restore a backup</button></div>
        <p style="margin-top:14px"><button class="btn block danger" data-action="wipe">Remove everything from this phone</button></p>
      </section>`;
    return h;
  }

  // ---------- Sheets ----------
  const sheet = $('#sheet');
  let sheetBack = null;
  function openSheet(html, back) {
    sheetBack = back || null;
    sheet.innerHTML = `<div class="sheet-backdrop" data-action="closeSheet"></div><div class="sheet-panel" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
  }
  function closeSheet() {
    sheet.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { if (!sheet.classList.contains('open')) { sheet.hidden = true; sheet.innerHTML = ''; } }, 250);
  }
  function replaceSheet(html) { const p = $('.sheet-panel', sheet); if (p) { p.innerHTML = '<div class="grabber"></div>' + html; p.scrollTop = 0; } else openSheet(html); }

  function txnRow(t, showCat) {
    const tags = (t.work ? '<span class="tag work">midweek expenses</span>' : '') + (t.recurring ? '<span class="tag">regular</span>' : '') + (t.refund ? '<span class="tag">refund</span>' : '');
    return `<button class="item" data-action="pick" data-id="${t.id}">
      <div class="main"><div class="title">${esc(t.merch)}${tags}</div><div class="sub">${prettyDay(t.d)} · ${showCat ? esc(CAT[t.cat].name) : esc(t.acct)}${t.town ? ' · ' + esc(t.town.charAt(0) + t.town.slice(1).toLowerCase()) : ''}</div></div>
      <div class="amt ${t.out < 0 ? 'neg' : ''}">${t.out < 0 ? '+' : ''}${money2(t.out)}</div></button>`;
  }

  function catSheet(catId) {
    const list = periodTxns(ui.period).filter(t => t.cat === catId);
    const A = aggregate(ui.period);
    const c = CAT[catId];
    const intro = catId === 'cafe' ? '<p class="muted small">Includes small, regular weekday spends at the same places, which usually means lunch.</p>' : '';
    const html = `<div class="sheet-head"><div><h2>${esc(c.name)}</h2><div class="muted small">${money(A.byCat[catId] || 0)} ${ui.period === 'avg' ? 'in a typical month' : 'in ' + monthName(ui.period)} · ${plural(list.length, 'payment')}</div></div><button class="btn quiet" data-action="closeSheet">Done</button></div>
      ${intro}<p class="tiny">Tap a payment to move it to a different category.</p>
      <div class="list">${list.map(t => txnRow(t, false)).join('') || '<div class="item">Nothing here.</div>'}</div>`;
    openSheet(html, () => catSheet(catId));
  }

  function pickSheet(id) {
    const t = D.T.find(x => x.id === id); if (!t) return;
    const groups = [...GROUPS, { id: 'none', name: 'Not spending' }];
    const html = `<div class="sheet-head"><div><h2>${esc(t.merch)}</h2><div class="muted small">${money2(t.out)} · ${prettyDay(t.d)} · ${esc(t.acct)}</div></div><button class="btn quiet" data-action="back">Back</button></div>
      <p class="tiny">Original description: ${esc(t.desc)}</p>
      ${groups.map(g => `<h3 style="margin-top:14px">${esc(g.name)}</h3><div class="pills">${CATS.filter(c => c.group === g.id).map(c => `<button class="pill ${c.id === t.cat ? 'on' : ''}" data-action="setCat" data-id="${t.id}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>`).join('')}`;
    replaceSheet(html);
  }

  function setCategory(id, cat) {
    const t = D.T.find(x => x.id === id); if (!t) return;
    const same = D.T.filter(x => x.key === t.key && x.id !== t.id && x.cat !== cat);
    if (same.length) {
      replaceSheet(`<h2>Move the others too?</h2>
        <p class="muted">There ${same.length === 1 ? 'is 1 other payment' : 'are ' + same.length + ' other payments'} from <b>${esc(t.merch)}</b>. Put ${same.length === 1 ? 'it' : 'them'} in ${esc(CAT[cat].name)} as well, now and in future statements?</p>
        <div class="btn-row" style="flex-direction:column"><button class="btn primary block" data-action="applyCat" data-id="${id}" data-cat="${cat}" data-all="1">Yes, all from ${esc(t.merch)}</button>
        <button class="btn block" data-action="applyCat" data-id="${id}" data-cat="${cat}" data-all="0">Just this one</button></div>`);
    } else applyCategory(id, cat, true);
  }

  function applyCategory(id, cat, all) {
    const t = D.T.find(x => x.id === id); if (!t) return;
    if (all) { S.rules[t.key] = cat; D.T.filter(x => x.key === t.key).forEach(x => { delete S.overrides[x.id]; }); }
    else S.overrides[id] = cat;
    save(); recompute(); render();
    toast(`Moved to ${CAT[cat].name}`);
    if (sheetBack) sheetBack(); else closeSheet();
  }

  function unsureSheet() {
    const list = uncertain();
    openSheet(`<div class="sheet-head"><div><h2>To check</h2><div class="muted small">${plural(list.length, 'payment')}</div></div><button class="btn quiet" data-action="closeSheet">Done</button></div>
      <p class="tiny">Tap one to choose where it belongs. You can leave any you’re not sure about.</p>
      <div class="list">${list.map(t => txnRow(t, true)).join('') || '<div class="item">All sorted. Thank you.</div>'}</div>`, unsureSheet);
  }

  function allSheet(q) {
    q = q || '';
    const ql = q.toLowerCase();
    const list = D.T.filter(t => !ql || t.merch.toLowerCase().includes(ql) || CAT[t.cat].name.toLowerCase().includes(ql) || t.desc.toLowerCase().includes(ql));
    const body = `<div class="list" id="allList">${list.slice(0, 250).map(t => txnRow(t, true)).join('')}${list.length > 250 ? `<div class="item tiny">Showing 250 of ${list.length}. Search to narrow it down.</div>` : ''}</div>`;
    if ($('#allList')) { $('#allList').outerHTML = body; return; }
    openSheet(`<div class="sheet-head"><div><h2>Every payment</h2><div class="muted small">${plural(D.T.length, 'payment')}</div></div><button class="btn quiet" data-action="closeSheet">Done</button></div>
      <input class="search" type="search" placeholder="Search, e.g. Tesco or Lunch" value="${esc(q)}" data-action="search" autocomplete="off">${body}`, () => allSheet($('.search') ? $('.search').value : ''));
  }

  function fileSheet(id) {
    const f = S.files.find(x => x.id === id); if (!f) return;
    openSheet(`<div class="sheet-head"><h2>Edit account</h2><button class="btn quiet" data-action="closeSheet">Done</button></div>
      <label class="small muted" for="fname">Name</label>
      <input id="fname" class="search" value="${esc(f.label)}" data-action="fname" data-id="${id}">
      <h3 style="margin-top:8px">Type</h3>
      <div class="pills"><button class="pill ${f.kind === 'current' ? 'on' : ''}" data-action="fkind" data-id="${id}" data-kind="current">Bank account</button><button class="pill ${f.kind === 'credit' ? 'on' : ''}" data-action="fkind" data-id="${id}" data-kind="credit">Credit card</button></div>
      <h3>Money in and out the wrong way round?</h3>
      <p class="muted small">If spending shows up as money coming in, flip it.</p>
      <button class="btn block" data-action="fflip" data-id="${id}">Flip money in and out</button>
      <hr class="rule"><button class="btn block danger" data-action="fremove" data-id="${id}">Remove this statement</button>`);
  }

  // ---------- Import ----------
  const fileInput = $('#fileInput'), backupInput = $('#backupInput');

  async function handleFiles(files) {
    const results = [];
    for (const file of files) {
      if (/\.pdf$/i.test(file.name)) { results.push({ name: file.name, error: 'pdf' }); continue; }
      const text = await file.text();
      results.push(Object.assign({ name: file.name, text }, E.readFile(file.name, text)));
    }
    processResults(results, 0, { added: 0, dupes: 0, files: 0, problems: [] });
  }

  function processResults(results, i, tally) {
    if (i >= results.length) return finishImport(tally);
    const r = results[i];
    if (r.error === 'columns' || r.error === 'norows') return mapSheet(r, map => {
      const again = E.readFile(r.name, r.text, map);
      if (again.error) { tally.problems.push(r.name); processResults(results, i + 1, tally); }
      else { addParsed(r.name, again, tally); processResults(results, i + 1, tally); }
    }, () => { tally.problems.push(r.name); processResults(results, i + 1, tally); });
    if (r.error) { tally.problems.push(r.name + (r.error === 'pdf' ? ' (PDF — please use a CSV download)' : '')); return processResults(results, i + 1, tally); }
    addParsed(r.name, r, tally);
    processResults(results, i + 1, tally);
  }

  function addParsed(name, parsed, tally) {
    const existing = {};
    S.txns.forEach(t => { const b = `${t.d}|${t.o.toFixed(2)}|${t.desc}`; existing[b] = (existing[b] || 0) + 1; });
    const fileId = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const counts = {};
    const fresh = [];
    parsed.txns.forEach(t => {
      counts[t.base] = (counts[t.base] || 0) + 1;
      if (counts[t.base] > (existing[t.base] || 0)) {
        const o = Object.assign({}, t, { f: fileId }); delete o.base;
        if (S.txns.some(x => x.id === o.id)) o.id = o.id + fileId.slice(-4);
        fresh.push(o);
      }
    });
    tally.dupes += parsed.txns.length - fresh.length;
    if (!fresh.length) return;
    S.files.push({ id: fileId, label: parsed.meta.label, kind: parsed.meta.kind, flip: false, acctName: parsed.meta.acctName });
    S.txns.push(...fresh);
    tally.added += fresh.length; tally.files++;
  }

  function finishImport(tally) {
    save(); recompute();
    ui.tab = 'overview'; ui.period = 'avg';
    render(); window.scrollTo(0, 0);
    if (!tally.added) {
      openSheet(`<h2>Nothing new added</h2><p class="muted">${tally.dupes ? 'Those payments are already here, so nothing was counted twice.' : 'Those files didn’t have any payments that could be read.'}</p>${tally.problems.length ? `<p class="small muted">Couldn’t read: ${esc(tally.problems.join(', '))}</p>` : ''}<button class="btn primary block" data-action="closeSheet">OK</button>`);
      return;
    }
    const unsure = D ? uncertain().length : 0;
    const accts = S.files.length;
    openSheet(`<h2 style="font-size:28px;margin-top:6px">That’s everything in.</h2>
      <p class="muted">${plural(tally.added, 'payment')} added${accts > 1 ? ` across ${accts} accounts` : ''}, from ${pretty(D.first)} to ${pretty(D.last)}.${tally.dupes ? ` ${tally.dupes} were already here, so they weren’t counted twice.` : ''}</p>
      ${tally.problems.length ? `<p class="small muted">Couldn’t read: ${esc(tally.problems.join(', '))}</p>` : ''}
      <div class="note" style="margin:16px 0 20px">Before you look: most people find at least one surprise. That’s normal, and it’s useful. Nothing here is a verdict, just a clearer picture.</div>
      ${unsure ? `<p class="tiny">${plural(unsure, 'payment')} weren’t obvious. You can sort those later in Statements, or not at all.</p>` : ''}
      <button class="btn primary block" data-action="closeSheet">Show me</button>`);
  }

  function mapSheet(r, onDone, onSkip) {
    const rows = E.parseCSV(r.text).slice(0, 8);
    const width = Math.max(...rows.map(x => x.length));
    let header = 0;
    const opts = sel => `<option value="-1">—</option>` + Array.from({ length: width }, (_, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>Column ${i + 1}: ${esc((rows[0][i] || '').slice(0, 24))}</option>`).join('');
    openSheet(`<h2>Help me read this file</h2>
      <p class="muted small">${esc(r.name)} is laid out in a way I don’t recognise. Which columns hold what?</p>
      <div class="preview"><table>${rows.map(row => `<tr>${row.map(c => `<td>${esc(c.slice(0, 30))}</td>`).join('')}</tr>`).join('')}</table></div>
      <label class="small">Date</label><select id="mDate">${opts(0)}</select>
      <label class="small" style="display:block;margin-top:10px">Description</label><select id="mDesc">${opts(1)}</select>
      <label class="small" style="display:block;margin-top:10px">Amount (one column, minus = money out)</label><select id="mAmt">${opts(2)}</select>
      <p class="tiny" style="margin:8px 0">Or, if money in and out are in separate columns:</p>
      <label class="small">Money out</label><select id="mOut">${opts(-1)}</select>
      <label class="small" style="display:block;margin-top:10px">Money in</label><select id="mIn">${opts(-1)}</select>
      <div class="btn-row" style="margin-top:18px;flex-direction:column"><button class="btn primary block" id="mGo">Read it</button><button class="btn block" id="mSkip">Skip this file</button></div>`);
    $('#mGo').onclick = () => {
      const v = id => parseInt($(id).value, 10);
      const hasHeader = !E.parseDate(rows[0][v('#mDate')]);
      const map = { header: hasHeader ? 0 : -1, date: v('#mDate'), desc: v('#mDesc'), amount: v('#mOut') >= 0 || v('#mIn') >= 0 ? -1 : v('#mAmt'), debit: v('#mOut'), credit: v('#mIn'), dc: -1, type: -1, town: -1, mcc: -1, acct: -1 };
      closeSheet(); onDone(map);
    };
    $('#mSkip').onclick = () => { closeSheet(); onSkip(); };
  }

  function loadSample() {
    const s = document.createElement('script');
    s.src = 'sample.js';
    s.onload = () => {
      const files = window.SampleStatements.generate();
      S = fresh(); S.sample = true;
      const results = files.map(f => Object.assign({ name: f.name, text: f.text }, E.readFile(f.name, f.text)));
      processResults(results, 0, { added: 0, dupes: 0, files: 0, problems: [] });
    };
    document.body.appendChild(s);
  }

  async function backup() {
    const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    const name = `monthlies-backup-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Monthlies backup' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function restore(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.txns) || !Array.isArray(data.files)) throw new Error('not a backup');
      S = Object.assign(fresh(), data); save(); recompute(); ui.tab = 'overview'; render(); toast('Backup restored');
    } catch (e) { toast('That doesn’t look like a Monthlies backup.'); }
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action],[data-tab]');
    if (!el) return;
    const a = el.dataset.action;
    if (!a && el.dataset.tab) return go(el.dataset.tab);
    switch (a) {
      case 'tab': return go(el.dataset.tab);
      case 'addFiles': fileInput.value = ''; return fileInput.click();
      case 'sample': return loadSample();
      case 'period': ui.period = el.dataset.p; return render();
      case 'openCat': return catSheet(el.dataset.cat);
      case 'closeSheet': return closeSheet();
      case 'back': return sheetBack ? sheetBack() : closeSheet();
      case 'pick': return pickSheet(el.dataset.id);
      case 'setCat': return setCategory(el.dataset.id, el.dataset.cat);
      case 'applyCat': return applyCategory(el.dataset.id, el.dataset.cat, el.dataset.all === '1');
      case 'openUnsure': return unsureSheet();
      case 'allPayments': return allSheet('');
      case 'editFile': return fileSheet(el.dataset.id);
      case 'mark': S.reviewed[el.dataset.key] = !S.reviewed[el.dataset.key]; if (!S.reviewed[el.dataset.key]) delete S.reviewed[el.dataset.key]; save(); return render();
      case 'resetPlan': if (confirm('Clear all your aims and start again?')) { S.aims = {}; S.plan.split = 50; save(); render(); } return;
      case 'fkind': { const f = S.files.find(x => x.id === el.dataset.id); f.kind = el.dataset.kind; save(); recompute(); render(); return fileSheet(f.id); }
      case 'fflip': { const f = S.files.find(x => x.id === el.dataset.id); f.flip = !f.flip; save(); recompute(); render(); toast('Flipped'); return; }
      case 'fremove': {
        const f = S.files.find(x => x.id === el.dataset.id);
        if (!confirm(`Remove “${f.label}” and its payments from this phone?`)) return;
        S.txns = S.txns.filter(t => t.f !== f.id); S.files = S.files.filter(x => x.id !== f.id);
        save(); recompute(); closeSheet(); render(); return;
      }
      case 'backup': return backup();
      case 'restore': backupInput.value = ''; return backupInput.click();
      case 'wipe':
        if (!confirm('Remove all your statements and plans from this phone? This can’t be undone, unless you’ve saved a backup.')) return;
        S = fresh(); try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
        recompute(); render(); window.scrollTo(0, 0); return;
    }
  });

  document.addEventListener('input', e => {
    const el = e.target, a = el.dataset.action;
    if (a === 'aim') {
      const avg = aggregate('avg');
      const aim = Math.max(0, Math.round(+el.value || 0));
      S.aims[el.dataset.cat] = aim;
      const row = el.closest('.plan-row');
      const [lo, hi] = rangeFor(aim, el.dataset.cat), diff = (avg.byCat[el.dataset.cat] || 0) - aim;
      const slider = $('input[type=range]', row), box = $('input[type=number]', row);
      if (el === box) { if (aim > +slider.max) slider.max = sliderMax(aim); slider.value = aim; }
      else box.value = aim;
      const rl = $('[data-rangelabel]', row);
      rl.textContent = (Math.abs(diff) >= 5 ? (diff > 0 ? money(diff) + ' less' : money(-diff) + ' more') + ' · ' : '') + `${money(lo)}–${money(hi)}`;
      rl.className = Math.abs(diff) >= 5 ? 'moved' : '';
      updatePlanSummary(avg);
    } else if (a === 'split') {
      S.plan.split = 100 - +el.value;
      const n = planNumbers(aggregate('avg')), freed = Math.max(0, n.freed), sv = freed * S.plan.split / 100;
      const line = $('#splitLine');
      if (line) line.innerHTML = `In a year: <b>${money(sv * 12)}</b> into savings and <b>${money((freed - sv) * 12)}</b> off cards &amp; loans.`;
    } else if (a === 'income') {
      S.plan.income = +el.value || 0; updatePlanSummary();
    } else if (a === 'search') {
      allSheet(el.value);
    } else if (a === 'fname') {
      const f = S.files.find(x => x.id === el.dataset.id); f.label = el.value; save(); recompute();
    }
  });

  document.addEventListener('change', e => {
    const a = e.target.dataset.action;
    if (a === 'aim' || a === 'split' || a === 'income') save();
    if (a === 'wk') {
      const lo = +$('#wkLo').value || 0, hi = +$('#wkHi').value || 0;
      S.plan.wkLo = Math.min(lo, hi); S.plan.wkHi = Math.max(lo, hi); save();
    }
    if (a === 'fname') render();
  });

  function updatePlanSummary(avg) {
    const box = $('#planSum'); if (!box) return;
    const focused = document.activeElement && document.activeElement.dataset.action === 'split';
    avg = avg || aggregate('avg');
    const strip = $('#planStrip'); if (strip) strip.innerHTML = planStrip(avg);
    box.innerHTML = planSummary(avg);
    if (focused) { const s = $('[data-action="split"]', box); if (s) s.focus(); }
  }

  fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFiles([...fileInput.files]); });
  backupInput.addEventListener('change', () => { if (backupInput.files[0]) restore(backupInput.files[0]); });

  recompute();
  render();
  window.__monthlies = { get S() { return S; }, get D() { return D; }, aggregate };
})();
