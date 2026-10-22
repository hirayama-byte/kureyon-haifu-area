// 同時配布エリア選択：地図の区画を選ぶと部数と配布料金を計算する
(function () {
  'use strict';

  const AREA = window.HAIFU_AREA;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- 料金表（同時配布エリア選択シートと同じ計算） ----
  // サイズ単価は合計部数で変わる: 5,000部未満 / 1万部未満 / 3万部未満 / 3万部以上
  const SIZE_PRICE = {
    A4: [7, 6.5, 6, 5],
    B4: [7, 6.5, 6, 5],
    A3: [7.5, 7, 6.5, 5.5],
    B3: [8, 7.5, 7, 6],
    A2: [8, 7.5, 7, 6]
  };
  const tierOf = n => (n < 5000 ? 0 : n < 10000 ? 1 : n < 30000 ? 2 : 3);
  const foldPrice = (size, on) => (on ? (size === 'A2' ? 2 : 1) : 0); // 折加工：A2は+2円、それ以外+1円
  const insertPrice = on => (on ? 2 : 0);                            // 挟み込み：+2円

  // URL に残すときの区の記号（日本語のままだとURLが長くなるため）
  const URL_CODE = { '西': 'w', '北': 'k' };

  const fmt = n => n.toLocaleString('ja-JP');
  const fmtUnit = n => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  const $ = id => document.getElementById(id);

  const byKey = Object.fromEntries(AREA.areas.map(a => [a.key, a]));
  const selected = new Set();
  const shapes = {};   // key -> SVG の <g>
  const rows = {};     // key -> 一覧の <tr>
  let zoom = 1;

  // ---- 地図 ----
  function buildMap() {
    const svg = $('map');
    const m = AREA.map;
    svg.setAttribute('viewBox', `${m.x} ${m.y} ${m.width} ${m.height}`);
    const img = document.createElementNS(SVG_NS, 'image');
    img.setAttribute('href', m.src);
    img.setAttribute('x', m.x); img.setAttribute('y', m.y);
    img.setAttribute('width', m.width); img.setAttribute('height', m.height);
    svg.appendChild(img);

    for (const a of AREA.areas) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'zone zone-' + (a.ku === '北' ? 'kita' : 'nishi'));
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-pressed', 'false');
      g.setAttribute('aria-label', `${AREA.wards[a.ku]} ${a.no} ${a.name} ${fmt(a.copies)}部`);
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', a.poly.map(p => p.join(',')).join(' '));
      g.appendChild(poly);
      // 選択時に出すチェック印
      const mark = document.createElementNS(SVG_NS, 'circle');
      mark.setAttribute('class', 'mark');
      mark.setAttribute('cx', a.label[0]); mark.setAttribute('cy', a.label[1] - 9); mark.setAttribute('r', 3.2);
      g.appendChild(mark);

      g.addEventListener('click', () => { toggle(a.key); showTip(a, true); });
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(a.key); } });
      g.addEventListener('mouseenter', () => showTip(a, false));
      g.addEventListener('mouseleave', hideTip);
      g.addEventListener('focus', () => showTip(a, false));
      g.addEventListener('blur', hideTip);
      svg.appendChild(g);
      shapes[a.key] = g;
    }
  }

  let tipTimer = null;
  function showTip(a, fromTap) {
    const tip = $('mapTip');
    const on = selected.has(a.key);
    tip.innerHTML = `<b>${AREA.wards[a.ku]} ${a.no}</b> ${a.name}<br>${fmt(a.copies)}部` +
      (fromTap ? `<span class="tip-state ${on ? 'on' : 'off'}">${on ? '選択しました' : '解除しました'}</span>` : '');
    tip.hidden = false;
    clearTimeout(tipTimer);
    if (fromTap) tipTimer = setTimeout(hideTip, 1800);
  }
  function hideTip() { $('mapTip').hidden = true; }

  function setZoom(z) {
    const scroller = $('mapScroll');
    // 拡大前の中心を保つ
    const cx = (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth;
    const cy = (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight;
    zoom = Math.min(4, Math.max(1, z));
    $('map').style.width = (zoom * 100) + '%';
    scroller.classList.toggle('zoomed', zoom > 1);
    scroller.scrollLeft = cx * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTop = cy * scroller.scrollHeight - scroller.clientHeight / 2;
  }

  // ---- 一覧 ----
  function buildTables() {
    const box = $('tables');
    for (const ku of Object.keys(AREA.wards)) {
      const list = AREA.areas.filter(a => a.ku === ku);
      const total = list.reduce((s, a) => s + a.copies, 0);
      const wrap = document.createElement('div');
      wrap.className = 'ward ward-' + (ku === '北' ? 'kita' : 'nishi');
      wrap.innerHTML = `<h3>${AREA.wards[ku]}<span>${list.length}区画・計${fmt(total)}部</span><em class="ward-sel" data-ward-sel="${ku}"></em></h3>`;
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th class="c-chk"></th><th class="c-no">番号</th><th>配布エリア</th><th class="c-num">可能部数</th></tr></thead>';
      const tb = document.createElement('tbody');
      for (const a of list) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="c-chk"><input type="checkbox" aria-label="${AREA.wards[ku]} ${a.no} ${a.name}"></td>` +
          `<td class="c-no">${a.no}</td><td>${a.name}</td><td class="c-num">${fmt(a.copies)}</td>`;
        tr.addEventListener('click', e => { if (e.target.tagName !== 'INPUT') toggle(a.key); });
        tr.querySelector('input').addEventListener('change', () => toggle(a.key));
        tb.appendChild(tr);
        rows[a.key] = tr;
      }
      table.appendChild(tb);
      wrap.appendChild(table);
      box.appendChild(wrap);
    }
  }

  // ---- 選択と計算 ----
  function toggle(key, force) {
    const on = force === undefined ? !selected.has(key) : force;
    if (on) selected.add(key); else selected.delete(key);
    paint(key);
    update();
  }
  function paint(key) {
    const on = selected.has(key);
    shapes[key].classList.toggle('selected', on);
    shapes[key].setAttribute('aria-pressed', String(on));
    rows[key].classList.toggle('selected', on);
    rows[key].querySelector('input').checked = on;
  }

  function calc() {
    const list = AREA.areas.filter(a => selected.has(a.key));
    const total = list.reduce((s, a) => s + a.copies, 0);
    const size = $('size').value;
    const fold = $('fold').value === '1';
    const ins = $('insert').value === '1';
    const unitSize = SIZE_PRICE[size][tierOf(total)];
    const unitFold = foldPrice(size, fold);
    const unitIns = insertPrice(ins);
    const unit = unitSize + unitFold + unitIns;
    return { list, total, size, fold, ins, unitSize, unitFold, unitIns, unit, fee: Math.round(total * unit) };
  }

  function update() {
    const r = calc();
    $('totalCopies').textContent = fmt(r.total);
    $('selCount').textContent = r.list.length;
    const wardTotals = Object.keys(AREA.wards).map(ku => {
      const l = r.list.filter(a => a.ku === ku);
      return { ku, n: l.length, copies: l.reduce((s, a) => s + a.copies, 0) };
    });
    $('wardSub').textContent = wardTotals.filter(w => w.n).map(w => `${AREA.wards[w.ku]} ${fmt(w.copies)}部`).join('／');
    document.querySelectorAll('[data-ward-sel]').forEach(el => {
      const w = wardTotals.find(x => x.ku === el.dataset.wardSel);
      el.textContent = w.n ? `選択 ${w.n}区画・${fmt(w.copies)}部` : '';
    });
    $('unitSize').textContent = fmtUnit(r.unitSize);
    $('unitFold').textContent = r.unitFold; $('foldLine').hidden = !r.fold;
    $('unitInsert').textContent = r.unitIns; $('insertLine').hidden = !r.ins;
    $('unitTotal').textContent = fmtUnit(r.unit);
    $('fee').textContent = fmt(r.fee);
    $('stickyCopies').textContent = fmt(r.total);
    $('stickyFee').textContent = fmt(r.fee);
    writeHash(r);
  }

  // ---- 選択内容を URL に残す（共有・再読み込みで復元） ----
  function writeHash(r) {
    const sel = AREA.areas.filter(a => selected.has(a.key)).map(a => URL_CODE[a.ku] + a.no).join(',');
    const p = new URLSearchParams();
    if (sel) p.set('sel', sel);
    if (r.size !== 'A4') p.set('size', r.size);
    if (r.fold) p.set('fold', '1');
    if (r.ins) p.set('ins', '1');
    const h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    for (const t of (p.get('sel') || '').split(',')) {
      const m = t.match(/^([a-z])(\d+)$/);
      const ku = m && Object.keys(URL_CODE).find(k => URL_CODE[k] === m[1]);
      if (ku && byKey[ku + '-' + m[2]]) selected.add(ku + '-' + m[2]);
    }
    if (SIZE_PRICE[p.get('size')]) $('size').value = p.get('size');
    if (p.get('fold') === '1') $('fold').value = '1';
    if (p.get('ins') === '1') $('insert').value = '1';
  }

  // ---- コピー用の文章 ----
  function summaryText() {
    const r = calc();
    if (!r.list.length) return '';
    const lines = [`【同時配布】${AREA.title} 選択エリア`];
    for (const ku of Object.keys(AREA.wards)) {
      const l = r.list.filter(a => a.ku === ku);
      if (!l.length) continue;
      lines.push(`${AREA.wards[ku]}：${l.map(a => a.no).join('・')}（${l.length}区画・${fmt(l.reduce((s, a) => s + a.copies, 0))}部）`);
    }
    lines.push(`合計：${fmt(r.total)}部`);
    const opts = [r.fold ? `折加工+${r.unitFold}円` : '', r.ins ? `挟み込み+${r.unitIns}円` : ''].filter(Boolean).join('・');
    lines.push(`チラシ${r.size}　単価${fmtUnit(r.unitSize)}円${opts ? '（' + opts + '）' : ''}＝1部${fmtUnit(r.unit)}円`);
    lines.push(`配布料金：${fmt(r.fee)}円（税別）`);
    return lines.join('\n');
  }
  async function copyText(text, msg) {
    const box = $('copied');
    try { await navigator.clipboard.writeText(text); box.textContent = msg; }
    catch (e) { box.textContent = 'コピーできませんでした。お手数ですが手動で選択してください。'; }
    box.hidden = false;
    clearTimeout(copyText.t); copyText.t = setTimeout(() => { box.hidden = true; }, 2500);
  }

  // ---- 初期化 ----
  function init() {
    $('areaTitle').textContent = AREA.title;
    $('source').textContent = AREA.source;
    buildMap();
    buildTables();
    readHash();
    AREA.areas.forEach(a => paint(a.key));
    update();

    ['size', 'fold', 'insert'].forEach(id => $(id).addEventListener('change', update));
    document.querySelectorAll('[data-bulk]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.bulk;
      AREA.areas.forEach(a => { if (k === 'clear') selected.delete(a.key); else if (a.ku === k) selected.add(a.key); paint(a.key); });
      update();
    }));
    $('zoomIn').addEventListener('click', () => setZoom(zoom + 0.75));
    $('zoomOut').addEventListener('click', () => setZoom(zoom - 0.75));
    $('zoomReset').addEventListener('click', () => setZoom(1));
    $('copyBtn').addEventListener('click', () => {
      const t = summaryText();
      if (!t) {
        const box = $('copied'); box.textContent = '区画がまだ選ばれていません。'; box.hidden = false;
        clearTimeout(copyText.t); copyText.t = setTimeout(() => { box.hidden = true; }, 2500);
        return;
      }
      copyText(t, '選択内容をコピーしました。メールやLINEに貼り付けられます。');
    });
    $('shareBtn').addEventListener('click', () => copyText(location.href, 'このページのURLをコピーしました。開くと同じ選択状態になります。'));
  }

  init();
})();
