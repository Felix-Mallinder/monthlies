/* Monthlies — statement reading and sorting. Runs entirely on the device. */
(function (root) {
  'use strict';

  // ---------- Categories ----------
  const CATS = [
    ['mortgage', 'Mortgage & rent', 'home', 1],
    ['bills', 'Bills & utilities', 'home', 1],
    ['insurance', 'Insurance', 'home', 1],
    ['homegarden', 'Home & garden', 'home', 0],
    ['shop', 'Weekly shop', 'food', 0],
    ['cafe', 'Café lunches & coffee', 'food', 0],
    ['dinners', 'Dinners & eating out', 'food', 0],
    ['takeaway', 'Takeaways', 'food', 0],
    ['drinks', 'Drinks & pubs', 'food', 0],
    ['commute', 'Commute', 'travel', 1],
    ['car', 'Car & fuel', 'travel', 0],
    ['taxis', 'Taxis', 'travel', 0],
    ['travel', 'Trips & holidays', 'travel', 0],
    ['worktrips', 'Midweek expenses', 'work', 0],
    ['indie', 'Shops & treats', 'shopping', 0],
    ['clothes', 'Clothes & shoes', 'shopping', 0],
    ['online', 'Online shopping', 'shopping', 0],
    ['gifts', 'Gifts & flowers', 'shopping', 0],
    ['care', 'Personal care', 'you', 0],
    ['health', 'Health & fitness', 'you', 0],
    ['hobbies', 'Books, culture & days out', 'you', 0],
    ['subs', 'Subscriptions', 'commit', 0],
    ['debt', 'Loans & credit', 'commit', 1],
    ['interest', 'Interest & charges', 'commit', 1],
    ['charity', 'Charity', 'commit', 0],
    ['people', 'Payments to people', 'people', 0],
    ['cash', 'Cash', 'other', 0],
    ['other', 'Everything else', 'other', 0],
    ['transfer', 'Between your accounts', 'none', 1],
    ['savings', 'Into savings', 'none', 1],
    ['income', 'Money in', 'none', 1]
  ].map(([id, name, group, fixed]) => ({ id, name, group, fixed: !!fixed }));
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

  const GROUPS = [
    ['home', 'Home'], ['food', 'Food & drink'], ['travel', 'Getting about'], ['work', 'Midweek expenses'],
    ['shopping', 'Shopping'], ['you', 'You'], ['commit', 'Commitments'], ['people', 'People'], ['other', 'Other']
  ].map(([id, name]) => ({ id, name }));

  const NOT_SPEND = new Set(['transfer', 'savings', 'income']);

  // ---------- Merchant rules (checked in order, against the cleaned merchant name) ----------
  const RULES = [
    [/UBER\s*\*?\s*EATS|DELIVEROO|JUST\s?EAT|DOMINO|PAPA JOHN|\bKFC\b|MCDONALD|BURGER KING|FIVE GUYS/, 'takeaway'],
    [/MORTGAGE|\bMTG\b|LETTINGS|\bRENT\b/, 'mortgage'],
    [/NETFLIX|SPOTIFY|DISNEY|PRIME VIDEO|AMAZON PRIME|AMZN PRIME|PRIME MEMBER|AUDIBLE|APPLE\.COM|ITUNES|ICLOUD|GOOGLE (ONE|STORAGE|PLAY)|YOUTUBE|NOW ?TV|PATREON|MICROSOFT|ADOBE|GUARDIAN|THE TIMES|ECONOMIST|SUBSTACK|KINDLE|PARAMOUNT|BRITBOX|DUOLINGO|HEADSPACE|CALM\.COM|CLASSPASS|CANVA|DROPBOX|LINKEDIN|OPENAI|CHATGPT/, 'subs'],
    [/WATERSTONES|BLACKWELL|FOYLES|CINEMA|CINEWORLD|ODEON|\bVUE\b|CURZON|PICTUREHOUSE|EVERYMAN|TICKETMASTER|SEE TICKETS|EVENTBRITE|NATIONAL TRUST|HISTORIC ENV|ENGLISH HERITAGE|THEATRE|MUSEUM|FESTIVAL|FRINGE|CONCERT|LYCEUM|PLAYHOUSE|USHER HALL|HOBBYCRAFT|BOOKSHOP|BOOKS\b/, 'hobbies'],
    [/COUNCIL|OCTOPUS|BRITISH GAS|\bEDF\b|\bE\.?ON\b|\bOVO\b|SCOTTISH ?POWER|\bSSE\b|SO ENERGY|\bWATER\b|\bBT\b|\bSKY\b|VIRGIN MEDIA|PLUSNET|TALKTALK|VODAFONE|\bEE\b|\bO2\b|THREE\.CO|GIFFGAFF|TV LICEN|HYPEROPTIC|COMMUNITY FIBRE|ID MOBILE|TESCO MOBILE|SMARTY|LEBARA/, 'bills'],
    [/INSURANCE|AVIVA|DIRECT LINE|ADMIRAL|\bLV\b|LIVERPOOL VICTORIA|CHURCHILL|LEGAL (&|AND) GENERAL|SCOTTISH WIDOWS|ROYAL LONDON|VITALITY|\bAXA\b|HASTINGS|PETPLAN|ZURICH|PRUDENTIAL|BUPA/, 'insurance'],
    [/PREMIER INN|TRAVELODGE|HILTON|MARRIOTT|\bIBIS\b|HOLIDAY INN|NOVOTEL|RADISSON|MERCURE|CROWNE PLAZA|HOTEL|BOOKING\.COM|MALMAISON|HAMPTON BY|DOUBLETREE|\bMOXY\b|CITIZENM|\bHUB BY\b|JURYS|\bAPEX\b|VILLAGE HOTEL|EASYHOTEL|ZEDWELL|LEONARDO/, 'travel', { hotel: true }],
    [/EASYJET|RYANAIR|BRITISH AIRWAYS|\bJET2|LOGANAIR|\bTUI\b|EXPEDIA|AIRBNB|LOVEHOLIDAYS|VUELING|WIZZ|\bKLM\b|LUFTHANSA|AER LINGUS|EMIRATES|TAP AIR|SKYSCANNER|\bVRBO\b|SYKES|HOSEASONS|AIRPORT/, 'travel'],
    [/TRAINLINE|\bLNER\b|AVANTI|\bGWR\b|GREAT WESTERN|CROSS ?COUNTRY|EAST MIDLANDS RAIL|CALEDONIAN SLEEPER|EUROSTAR|TRANSPENNINE|CHILTERN|\bLUMO\b|GRAND CENTRAL|HULL TRAINS|NATIONAL RAIL/, 'travel', { rail: true }],
    [/SCOTRAIL|NORTHERN RAIL|^NORTHERN\b|SOUTHERN RAIL|THAMESLINK|\bTFL\b|TRANSPORT FOR LONDON|LOTHIAN|FIRST ?BUS|STAGECOACH|ARRIVA|MERSEYRAIL|SOUTH WESTERN|SOUTHEASTERN|\bC2C\b|GREATER ANGLIA|METROLINK|EDINBURGH TRAMS|BEE NETWORK|MCGILL|\bSPT\b|\bNEXUS\b|ELIZABETH LINE/, 'commute', { rail: true }],
    [/\bUBER\b|\bBOLT\b|FREE ?NOW|ADDISON LEE|CITY CABS|TAXI|\bCABS?\b|\bGETT\b/, 'taxis'],
    [/\bSHELL\b|\bBP\b|\bESSO\b|TEXACO|\bJET\b|\bGULF\b|MURCO|PETROL|\bFUEL|RINGGO|PAYBYPHONE|\bNCP\b|PARKING|DVLA|KWIK FIT|HALFORDS|CAR WASH|\bRAC\b|POD POINT|CHARGEPOINT|IONITY|INSTAVOLT/, 'car'],
    [/TESCO|SAINSBURY|\bASDA\b|MORRISONS|WAITROSE|\bALDI\b|\bLIDL\b|\bCO-?OP\b|CO OP|COOPERATIVE|OCADO|ICELAND|SCOTMID|FARMFOODS|\bSPAR\b|\bNISA\b|BUDGENS|WHOLE ?FOODS|PLANET ORGANIC|M ?& ?S SIMPLY|SIMPLY FOOD|M ?& ?S FOOD|HELLO ?FRESH|GOUSTO|MINDFUL CHEF|ABEL (&|AND) COLE|RIVERFORD|\bBOOTHS\b|AMAZON FRESH/, 'shop'],
    [/\bPRET\b|GREGGS|\bCOSTA\b|STARBUCKS|\bNERO\b|\bLEON\b|\bITSU\b|WASABI|BENUGO|BLACK SHEEP|\bGAIL|SUBWAY|TIM HORTONS|\bEAT\.|LEON RESTAURANTS/, 'cafe'],
    [/NANDO|WAGAMAMA|PIZZA EXPRESS|PIZZAEXPRESS|\bZIZZI|ASK ITALIAN|DISHOOM|FRANCO MANCA|PIZZA PILGRIMS|HONEST BURGER|\bBYRON\b|YO ?SUSHI|CAFE ROUGE|\bBILLS\b|\bTGI\b|GAUCHO|HAWKSMOOR|BRASSERIE BLANC|\bCOTE\b|TOBY CARVERY|HARVESTER|LAS IGUANAS|TURTLE BAY|BELLA ITALIA|PREZZO|CHIQUITO|MIZNON|BANANA TREE/, 'dinners'],
    [/WETHERSPOON|BREWDOG|NICHOLSON|GREENE KING|MITCHELLS|\bYOUNGS?\b|FULLERS|ALL BAR ONE|SLUG (&|AND) LETTUCE|REVOLUTION|OAKMAN|STONEGATE|MARSTONS/, 'drinks'],
    [/BOOTS|SUPERDRUG|SPACE ?NK|\bLUSH\b|SALON|\bHAIR|BARBER|BEAUTY|\bNAILS?\b|\bSPA\b|AESOP|BODY SHOP|KIEHL|SEPHORA|CULT BEAUTY|LOOKFANTASTIC|BENEFIT|CHARLOTTE TILBURY|NEALS YARD|TREATWELL|\bBROWS?\b|\bLASH|MAKE ?UP/, 'care'],
    [/PURE ?GYM|DAVID LLOYD|NUFFIELD|VIRGIN ACTIVE|BANNATYNE|ANYTIME FITNESS|THE GYM|\bGYM\b|YOGA|PILATES|\bBARRE\b|PELOTON|STRAVA|PHARMACY|CHEMIST|DENTAL|DENTIST|OPTICIAN|SPECSAVERS|VISION EXPRESS|PHYSIO|OSTEO|CHIRO|CLINIC|\bNHS\b|PRESCRIPTION|LEISURE|HEALTH CLUB/, 'health'],
    [/\bZARA\b|H ?& ?M\b|UNIQLO|\bCOS\b|ARKET|OTHER STORIES|\bNEXT\b|MARKS (&|AND) SPENCER|\bM ?& ?S\b|WHISTLES|BODEN|TK ?MAXX|PRIMARK|MONSOON|FAT ?FACE|WHITE STUFF|SEASALT|JIGSAW|\bHOBBS\b|\bREISS\b|\bMANGO\b|\bASOS\b|VINTED|CLARKS|SCHUH|JOULES|MINT VELVET|PHASE EIGHT|KAREN MILLEN|\bTOAST\b|SWEATY BETTY|LULULEMON|\bNIKE\b|ADIDAS|\bDUNE\b|RUSSELL (&|AND) BROMLEY|SELFRIDGES|HARVEY NICHOLS|ZALANDO|ANTHROPOLOGIE|\bHUSH\b|FINERY|ME ?\+ ?EM/, 'clothes'],
    [/JOHN LEWIS|\bIKEA\b|B ?& ?Q\b|WICKES|DUNELM|HABITAT|HOMESENSE|WILKO|ROBERT DYAS|SCREWFIX|TOOLSTATION|GARDEN CENT|GARDENING|LAKELAND|OLIVER BONAS|WAYFAIR|WHITE COMPANY|HOMEBASE|DOBBIES|B ?& ?M\b|THE RANGE/, 'homegarden'],
    [/AMAZON|\bAMZN|\bEBAY\b|ARGOS|CURRYS|APPLE STORE|\bAO\.COM|SHEIN|\bTEMU\b|ALIEXPRESS/, 'online'],
    [/\bETSY\b|NOTONTHEHIGHSTREET|NOT ON THE HIGH/, 'indie'],
    [/MOONPIG|FUNKY PIGEON|CARD FACTORY|PAPERCHASE|INTERFLORA|FLORIST|FLOWER|\bBLOOM|SCRIBBLER|THORNTONS|HOTEL CHOCOLAT/, 'gifts'],
    [/CHARITY|OXFAM|CANCER RESEARCH|BRITISH HEART|RSPCA|UNICEF|JUST ?GIVING|RED CROSS|MACMILLAN|MARIE CURIE|SAVE THE CHILDREN|AGE UK|SHELTER|BARNARDO|NSPCC|\bWWF\b|GREENPEACE|SAMARITANS|DOGS TRUST|CATS PROTECTION|GOFUNDME|HOSPICE/, 'charity'],
    [/\bLOAN\b|\bZOPA\b|FINANCE\b|KLARNA|CLEARPAY|LAYBUY|PAYPAL CREDIT|PAY IN 3|NEWDAY|VANQUIS|STUDENT LOAN/, 'debt'],
    [/INTEREST|LATE PAYMENT|OVERLIMIT|\bFEES?\b|\bCHARGES?\b|NON-?STERLING|COMMISSION|OVERDRAFT/, 'interest']
  ];

  // Keyword hints for independent places that aren't in any list
  const KW_CAFE = /\bCAF[EÉ]S?\b|COFFEE|ESPRESSO|BAKERY|BAKEHOUSE|\bBAKES?\b|PATISSERIE|PASTRY|PASTELARIA|\bDELI\b|DELICATESSEN|ROASTERS?|ROASTERY|\bBREW\b|\bBEANS?\b|PANTRY|CANTEEN|SANDWICH|BAGEL|TEA ?ROOM|JUICE|BRUNCH|LARDER|BOULANGERIE|KAFFE|KOFFEE/;
  const KW_DINNER = /RESTAURANT|RISTORANTE|TRATTORIA|OSTERIA|PIZZ|BISTRO|BRASSERIE|\bGRILL\b|KITCHEN|\bDINER\b|SUSHI|RAMEN|\bTHAI\b|INDIAN|CURRY|TANDOORI|MASALA|TAPAS|\bMEZE|TAVERNA|TABERNA|STEAK|SEAFOOD|OYSTER|NOODLE|CANTINA|TAQUERIA|BURGER|EATERY|DINING|SMOKEHOUSE|CHOPHOUSE|DIM SUM|\bWOK\b|\bBBQ\b/;
  const KW_DRINKS = /\bPUB\b|\bBAR\b|\bINN\b|\bARMS\b|TAVERN|\bTAP\b|TAPROOM|BREWERY|BREWING|\bWINE|COCKTAIL|SPEAKEASY|ALE ?HOUSE|DISTILLERY|BOTTLE SHOP|CELLARS?\b|VAULTS?\b/;
  const KW_SHOP = /BOUTIQUE|EMPORIUM|STUDIO|GALLERY|VINTAGE|INTERIORS|HOMEWARE|MARKET|\bSTORE\b|\bSHOP\b|& CO\b|AND CO\b|CERAMIC|POTTERY|STATIONERY|PAPER|THREAD|WORKSHOP|MAKERS|CRAFT|ANTIQUE|TRADING|SUPPLY|GOODS|COLLECTIVE|ATELIER|JEWEL/;

  const MCC = [
    [[5411, 5422, 5441, 5451, 5499], 'shop'], [[5462, 5814], 'cafe'], [[5812], 'dinners'], [[5813], 'drinks'],
    [[4111, 4131], 'commute'], [[4112], 'travel', { rail: true }], [[4121], 'taxis'], [[7011], 'travel', { hotel: true }],
    [[4511, 4722, 7512, 4411], 'travel'], [[5541, 5542, 7523, 7542, 7538], 'car'], [[5912], 'health'],
    [[7230, 7298, 5977], 'care'], [[7997, 7941, 8011, 8021, 8042, 8099], 'health'],
    [[5651, 5621, 5691, 5661, 5699, 5631, 5611, 5137, 5139], 'clothes'],
    [[5200, 5211, 5712, 5719, 5722, 5251, 5261, 5311], 'homegarden'],
    [[5942, 5994, 7832, 7922, 7991, 7996, 7999, 5945], 'hobbies'], [[5992, 5947], 'gifts'],
    [[4899, 5815, 5817, 5818], 'subs'], [[8398], 'charity'], [[6300, 5960], 'insurance'], [[4900, 4814], 'bills'], [[6011], 'cash']
  ];
  const MCC_MAP = {};
  MCC.forEach(([codes, cat, extra]) => codes.forEach(c => { MCC_MAP[c] = [cat, extra]; }));

  const CARDPAY = /VIRGIN MONEY|CREDIT ?CARD|\bCC\b|CARD PAYMENT|BARCLAYCARD|\bMBNA\b|\bAMEX\b|AMERICAN EXPRESS|CAPITAL ONE|NEWDAY|VANQUIS|TESCO BANK|MONEYBARN|\bAQUA\b|MARBLES|\bFLUID\b/;
  const TRANSFERISH = /PAYMENT|THANK|\bTFR\b|TRANSFER|\bCC\b|CARD|VIRGIN|SAVINGS|\bFROM\b|\bTO\b|DIRECT DEBIT|REPAY/;
  const SAVINGS = /SAVINGS|\bISA\b|SAVER\b|PREMIUM BONDS|NS ?& ?I|MONEYBOX|NUTMEG|VANGUARD|HARGREAVES|AJ BELL|PENSION/;
  const PERSON_TYPES = /^(DPC|BAC|TFR|FPO|FP|OBP|BP|S\/O|SO|STO|IBP|PAY|ITL)$/i;
  const BIZ = /\b(LTD|LIMITED|PLC|LLP|CO|COMPANY|SERVICES|GROUP|UK|INTERNATIONAL|TRADING|STORE|SHOP|CAFE|BANK|COUNCIL|ENERGY|INSURANCE|SAVINGS|CARD|CC|LOAN|MORTGAGE|SALARY|PAYMENT|HMRC|DVLA|SCHOOL|CLUB|CHURCH|TRUST|SOLUTIONS|HOLDINGS|PROPERTY|MANAGEMENT|HOUSING|HOME|HOMES)\b/;

  // ---------- Small helpers ----------
  const pad = n => String(n).padStart(2, '0');
  const MMM = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
  const toDate = s => new Date(s + 'T12:00:00Z');
  const dow = s => toDate(s).getUTCDay();
  const addDays = (s, n) => new Date(toDate(s).getTime() + n * 864e5).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mode = a => { const c = {}; let best = a[0], n = 0; a.forEach(x => { c[x] = (c[x] || 0) + 1; if (c[x] > n) { n = c[x]; best = x; } }); return best; };
  const mk = (y, mo, d) => (!mo || mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) ? null : `${y}-${pad(mo)}-${pad(d)}`;
  const yr = y => (String(y).length === 2 ? 2000 + +y : +y);

  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  function parseDate(s) {
    s = String(s || '').trim().replace(/^'/, '');
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/))) return mk(yr(m[3]), +m[2], +m[1]);
    if ((m = s.match(/^(\d{1,2})[\s\-]?([A-Za-z]{3,9})[\s\-,]*(\d{2,4})\b/))) return mk(yr(m[3]), MMM[m[2].slice(0, 3).toUpperCase()], +m[1]);
    return null;
  }

  function parseAmount(s) {
    s = String(s == null ? '' : s).trim().replace(/^'/, '');
    if (!s) return null;
    let neg = false, cr = false, dr = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/\bCR\.?$/i.test(s)) { cr = true; s = s.replace(/\s*CR\.?$/i, ''); }
    else if (/\bDR\.?$/i.test(s)) { dr = true; s = s.replace(/\s*DR\.?$/i, ''); }
    s = s.replace(/GBP/i, '').replace(/[£$€,\s]/g, '');
    if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
    if (!/^[+\-]?\d*\.?\d+$/.test(s)) return null;
    const n = parseFloat(s);
    return { n: neg ? -Math.abs(n) : n, cr, dr };
  }

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/).slice(0, 5).join('\n');
    const count = ch => (first.match(new RegExp('\\' + ch, 'g')) || []).length;
    const delim = count('\t') > count(',') ? '\t' : count(';') > count(',') ? ';' : ',';
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }

  function detectColumns(rows) {
    for (let h = 0; h < Math.min(rows.length, 15); h++) {
      const hdr = rows[h].map(x => x.trim().toLowerCase().replace(/^'/, ''));
      const find = res => { for (const re of res) { const i = hdr.findIndex(x => re.test(x)); if (i >= 0) return i; } return -1; };
      const date = find([/^transaction date$/, /^trans(action)?\.? ?date/, /^date$/, /date/]);
      if (date < 0) continue;
      const desc = find([/^description$/, /^merchant( name)?$/, /^(transaction )?details$/, /description|narrative|payee|merchant|particulars|memo|^name$|^transaction$/, /reference/]);
      const debit = find([/paid out|money out|debit amount|^debits?$|withdrawals?|^out$|^spent$/]);
      const credit = find([/paid in|money in|credit amount|^credits?$|deposits?|^in$|^received$/]);
      let amount = find([/^amount$/, /^billing amount$/, /^value$/, /^amount ?\(gbp\)$/, /amount|value/]);
      if (amount === debit || amount === credit) amount = -1;
      let dc = find([/debit or credit|debit\/credit|credit\/debit|dr\/cr|cr\/dr|^d\/c$|^c\/d$|^cr\/dr$/]);
      const type = find([/^type$|transaction type|^code$/]);
      const town = find([/merchant city|^city$|^town$|location/]);
      const mcc = find([/mcc|sic/]);
      const acct = find([/account name|^account$/]);
      if (desc < 0 || (amount < 0 && debit < 0 && credit < 0)) continue;
      // A "Type" column that only holds debit/credit words acts as the indicator
      if (dc < 0 && type >= 0) {
        const vals = rows.slice(h + 1, h + 30).map(r => (r[type] || '').trim().toUpperCase()).filter(Boolean);
        if (vals.length && vals.every(v => /^(DEBIT|CREDIT|DBIT|CRDT|DR|CR|D|C)$/.test(v))) dc = type;
      }
      return { header: h, date, desc, amount, debit, credit, dc, type: type === dc ? -1 : type, town, mcc, acct };
    }
    return null;
  }

  const PROC = /^(SQ ?\*|SUM ?UP ?\*|ZETTLE_?\*?|IZ ?\*|IZETTLE ?\*?|SP ?\*|TP ?\*|DOJO ?\*|CRV ?\*|SMP ?\*|PAYPAL ?\*|PP ?\*|STRIPE ?\*)\s*/i;
  const INDIE_PROC = /^(SQ ?\*|SUM ?UP|ZETTLE|IZ ?\*|IZETTLE|SP ?\*|TP ?\*|DOJO|CRV ?\*|SMP ?\*)/i;

  function titleCase(s) {
    const small = new Set(['of', 'and', 'the', 'at', 'in', 'on', 'for', 'de', 'da', 'la', 'le', 'a', 'o']);
    return s.toLowerCase().split(' ').map((w, i) => {
      if (!w) return w;
      const bare = w.replace(/[^a-z]/g, '');
      if (bare.length >= 2 && bare.length <= 4 && !/[aeiouy]/.test(bare)) return w.toUpperCase();
      if (bare.length <= 2 && i === 0 && w.length <= 3 && !/[aeiouy]/.test(bare)) return w.toUpperCase();
      if (i > 0 && small.has(w)) return w;
      if (w === 'ee' || w === 'bt' || w === 'tv' || w === 'uk') return w.toUpperCase();
      return w.replace(/(^|[\-\/(&'.])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\.Com\b/g, '.com').replace(/\.Co\.Uk\b/g, '.co.uk').replace(/'S\b/g, "'s");
    }).join(' ');
  }

  function keyOf(display) {
    const k = display.toUpperCase().replace(/\bAMZN\w*/g, 'AMAZON').replace(/[^A-Z& ]/g, ' ')
      .replace(/\b(LTD|LIMITED|PLC|UK|GB|THE|COM|CO|WWW|ONLINE|STORES?)\b/g, ' ')
      .split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    return k || display.toUpperCase();
  }

  function cleanDesc(raw, townCol) {
    let s = String(raw || '').replace(/^'+/, '').trim();
    let merch = s, town = (townCol || '').trim(), tdate = null, m;
    if ((m = s.match(/^\d{4}\s+(\d{2})([A-Z]{3})(\d{2})\s*[A-Z]?\s*,\s*(.*)$/i))) {
      tdate = mk(2000 + +m[3], MMM[m[2].toUpperCase()], +m[1]);
      const rest = m[4].split(/\s*,\s*/);
      merch = rest[0]; if (!town) town = rest[1] || '';
    } else if (/\s,\s/.test(s)) {
      const parts = s.split(/\s*,\s*/); merch = parts[0]; if (!town && parts[1]) town = parts[1];
    } else {
      const parts = s.split(/\s{3,}/);
      if (parts.length >= 2) { merch = parts[0]; if (!town) town = parts.slice(1).join(' '); }
    }
    if ((m = merch.match(/\s(\d{2})([A-Z]{3})(\d{2})$/i)) && MMM[m[2].toUpperCase()]) {
      tdate = tdate || mk(2000 + +m[3], MMM[m[2].toUpperCase()], +m[1]);
      merch = merch.slice(0, m.index);
    }
    merch = merch.replace(/\s+/g, ' ').trim();
    const indie = INDIE_PROC.test(merch);
    merch = merch.replace(PROC, '');
    merch = merch.replace(/\s\b(REF|REFERENCE|FP|BGC|DDR)\b[\s:.].*$/i, '').replace(/\s+\d{2}\/\d{2}\/\d{2,4}.*$/, '');
    let display = merch.replace(/\*\s*[A-Z0-9]{4,}\b/gi, '').replace(/\b[A-Z]*\d[A-Z\d]{3,}\b/gi, '')
      .replace(/\s+\d+\s*$/, '').replace(/\s*\*\s*$/, '').replace(/\s{2,}/g, ' ').trim() || merch || s;
    town = town.replace(/\s+[A-Z]{2,3}$/i, t => (/^\s+(GB|GBR|UK|NL|IE|US|PT|FR|ES|DE|IT|LU|SE|BE|DK|NO|CH|AT)$/i.test(t) ? '' : t))
      .replace(/\s+/g, ' ').trim().toUpperCase();
    if (/\d|\.COM|\.CO|WWW|HTTP/i.test(town) || town.length < 3) town = '';
    const mu = display.toUpperCase();
    return { merch: titleCase(display), mu, key: keyOf(display), town, tdate, indie };
  }

  // ---------- Import ----------
  // Returns {txns, meta} or {error}
  function readFile(name, text, mapOverride) {
    const rows = parseCSV(text);
    if (!rows.length) return { error: 'empty' };
    const map = mapOverride || detectColumns(rows);
    if (!map) return { error: 'columns', rows };
    const parsed = [];
    let hasSuffix = false;
    for (let i = map.header + 1; i < rows.length; i++) {
      const r = rows[i];
      const date = parseDate(r[map.date]);
      if (!date) continue;
      const desc = (r[map.desc] || '').trim().replace(/^'/, '');
      let a = null, d = null, c = null;
      if (map.amount >= 0) { a = parseAmount(r[map.amount]); if (!a) continue; if (a.cr || a.dr) hasSuffix = true; }
      else { d = parseAmount(r[map.debit]); c = parseAmount(r[map.credit]); if (!d && !c) continue; }
      parsed.push({ r, date, desc, a, d, c });
    }
    if (!parsed.length) return { error: 'norows', rows };
    let txns = parsed.map(p => {
      let o;
      if (p.a) {
        if (map.dc >= 0) { const ind = (p.r[map.dc] || '').trim().toUpperCase(); o = /^(C|CR|CRDT|CREDIT|IN)/.test(ind) ? -Math.abs(p.a.n) : Math.abs(p.a.n); }
        else if (hasSuffix) o = p.a.cr ? -Math.abs(p.a.n) : Math.abs(p.a.n);
        else o = -p.a.n; // most banks: negative = money out
      } else o = (p.d ? Math.abs(p.d.n) : 0) - (p.c ? Math.abs(p.c.n) : 0);
      const cl = cleanDesc(p.desc, map.town >= 0 ? p.r[map.town] : '');
      const mccN = map.mcc >= 0 ? parseInt(p.r[map.mcc], 10) : NaN;
      return {
        d: p.date, td: cl.tdate, desc: p.desc, merch: cl.merch, mu: cl.mu, key: cl.key, town: cl.town, indie: cl.indie,
        type: map.type >= 0 ? (p.r[map.type] || '').trim().replace(/^'/, '') : '', mcc: isFinite(mccN) ? mccN : null,
        o: Math.round(o * 100) / 100
      };
    }).filter(t => t.o !== 0);
    let flipped = false;
    if (map.amount >= 0 && map.dc < 0 && !hasSuffix) {
      const outs = txns.filter(t => t.o > 0).length;
      if (outs < txns.length / 2) { txns.forEach(t => { t.o = -t.o; }); flipped = true; }
    }
    const acctName = map.acct >= 0 ? String(rows[map.header + 1][map.acct] || '').replace(/^'/, '').trim() : '';
    const label = name.replace(/\.(csv|txt|tsv)$/i, '').replace(/[_]+/g, ' ').trim();
    const looksCredit = /CREDIT|CARD|VIRGIN|AMEX|BARCLAYCARD|MBNA|CAPITAL ONE/i.test(label + ' ' + acctName);
    const looksCurrent = /CURRENT|SELECT|REWARD|SAVINGS|ACCOUNT/i.test(label) && !/CREDIT/i.test(label);
    const kind = looksCredit || (flipped && !looksCurrent) ? 'credit' : 'current';
    // stable ids: same purchase in an overlapping statement gets the same id
    const seen = {};
    txns.forEach(t => {
      const base = `${t.d}|${t.o.toFixed(2)}|${t.desc}`;
      seen[base] = (seen[base] || 0) + 1;
      t.base = base; t.id = hash(base + '|' + seen[base]);
    });
    return { txns, meta: { label, kind, flipped, acctName, rows: txns.length } };
  }

  // ---------- Sorting ----------
  function guessSpend(t) {
    const m = t.mu;
    const w = dow(t.d), weekday = w >= 1 && w <= 5;
    const amt = Math.abs(t.out);
    const lunchy = c => (c === 'dinners' && weekday && amt <= 14 ? 'cafe' : c);
    for (const [re, cat, extra] of RULES) if (re.test(m)) return Object.assign({ cat: lunchy(cat), conf: 'rule' }, extra || {});
    if (t.mcc && MCC_MAP[t.mcc]) { const [cat, extra] = MCC_MAP[t.mcc]; return Object.assign({ cat: lunchy(cat), conf: 'rule' }, extra || {}); }
    if (KW_CAFE.test(m)) return { cat: 'cafe', conf: 'guess' };
    if (KW_DINNER.test(m)) return { cat: lunchy('dinners'), conf: 'guess' };
    if (KW_DRINKS.test(m)) return { cat: 'drinks', conf: 'guess' };
    if (KW_SHOP.test(m)) return { cat: 'indie', conf: 'guess' };
    if (t.indie) return { cat: amt <= 14 ? 'cafe' : 'indie', conf: 'guess' };
    const ptype = PERSON_TYPES.test(t.type || '');
    const looksPerson = !BIZ.test(m) && (/^(MR|MRS|MS|MISS|DR)\.?\s+[A-Z]/.test(m) || /^[A-Z]{1,2}\.?\s+[A-Z][A-Z'\-]+$/.test(m) || (ptype && /^[A-Z][A-Z'\-]+\s+[A-Z][A-Z'\-]+$/.test(m)));
    if (looksPerson) return { cat: 'people', conf: ptype ? 'rule' : 'guess' };
    if (/^(D\/D|DD|DDR)$/i.test(t.type || '')) return { cat: 'bills', conf: 'guess' };
    if (/^(S\/O|SO|STO)$/i.test(t.type || '')) return { cat: 'people', conf: 'guess' };
    if (ptype) return { cat: 'people', conf: 'guess' };
    return { cat: 'other', conf: 'none' };
  }

  function setCat(t, cat, conf, extra) { t.cat = cat; t.conf = conf; if (extra) Object.assign(t, extra); }

  function baseCategorise(t, hasCredit) {
    const U = t.mu + ' ' + t.desc.toUpperCase();
    if (t.out < 0) {
      if (t.kind === 'credit') {
        if (/PAYMENT|THANK ?YOU|DIRECT DEBIT|BALANCE TRANSFER/.test(U)) return setCat(t, 'transfer', 'rule');
        const g = guessSpend(t);
        return setCat(t, g.cat === 'people' ? 'other' : g.cat, g.conf, { refund: true });
      }
      if (SAVINGS.test(U) || /TFR FROM|FROM A\/C|TRANSFER FROM/.test(U)) return setCat(t, 'transfer', 'rule');
      const g = guessSpend(t);
      if (g.conf === 'rule' && !['people', 'other', 'interest', 'bills'].includes(g.cat) && Math.abs(t.out) < 500) return setCat(t, g.cat, 'rule', { refund: true });
      return setCat(t, 'income', 'rule');
    }
    if (SAVINGS.test(t.mu)) return setCat(t, 'savings', 'rule');
    if (t.kind === 'current' && CARDPAY.test(U)) return setCat(t, hasCredit ? 'transfer' : 'debt', 'rule');
    if (/^(C\/L|ATM|CSH|CASH)$/i.test(t.type || '') || (/\bCASH\b|\bATM\b|CASHPOINT/.test(t.mu) && !/CASHBACK/.test(t.mu))) return setCat(t, 'cash', 'rule');
    const g = guessSpend(t);
    setCat(t, g.cat, g.conf, { hotel: !!g.hotel, rail: !!g.rail });
  }

  function matchTransfers(T) {
    const ins = new Map();
    T.forEach(t => { if (t.out < 0) { const k = (-t.out).toFixed(2); if (!ins.has(k)) ins.set(k, []); ins.get(k).push(t); } });
    T.filter(t => t.out > 0).sort((a, b) => (a.d < b.d ? -1 : 1)).forEach(o => {
      const cands = ins.get(o.out.toFixed(2)); if (!cands) return;
      let best = null, bd = 99;
      for (const c of cands) {
        if (c.paired || c.f === o.f) continue;
        const dd = Math.abs(daysBetween(o.d, c.d));
        if (dd <= 6 && dd < bd && (TRANSFERISH.test(o.mu + ' ' + o.desc.toUpperCase()) || TRANSFERISH.test(c.mu + ' ' + c.desc.toUpperCase()))) { best = c; bd = dd; }
      }
      if (best) { best.paired = o.id; o.paired = best.id; setCat(o, 'transfer', 'rule'); setCat(best, 'transfer', 'rule'); }
    });
  }

  function isWeekday(d) { const w = dow(d); return w >= 1 && w <= 5; }

  function commutePass(T) {
    const g = {};
    T.forEach(t => { if (t.rail && t.cat === 'travel' && t.out > 0) (g[t.key] = g[t.key] || []).push(t); });
    Object.values(g).forEach(list => {
      const wk = list.filter(t => isWeekday(t.d));
      if (wk.length >= 8 && median(list.map(t => t.out)) <= 30) list.forEach(t => setCat(t, 'commute', 'guess'));
    });
  }

  // The same independent place visited on lots of weekdays for small amounts is almost certainly lunch/coffee
  function lunchPass(T) {
    const g = {};
    T.forEach(t => { if (t.out > 0 && (t.cat === 'indie' || t.cat === 'other' || t.cat === 'dinners' || t.cat === 'cafe') && t.conf !== 'rule') (g[t.key] = g[t.key] || []).push(t); });
    Object.values(g).forEach(list => {
      const wk = list.filter(t => isWeekday(t.d));
      if (wk.length >= 4 && median(wk.map(t => t.out)) <= 15) list.forEach(t => setCat(t, 'cafe', 'guess'));
    });
  }

  // Midweek hotels, meals and trains away from home are probably work
  function workPass(T, homeTowns) {
    const away = new Set();
    const FOODISH = new Set(['dinners', 'drinks', 'takeaway', 'cafe']);
    T.forEach(t => {
      if (t.out <= 0) return;
      const w = dow(t.d);
      if (t.hotel && w >= 0 && w <= 4) { away.add(t.d); away.add(addDays(t.d, 1)); }
      if (t.town && !homeTowns.has(t.town) && w >= 1 && w <= 4 && FOODISH.has(t.cat)) away.add(t.d);
    });
    T.forEach(t => {
      if (t.out <= 0 || t.conf === 'user') return;
      const w = dow(t.d);
      const midweek = w >= 1 && w <= 5;
      if (t.hotel && w >= 0 && w <= 4) return setCat(t, 'worktrips', 'guess', { work: true });
      if (t.rail && t.cat === 'travel' && midweek && t.out >= 25) return setCat(t, 'worktrips', 'guess', { work: true });
      if (away.has(t.d) && midweek && (FOODISH.has(t.cat) || t.cat === 'taxis') && !(t.town && homeTowns.has(t.town))) setCat(t, 'worktrips', 'guess', { work: true });
    });
  }

  function findHomeTowns(T) {
    const c = {}; let n = 0;
    // only count places she'd physically be (shops, cafés, restaurants) — not subscriptions or delivery firms' head offices
    const PHYSICAL = new Set(['shop', 'cafe', 'dinners', 'drinks', 'indie', 'clothes', 'care', 'hobbies', 'gifts', 'health']);
    // weekends are the best signal for where home is; fall back to every day if there isn't enough weekend data
    const count = onlyWeekend => T.forEach(t => {
      if (!t.town || t.out <= 0 || !PHYSICAL.has(t.cat)) return;
      const w = dow(t.d);
      if (onlyWeekend && w !== 0 && w !== 6) return;
      c[t.town] = (c[t.town] || 0) + 1; n++;
    });
    count(true);
    if (n < 8) { Object.keys(c).forEach(k => delete c[k]); n = 0; count(false); }
    const sorted = Object.entries(c).sort((a, b) => b[1] - a[1]);
    const home = new Set();
    sorted.forEach(([town, k], i) => { if (i === 0 || k >= n * 0.12) home.add(town); });
    // card statements sometimes put the merchant's head office as the town; those aren't trips
    ['AMAZON.CO.UK'].forEach(x => home.add(x));
    return home;
  }

  function recurringPass(T, spanMonths) {
    const groups = new Map();
    T.forEach(t => { if (t.out > 0 && !NOT_SPEND.has(t.cat) && !['cash', 'worktrips', 'travel', 'taxis'].includes(t.cat)) { if (!groups.has(t.key)) groups.set(t.key, []); groups.get(t.key).push(t); } });
    const regs = [];
    for (const [key, list] of groups) {
      list.sort((a, b) => (a.d < b.d ? -1 : 1));
      const amts = list.map(t => t.out), med = median(amts);
      const ddso = list.some(t => /^(D\/D|DD|DDR|S\/O|SO|STO)$/i.test(t.type || ''));
      const months = new Set(list.map(t => t.d.slice(0, 7))).size;
      let freq = null;
      if (list.length >= 2) {
        const gaps = []; for (let i = 1; i < list.length; i++) gaps.push(daysBetween(list[i - 1].d, list[i].d));
        const g = median(gaps);
        const similar = amts.every(a => Math.abs(a - med) <= Math.max(2, med * 0.2));
        if (g >= 26 && g <= 35 && months >= 2 && (similar || ddso)) freq = 'monthly';
        else if (g >= 6 && g <= 8 && list.length >= 4 && similar) freq = 'weekly';
        else if (g >= 12 && g <= 16 && list.length >= 3 && similar) freq = 'fortnightly';
        else if (ddso && months >= 2) freq = 'monthly';
      } else if (ddso) freq = 'now and then';
      if (!freq) continue;
      const monthly = freq === 'monthly' ? med : freq === 'weekly' ? med * 52 / 12 : freq === 'fortnightly' ? med * 26 / 12 : med / Math.max(1, spanMonths);
      list.forEach(t => { t.recurring = freq; });
      regs.push({ key, name: list[list.length - 1].merch, cat: mode(list.map(t => t.cat)), freq, typical: med, monthly, yearly: monthly * 12, count: list.length, last: list[list.length - 1].d, ddso });
    }
    return regs.sort((a, b) => b.monthly - a.monthly);
  }

  /* files: [{id,label,kind,flip}], txns: stored, rules: {key:cat}, overrides: {id:cat} */
  function derive(files, txns, rules, overrides) {
    const F = Object.fromEntries(files.map(f => [f.id, f]));
    const hasCredit = files.some(f => f.kind === 'credit');
    const T = txns.filter(t => F[t.f]).map(t => {
      const f = F[t.f];
      const lag = t.td ? daysBetween(t.td, t.d) : -1;
      return Object.assign({}, t, {
        d: lag >= 0 && lag <= 10 ? t.td : t.d,
        out: f.flip ? -t.o : t.o, kind: f.kind, acct: f.label,
        cat: null, conf: 'none', hotel: false, rail: false, work: false, recurring: null, paired: null, refund: false
      });
    });
    matchTransfers(T);
    T.forEach(t => { if (!t.cat) baseCategorise(t, hasCredit); });
    const homeTowns = findHomeTowns(T);
    commutePass(T);
    lunchPass(T);
    workPass(T, homeTowns);
    T.forEach(t => {
      const o = overrides[t.id] || rules[t.key];
      if (o && CAT[o]) { t.cat = o; t.conf = 'user'; t.work = o === 'worktrips'; }
    });
    T.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    const dates = T.filter(t => t.cat !== 'transfer').map(t => t.d).sort();
    const first = dates[0], last = dates[dates.length - 1];
    const spanDays = first ? daysBetween(first, last) + 1 : 0;
    const months = Math.max(1, spanDays / 30.44);
    const regs = recurringPass(T, months);
    return { T, regs, first, last, spanDays, months, homeTowns };
  }

  const api = { CATS, CAT, GROUPS, NOT_SPEND, readFile, derive, parseCSV, detectColumns, parseDate, parseAmount, cleanDesc, median, dow, addDays, daysBetween, toDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
