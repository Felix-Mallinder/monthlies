/* Example statements for trying the app. Entirely made up.
   Produces three CSV files in the shapes RBS and Virgin Money tend to use. */
(function (root) {
  'use strict';

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const Mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  const D = s => new Date(s + 'T12:00:00Z');
  const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
  const iso = d => d.toISOString().slice(0, 10);
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';

  function generate() {
    const r = rng(20261121);
    const pick = a => a[Math.floor(r() * a.length)];
    const amt = (a, b) => Math.round((a + r() * (b - a)) * 100) / 100;
    const chance = p => r() < p;

    // Each entry: d (date bought), out (positive = money out), m (merchant), town, type, mcc
    const cur = [], rcc = [], vmc = [];
    const P = (list, d, out, m, o) => list.push(Object.assign({ d, out, m, town: '', type: 'POS' }, o || {}));

    const start = D('2026-08-01'), end = D('2026-10-31');
    const trips = { '2026-08-11': 1, '2026-09-01': 1, '2026-09-23': 1, '2026-10-13': 1, '2026-10-27': 2 };
    const away = new Set();
    Object.keys(trips).forEach(k => { for (let i = 0; i <= trips[k]; i++) away.add(iso(addDays(D(k), i))); });
    const holiday = new Set(['2026-09-18', '2026-09-19', '2026-09-20']);
    const cafes = [
      ['SQ *HOLLOW OAK CAFE', 7.2, 10.9, 0.55],
      ['SUMUP *MARGOT BAKEHOUSE', 6.5, 9.8, 0.2],
      ['ZETTLE_*THE WEE PANTRY', 7.8, 11.5, 0.15],
      ['SQ *FERN & FIG', 8.5, 12.4, 0.1]
    ];
    const pickCafe = () => { let x = r(); for (const c of cafes) { if ((x -= c[3]) <= 0) return c; } return cafes[0]; };
    const londonDinners = ['SQ *CORNER KITCHEN', 'DISHOOM', 'PIZZA PILGRIMS', 'SUMUP *LITTLE NAPLES TRATTORIA'];
    const cardPayVM = [420, 515, 480], cardPayRBS = [850, 920, 880], interest = [19.84, 21.37, 22.91];

    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const k = iso(d), dow = d.getUTCDay(), dom = d.getUTCDate(), mi = d.getUTCMonth() - 7;
      const weekday = dow >= 1 && dow <= 5;
      const isAway = away.has(k), isHol = holiday.has(k);

      // ----- Monthly fixed on the current account
      if (dom === 1) { P(cur, d, 1240, 'HALIFAX MORTGAGE', { type: 'D/D' }); P(cur, d, 50, 'E CAMPBELL', { type: 'S/O' }); }
      if (dom === 2) P(cur, d, 214, 'CITY OF EDINBURGH COUNCIL', { type: 'D/D' });
      if (dom === 3) P(cur, d, 148, 'OCTOPUS ENERGY', { type: 'D/D' });
      if (dom === 6) P(cur, d, cardPayVM[mi], 'VIRGIN MONEY CC 5521', { type: 'DPC' });
      if (dom === 7) P(vmc, d, -cardPayVM[mi], 'PAYMENT THANK YOU', { dc: 'CRDT' });
      if (dom === 8) P(cur, d, 47.5, 'BT GROUP PLC', { type: 'D/D' });
      if (dom === 10) { P(cur, d, 34, 'EE LIMITED', { type: 'D/D' }); P(cur, d, 14.5, 'TV LICENCE MBP', { type: 'D/D' }); }
      if (dom === 12) { P(cur, d, 41.2, 'AVIVA INSURANCE', { type: 'D/D' }); P(cur, d, 28, 'SCOTTISH WIDOWS', { type: 'D/D' }); }
      if (dom === 15) { P(cur, d, 45, 'BANNATYNE HEALTH CLUB', { type: 'D/D' }); P(cur, d, 10, 'CANCER RESEARCH UK', { type: 'D/D' }); }
      if (dom === 22) P(cur, d, cardPayRBS[mi], 'RBS CREDIT CARD', { type: 'D/D' });
      if (dom === 23) P(rcc, d, -cardPayRBS[mi], 'PAYMENT RECEIVED - THANK YOU');
      if (dom === 25) P(cur, d, -4350, 'BRIGHTWATER CONSULTING SALARY', { type: 'BAC' });
      if (dom === 28) P(cur, d, 250, 'TFR TO SAVINGS 40011223', { type: 'TFR' });

      // ----- Subscriptions on the RBS credit card
      if (dom === 5) P(rcc, d, 12.99, 'NETFLIX.COM', { town: 'AMSTERDAM NL' });
      if (dom === 9) P(rcc, d, 8.99, 'AMAZON PRIME*2K4LM', { town: 'AMAZON.CO.UK' });
      if (dom === 12) P(rcc, d, 11.99, 'SPOTIFY', { town: 'STOCKHOLM SE' });
      if (dom === 15) P(rcc, d, 8.99, 'AUDIBLE UK', { town: 'LONDON GB' });
      if (dom === 18) { P(rcc, d, interest[mi], 'PURCHASE INTEREST'); P(rcc, d, 39, 'CLASSPASS', { town: 'LONDON GB' }); }
      if (dom === 20) P(rcc, d, 2.99, 'APPLE.COM/BILL', { town: 'CORK IE' });

      // ----- HelloFresh weekly on Virgin
      if (dow === 3) P(vmc, d, 39.99, 'HELLOFRESH', { town: 'LONDON', mcc: 5499 });

      // ----- Workdays at home: train + café lunch + sometimes a morning coffee
      if (weekday && !isAway && !isHol) {
        if (chance(0.9)) P(cur, d, 9.6, 'SCOTRAIL', { town: 'GLASGOW GB' });
        if (chance(0.82)) { const c = pickCafe(); P(cur, d, amt(c[1], c[2]), c[0], { town: 'EDINBURGH GB' }); }
        if (chance(0.4)) P(cur, d, amt(3.2, 4.3), 'SUMUP *MARGOT BAKEHOUSE', { town: 'EDINBURGH GB' });
        if (chance(0.25)) P(cur, d, amt(6, 24), pick(['SCOTMID', 'SAINSBURYS S/MKTS', 'M&S SIMPLY FOOD']), { town: 'EDINBURGH GB' });
      }

      // ----- Work trips: train, hotel, dinner away, coffee next morning, a taxi
      if (trips[k]) {
        P(rcc, d, amt(72, 128), 'LNER', { town: 'YORK GB' });
        for (let n = 0; n < trips[k]; n++) {
          const nd = addDays(d, n);
          P(rcc, nd, amt(89, 149), pick(['PREMIER INN 44', 'HILTON LONDON', 'TRAVELODGE KINGS CROSS']), { town: 'LONDON GB' });
          P(rcc, nd, amt(24, 46), pick(londonDinners), { town: 'LONDON GB' });
          P(cur, addDays(nd, 1), amt(4.5, 9.8), 'PRET A MANGER', { town: 'LONDON GB' });
          if (chance(0.6)) P(vmc, nd, amt(11, 26), 'UBER *TRIP', { town: 'LONDON', mcc: 4121 });
        }
      }

      // ----- Weekends
      if (dow === 6 && !isHol) {
        P(cur, d, amt(68, 138), pick(['WAITROSE 123', 'WAITROSE 123', 'SAINSBURYS S/MKTS']), { town: 'EDINBURGH GB' });
        if (chance(0.6)) P(cur, d, amt(18, 32), 'SQ *FERN & FIG', { town: 'EDINBURGH GB' });
        if (chance(0.5)) P(cur, d, amt(12, 45), pick(['SUMUP *PAPER & THREAD', 'SQ *HEARTH HOMEWARE', 'ZETTLE_*STOCKBRIDGE MARKET']), { town: 'EDINBURGH GB' });
        if (chance(0.45)) P(rcc, d, amt(18, 42), pick(['THE GARDENERS ARMS', 'BREWDOG EDINBURGH']), { town: 'EDINBURGH GB' });
        if (chance(0.25)) P(vmc, d, amt(14, 38), 'ETSY.COM', { town: 'DUBLIN', mcc: 5999 });
      }
      if ((dow === 5 || dow === 6) && !isHol && chance(0.55)) {
        P(rcc, d, amt(42, 96), pick(['SQ *OSTERIA LUNA', 'SQ *OSTERIA LUNA', 'WAGAMAMA', 'SUMUP *THE BISTRO AT No 9']), { town: 'EDINBURGH GB' });
      }
      if (dow === 5 && !isAway && chance(0.4)) P(rcc, d, amt(24, 38), 'DELIVEROO', { town: 'LONDON GB' });
      if (dow === 0 && chance(0.3)) P(vmc, d, amt(12, 26), pick(['CINEWORLD', 'WATERSTONES']), { town: 'EDINBURGH', mcc: pick([7832, 5942]) });
    }

    // ----- One-offs and occasional
    const one = (list, s, out, m, o) => P(list, D(s), out, m, o);
    one(vmc, '2026-08-03', 212.4, 'EASYJET', { town: 'LUTON', mcc: 4511 });
    one(vmc, '2026-08-03', 395, 'AIRBNB * HMX42K', { town: 'LONDON', mcc: 7011 });
    one(vmc, '2026-09-19', 45.2, 'RESTAURANTE O FAROL', { town: 'LISBOA', mcc: 5812 });
    one(vmc, '2026-09-19', 1.24, 'NON-STERLING TRANSACTION FEE', {});
    one(vmc, '2026-09-19', 9.8, 'PASTELARIA SAO ROQUE', { town: 'LISBOA', mcc: 5814 });
    one(vmc, '2026-09-20', 62.5, 'TABERNA DA RUA', { town: 'LISBOA', mcc: 5812 });
    one(vmc, '2026-09-20', 12.4, 'UBER *TRIP', { town: 'LISBOA', mcc: 4121 });
    one(vmc, '2026-08-15', 86, 'SEASALT CORNWALL', { town: 'EDINBURGH', mcc: 5651 });
    one(vmc, '2026-08-22', -86, 'SEASALT CORNWALL', { town: 'EDINBURGH', mcc: 5651, dc: 'CRDT' });
    one(vmc, '2026-10-04', 118, 'JOHN LEWIS', { town: 'EDINBURGH', mcc: 5311 });
    one(vmc, '2026-09-12', 6.99, 'MOONPIG', { town: 'GUERNSEY', mcc: 5947 });
    one(vmc, '2026-10-17', 25, 'SQ *THE FLOWER STALL', { town: 'EDINBURGH', mcc: 5992 });
    one(rcc, '2026-08-08', 94, 'COS', { town: 'EDINBURGH GB' });
    one(rcc, '2026-10-10', 128, 'JIGSAW', { town: 'EDINBURGH GB' });
    one(rcc, '2026-09-26', 38, 'SPACE NK', { town: 'EDINBURGH GB' });
    ['2026-08-14', '2026-09-25', '2026-10-30'].forEach(s => one(rcc, s, 72, 'SALON SOLEIL', { town: 'EDINBURGH GB' }));
    ['2026-08-05', '2026-08-19', '2026-09-03', '2026-09-16', '2026-10-01', '2026-10-21'].forEach(s => one(cur, s, amt(6, 28), 'BOOTS', { town: 'EDINBURGH GB' }));
    ['2026-08-02', '2026-08-17', '2026-08-29', '2026-09-09', '2026-09-27', '2026-10-06', '2026-10-15', '2026-10-24'].forEach(s => one(rcc, s, amt(8, 45), 'AMAZON.CO.UK*' + Math.floor(r() * 1e6).toString(36).toUpperCase(), { town: 'AMAZON.CO.UK' }));
    one(cur, '2026-08-21', 35, 'S HUGHES', { type: 'DPC' });
    one(cur, '2026-08-30', 60, 'M ROSS', { type: 'DPC' });
    one(cur, '2026-10-11', 60, 'M ROSS', { type: 'DPC' });
    one(cur, '2026-09-05', 40, 'RBS PRINCES ST', { type: 'C/L' });
    one(cur, '2026-10-17', 40, 'RBS PRINCES ST', { type: 'C/L' });

    // ----- Format: RBS current account (newest first, posted a day or two after purchase)
    const rbsDate = d => pad(d.getUTCDate()) + ' ' + Mon[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    const cardDate = d => pad(d.getUTCDate()) + MON[d.getUTCMonth()] + String(d.getUTCFullYear()).slice(2);
    const posted = e => (e.type === 'POS' ? addDays(e.d, e.d.getUTCDay() === 6 ? 2 : e.d.getUTCDay() === 0 ? 1 : 1) : e.d);
    const byDate = (a, b) => posted(a) - posted(b);

    cur.sort(byDate);
    let bal = 3120.55;
    const curRows = cur.map(e => {
      bal = Math.round((bal - e.out) * 100) / 100;
      const desc = e.type === 'POS' ? `4371 ${cardDate(e.d)} , ${e.m} , ${e.town}` : e.type === 'C/L' ? `${e.m} ${cardDate(e.d)}` : e.m;
      return [rbsDate(posted(e)), e.type, q("'" + desc), (-e.out).toFixed(2), bal.toFixed(2), q("'SELECT ACCOUNT"), q("'832176-10442817")].join(',');
    }).reverse();
    const curCsv = ['Date,Type,Description,Value,Balance,Account Name,Account Number', ...curRows].join('\r\n');

    // ----- RBS credit card: purchases shown positive, payments negative, fixed-width description
    rcc.sort(byDate);
    const rccRows = rcc.map(e => {
      const desc = e.town ? (e.m + ' '.repeat(Math.max(3, 25 - e.m.length)) + e.town) : e.m;
      return [rbsDate(e.d), e.out < 0 ? 'CREDIT' : 'PURCHASE', q("'" + desc), e.out.toFixed(2), '', q("'RBS CREDIT CARD"), q("'************4419")].join(',');
    }).reverse();
    const rccCsv = ['Date,Type,Description,Value,Balance,Account Name,Account Number', ...rccRows].join('\r\n');

    // ----- Virgin Money credit card
    const uk = d => pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    vmc.sort((a, b) => a.d - b.d);
    const vmRows = vmc.map((e, i) => [
      uk(e.d), uk(addDays(e.d, 1)), Math.abs(e.out).toFixed(2), q(e.m), q(e.town || ''), '', '',
      '7451' + String(100000 + i), e.out < 0 ? 'CRDT' : 'DBIT', e.mcc || '', 'Posted', 'GBP', 'N', '9021'
    ].join(','));
    const vmCsv = ['Transaction Date,Posting Date,Billing Amount,Merchant,Merchant City,Merchant State,Merchant Postcode,Reference Number,Debit or Credit,SICMCC Code,Status,Transaction Currency,Additional Card Holder,Card Used', ...vmRows].join('\r\n');

    return [
      { name: 'RBS current account.csv', text: curCsv },
      { name: 'RBS credit card.csv', text: rccCsv },
      { name: 'Virgin Money credit card.csv', text: vmCsv }
    ];
  }

  const api = { generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SampleStatements = api;
})(typeof window !== 'undefined' ? window : globalThis);
