/* Reads bank statement PDFs (RBS/NatWest-style tables: Date | Description | Paid in | Withdrawn | Balance)
   and turns them into a simple CSV the rest of the app already understands. Runs on the device using
   Mozilla's pdf.js, stored alongside the app — nothing is sent anywhere. */
(function (root) {
  'use strict';
  let lib = null;
  async function pdfjs() {
    if (lib) return lib;
    lib = await import('./vendor/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;
    return lib;
  }

  const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const pad = n => String(n).padStart(2, '0');
  const AMOUNT = /^£?\d{1,3}(,\d{3})*\.\d{2}$/;
  const DATE_START = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?\b/;
  const STOP = /^(Debit interest|Interest \(variable\)|Overdraft Arrangements|Statement Abbreviations|RETSTMT|The Royal Bank of Scotland plc|National Westminster Bank|Important information|Summary of interest)/i;

  // Group text pieces into lines (same height on the page), left to right
  function toLines(items) {
    const rows = [];
    items.forEach(it => {
      const s = it.str.trim(); if (!s) return;
      const x = it.transform[4], y = it.transform[5], w = it.width || 0;
      let row = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ s, x, r: x + w });
    });
    rows.sort((a, b) => b.y - a.y);
    rows.forEach(r => { r.items.sort((a, b) => a.x - b.x); r.text = r.items.map(i => i.s).join(' '); });
    return rows;
  }

  function findHeader(lines) {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].text.toLowerCase();
      if (/\bdate\b/.test(t) && /description|details|transaction/.test(t) && /(paid in|money in|credits?|deposits)/.test(t) && /(withdrawn|paid out|money out|debits?|payments)/.test(t)) {
        const col = re => { const it = lines[i].items.find(x => re.test(x.s.toLowerCase())); return it || null; };
        // Header words can be split across pieces; fall back to searching the joined text
        const inIt = col(/paid in|money in|credit|deposit/), outIt = col(/withdrawn|paid out|money out|debit|payments/), balIt = col(/balance/);
        const descIt = col(/description|details|transaction/), dateIt = col(/^date/);
        if (!inIt || !outIt) continue;
        return { index: i, date: dateIt ? dateIt.x : 0, desc: descIt ? descIt.x : 60, inR: inIt.r, outR: outIt.r, balR: balIt ? balIt.r : null };
      }
    }
    return null;
  }

  function periodStart(text) {
    const m = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s+(?:to|-)\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i);
    if (m) return { y: +m[3], m: MON[m[2].toUpperCase()] };
    const y = text.match(/\b(20\d{2})\b/);
    return y ? { y: +y[1], m: 1 } : { y: new Date().getFullYear(), m: 1 };
  }

  async function read(file) {
    const { getDocument } = await pdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(toLines(content.items));
    }
    const allText = pages.map(ls => ls.map(l => l.text).join('\n')).join('\n');
    const start = periodStart(allText);
    const bank = /Royal Bank of Scotland/i.test(allText) ? 'RBS' : /NatWest|National Westminster/i.test(allText) ? 'NatWest' : '';
    // Account holder (e.g. "MR FELIX J MALLINDER" → "FELIX MALLINDER"), used to spot payments to yourself
    let holder = '';
    const first = pages[0] || [];
    const hi = first.findIndex(l => /^Account Name/i.test(l.text));
    if (hi >= 0 && first[hi + 1]) {
      const raw = first[hi + 1].items[0].s.replace(/\d.*$/, '');
      holder = raw.toUpperCase().replace(/\b(MR|MRS|MS|MISS|DR|MX)\b\.?/g, ' ').split(/\s+/).filter(w => w.length > 1).join(' ');
    }
    const acctType =(allText.match(/\n([A-Z][A-Z ]{3,30}(CURRENT|ACCOUNT|SAVER|CARD))\n/) || [])[1] || '';

    const rows = [];
    let curDate = null, desc = [];
    const flush = (pin, pout) => {
      const d = desc.join(' ').replace(/\s+/g, ' ').trim();
      if (curDate && d && !/BROUGHT FORWARD|CARRIED FORWARD|BALANCE FORWARD/i.test(d)) rows.push([curDate, d, pin || '', pout || '']);
      desc = [];
    };

    pages.forEach(lines => {
      const h = findHeader(lines);
      if (!h) return;
      const near = (r, target) => target != null && Math.abs(r - target) < 40;
      for (let i = h.index + 1; i < lines.length; i++) {
        const L = lines[i];
        if (STOP.test(L.text)) break;
        let pin = '', pout = '', textParts = [];
        L.items.forEach(it => {
          const s = it.s.replace(/^£/, '');
          if (AMOUNT.test(it.s) && it.x > h.desc + 40) {
            const dIn = Math.abs(it.r - h.inR), dOut = Math.abs(it.r - h.outR), dBal = h.balR != null ? Math.abs(it.r - h.balR) : 1e9;
            const best = Math.min(dIn, dOut, dBal);
            if (best === dIn && near(it.r, h.inR)) pin = s;
            else if (best === dOut && near(it.r, h.outR)) pout = s;
            return; // balance or stray number
          }
          if (/^(OD|CR|DR)$/.test(it.s) && h.balR != null && it.x > h.outR) return;
          textParts.push(it);
        });
        // A date at the start of the line begins a new day
        const lead = textParts.length && textParts[0].x < h.desc - 5 ? textParts[0] : null;
        let rest = textParts;
        if (lead) {
          const dm = (lead.s + ' ' + (textParts[1] && textParts[1].x < h.desc - 5 ? textParts[1].s : '')).match(DATE_START);
          if (dm && MON[dm[2].toUpperCase()]) {
            const mo = MON[dm[2].toUpperCase()];
            const yr = dm[3] ? +dm[3] : (mo < start.m ? start.y + 1 : start.y);
            if (desc.length) desc = []; // unfinished text from a previous row (e.g. brought forward) is dropped
            curDate = `${yr}-${pad(mo)}-${pad(+dm[1])}`;
            rest = textParts.filter(p => p.x >= h.desc - 5);
          }
        }
        const t = rest.map(p => p.s).join(' ').trim();
        if (t) desc.push(t);
        if (pin || pout) flush(pin, pout);
      }
    });

    if (!rows.length) return { error: 'pdf-unreadable' };
    const csv = ['Date,Description,Paid in,Paid out'].concat(rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))).join('\n');
    const base = file.name.replace(/\.pdf$/i, '');
    const label = bank ? `${bank} ${acctType ? acctType.toLowerCase() : 'statement'}` : base;
    return { name: label + '.csv', text: csv, count: rows.length, holder };
  }

  root.PdfReader = { read };
})(window);
