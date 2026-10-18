/* Contact form, phone field: a searchable country picker in place of the plain <select>.

   - Every country and territory with a dialling code, named in the page's language.
     Search matches the name in English, French, Italian or the page language,
     the ISO code ("it") or the code ("39", "+39", "0039").
   - The first guess comes from the browser's own language settings ("it-IT" → Italy).
     Nothing is looked up on the network.
   - Typing or pasting an international number ("+39 333…", "0033 6…") picks the country
     and moves the code out of the number box.
   - A national number ("06 12 34 56 78") is deliberately NOT used to guess the country:
     06 and 07 start mobile numbers in France but also in the UK, the Netherlands,
     Hungary… and a silently wrong code is worse than none.

   The <select id="phone-country"> stays in the page as the form control main.js reads
   (its value is the code, e.g. "+39"); this script hides it and keeps it in step. */
(function () {
  const select = document.getElementById('phone-country');
  const input = document.getElementById('phone');
  const box = select && select.parentElement;
  if (!select || !input || !box) return;

  // ISO 3166 code : dialling code. NANP territories carry their area code ("1876"), the
  // others are the plain ITU code. Codes are prefix-free, apart from those starting "1".
  const DATA = 'AD:376,AE:971,AF:93,AG:1268,AI:1264,AL:355,AM:374,AO:244,AR:54,AS:1684,AT:43,AU:61,AW:297,AX:358,AZ:994,' +
    'BA:387,BB:1246,BD:880,BE:32,BF:226,BG:359,BH:973,BI:257,BJ:229,BL:590,BM:1441,BN:673,BO:591,BQ:599,BR:55,BS:1242,BT:975,BW:267,BY:375,BZ:501,' +
    'CA:1,CC:61,CD:243,CF:236,CG:242,CH:41,CI:225,CK:682,CL:56,CM:237,CN:86,CO:57,CR:506,CU:53,CV:238,CW:599,CX:61,CY:357,CZ:420,' +
    'DE:49,DJ:253,DK:45,DM:1767,DO:1809,DZ:213,EC:593,EE:372,EG:20,EH:212,ER:291,ES:34,ET:251,FI:358,FJ:679,FK:500,FM:691,FO:298,FR:33,' +
    'GA:241,GB:44,GD:1473,GE:995,GF:594,GG:44,GH:233,GI:350,GL:299,GM:220,GN:224,GP:590,GQ:240,GR:30,GT:502,GU:1671,GW:245,GY:592,' +
    'HK:852,HN:504,HR:385,HT:509,HU:36,ID:62,IE:353,IL:972,IM:44,IN:91,IO:246,IQ:964,IR:98,IS:354,IT:39,JE:44,JM:1876,JO:962,JP:81,' +
    'KE:254,KG:996,KH:855,KI:686,KM:269,KN:1869,KP:850,KR:82,KW:965,KY:1345,KZ:7,LA:856,LB:961,LC:1758,LI:423,LK:94,LR:231,LS:266,LT:370,LU:352,LV:371,LY:218,' +
    'MA:212,MC:377,MD:373,ME:382,MF:590,MG:261,MH:692,MK:389,ML:223,MM:95,MN:976,MO:853,MP:1670,MQ:596,MR:222,MS:1664,MT:356,MU:230,MV:960,MW:265,MX:52,MY:60,MZ:258,' +
    'NA:264,NC:687,NE:227,NF:672,NG:234,NI:505,NL:31,NO:47,NP:977,NR:674,NU:683,NZ:64,OM:968,' +
    'PA:507,PE:51,PF:689,PG:675,PH:63,PK:92,PL:48,PM:508,PR:1787,PS:970,PT:351,PW:680,PY:595,QA:974,RE:262,RO:40,RS:381,RU:7,RW:250,' +
    'SA:966,SB:677,SC:248,SD:249,SE:46,SG:65,SH:290,SI:386,SJ:47,SK:421,SL:232,SM:378,SN:221,SO:252,SR:597,SS:211,ST:239,SV:503,SX:1721,SY:963,SZ:268,' +
    'TC:1649,TD:235,TG:228,TH:66,TJ:992,TK:690,TL:670,TM:993,TN:216,TO:676,TR:90,TT:1868,TV:688,TW:886,TZ:255,' +
    'UA:380,UG:256,US:1,UY:598,UZ:998,VA:39,VC:1784,VE:58,VG:1284,VI:1340,VN:84,VU:678,WF:681,WS:685,XK:383,YE:967,YT:262,ZA:27,ZM:260,ZW:263';
  // Which country a code alone ("+7", "+44") stands for when several share it.
  const PRIMARY = { 1: 'US', 7: 'RU', 39: 'IT', 44: 'GB', 61: 'AU', 212: 'MA', 358: 'FI', 47: 'NO', 590: 'GP', 599: 'CW', 262: 'RE' };

  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const regionNames = (l) => { try { return new Intl.DisplayNames([l], { type: 'region' }); } catch { return null; } };
  const nameIn = (dn, iso) => { try { return (dn && dn.of(iso)) || iso; } catch { return iso; } };
  const dnUi = regionNames(lang);
  const dnOthers = ['en', 'fr', 'it'].map(regionNames);
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const flagOf = (iso) => String.fromCodePoint(...[...iso].map((ch) => 127397 + ch.charCodeAt(0)));

  const countries = DATA.split(',').map((pair) => {
    const [iso, code] = pair.split(':');
    const name = nameIn(dnUi, iso);
    const hay = norm([name, ...dnOthers.map((dn) => nameIn(dn, iso))].join(' ') + ' ' + iso);
    // "1876" shows as "+1 876"; the plain codes as "+39".
    const label = '+' + (code.length === 4 && code[0] === '1' ? '1 ' + code.slice(1) : code);
    return { iso, code, label, name, hay, flag: flagOf(iso) };
  }).sort((a, b) => a.name.localeCompare(b.name, lang));
  const byIso = new Map(countries.map((c) => [c.iso, c]));

  // Codes recognised in a typed international number. NANP area codes are left out: "+1"
  // is enough to know the continent, and the number that follows is the area code.
  const byCode = new Map();
  countries.forEach((c) => {
    if (c.code[0] === '1' && c.code.length > 1) return;
    byCode.set(c.code, [...(byCode.get(c.code) || []), c.iso]);
  });

  let current = null;

  // ── The picker ──
  const t = box.dataset;
  const wrap = document.createElement('div');
  wrap.className = 'cc';
  wrap.innerHTML =
    '<button type="button" class="cc-btn" aria-haspopup="listbox" aria-expanded="false">' +
    '<span class="cc-flag" aria-hidden="true"></span><span class="cc-code"></span>' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</button>' +
    '<div class="cc-panel" hidden>' +
    '<input type="search" class="cc-search" role="combobox" aria-expanded="true" aria-controls="cc-list" aria-autocomplete="list" autocomplete="off" spellcheck="false">' +
    '<ul class="cc-list" id="cc-list" role="listbox"></ul>' +
    '<p class="cc-empty" hidden></p>' +
    '</div>';
  box.insertBefore(wrap, select);
  select.hidden = true;

  const btn = wrap.querySelector('.cc-btn');
  const panel = wrap.querySelector('.cc-panel');
  const search = wrap.querySelector('.cc-search');
  const list = wrap.querySelector('.cc-list');
  const empty = wrap.querySelector('.cc-empty');
  const label = select.getAttribute('aria-label') || 'Country code';
  search.placeholder = t.search || 'Search a country or a code';
  search.setAttribute('aria-label', search.placeholder);
  empty.textContent = t.empty || 'No country found';

  let shown = countries;
  let active = 0;

  function setCountry(c) {
    current = c;
    wrap.querySelector('.cc-flag').textContent = c.flag;
    wrap.querySelector('.cc-code').textContent = c.label;
    btn.setAttribute('aria-label', `${label}: ${c.name} ${c.label}`);
    // The form control main.js reads: its value is the code that goes in front of the number.
    select.replaceChildren(new Option(`${c.flag} ${c.label}`, c.label, true, true));
  }

  function filter(raw) {
    const q = norm(raw.trim());
    if (!q) return countries;
    const digits = q.replace(/[\s+().-]/g, '').replace(/^00/, '');
    if (/^\d+$/.test(digits) && /^[+\d]/.test(q)) return countries.filter((c) => c.code.startsWith(digits));
    return countries
      .map((c) => {
        const at = c.hay.indexOf(q);
        if (c.iso.toLowerCase() === q) return [0, c];
        if (at === 0) return [1, c];
        if (at > 0 && c.hay[at - 1] === ' ') return [2, c];
        return at > 0 ? [3, c] : null;
      })
      .filter(Boolean)
      .sort((a, b) => a[0] - b[0])
      .map((pair) => pair[1]);
  }

  function render() {
    list.replaceChildren(...shown.map((c, i) => {
      const li = document.createElement('li');
      li.id = 'cc-' + c.iso;
      li.setAttribute('role', 'option');
      li.dataset.i = i;
      li.setAttribute('aria-selected', c === current ? 'true' : 'false');
      li.className = i === active ? 'is-active' : '';
      for (const [cls, text] of [['cc-flag', c.flag], ['cc-name', c.name], ['cc-dial', c.label]]) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        li.append(span);
      }
      return li;
    }));
    empty.hidden = shown.length > 0;
    list.hidden = shown.length === 0;
    const on = shown[active];
    if (on) search.setAttribute('aria-activedescendant', 'cc-' + on.iso); else search.removeAttribute('aria-activedescendant');
  }

  function move(to) {
    if (!shown.length) return;
    list.children[active]?.classList.remove('is-active');
    active = (to + shown.length) % shown.length;
    const li = list.children[active];
    li.classList.add('is-active');
    li.scrollIntoView({ block: 'nearest' });
    search.setAttribute('aria-activedescendant', li.id);
  }

  function open() {
    search.value = '';
    shown = countries;
    active = Math.max(0, shown.indexOf(current));
    render();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    search.focus({ preventScroll: true });
    list.children[active]?.scrollIntoView({ block: 'center' });
  }

  function close(toButton) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (toButton) btn.focus();
  }

  function choose(c) {
    setCountry(c);
    close(false);
    input.focus();
  }

  btn.addEventListener('click', () => (panel.hidden ? open() : close(true)));
  search.addEventListener('input', () => { shown = filter(search.value); active = 0; render(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(active - 1); }
    else if (e.key === 'Home' && !search.value) { e.preventDefault(); move(0); }
    else if (e.key === 'End' && !search.value) { e.preventDefault(); move(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) choose(shown[Number(li.dataset.i)]);
  });
  list.addEventListener('mousemove', (e) => {
    const li = e.target.closest('li');
    if (li && Number(li.dataset.i) !== active) move(Number(li.dataset.i));
  });
  box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) close(false); });
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) close(false); });

  // ── Reading the number as it is typed or pasted ──
  // "+39 333 1234567" or "0039 333 1234567": the code picks the country and leaves the number.
  function fromInternational(raw) {
    const prefix = /^\s*(?:\+|00)\s*/.exec(raw);
    if (!prefix) return null;
    let digits = '';
    for (let i = prefix[0].length; i < raw.length && digits.length < 3; i++) {
      if (/\d/.test(raw[i])) {
        digits += raw[i];
        const isos = byCode.get(digits);
        if (isos) {
          const iso = isos.includes(current.iso) ? current.iso : (PRIMARY[digits] || isos[0]);
          // "+33 (0)6 12…": the bracketed trunk zero is not part of the number.
          const rest = raw.slice(i + 1).replace(/^[\s.-]*(?:\(0\)[\s.-]*)?/, '');
          return { country: byIso.get(iso), rest };
        }
      } else if (!/[\s().-]/.test(raw[i])) {
        return null;
      }
    }
    return null;
  }

  input.addEventListener('input', () => {
    const found = fromInternational(input.value);
    if (!found) return;
    setCountry(found.country);
    input.value = found.rest;
  });

  // ── The first guess ──
  // Region of the browser's languages ("it-IT" → IT), else the page's language, else France.
  function guess() {
    for (const l of navigator.languages || [navigator.language]) {
      let region = '';
      try { region = new Intl.Locale(l).region || ''; } catch { /* old browser */ }
      if (byIso.has(region)) return byIso.get(region);
    }
    return byIso.get({ fr: 'FR', it: 'IT' }[lang] || 'FR');
  }
  setCountry(guess());
})();
