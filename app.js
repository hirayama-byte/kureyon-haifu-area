// 同時配布エリア選択：地図の区画を選ぶと部数と配布料金を計算する
(function () {
  'use strict';

  const AREAS = window.HAIFU_AREAS || [];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 料金の計算は price.js（map.html と共通）
  const { SIZE_PRICE, calcFee, fmt, fmtUnit } = window.HaifuPrice;
  const $ = id => document.getElementById(id);
  // 部数の調整（extras.js）
  let X = null;

  // 状態
  let AREA = null;            // 表示中のエリア
  let MAP = null;             // 表示中の地図
  const selectedBy = {};      // エリアID → 選択中の区画キーの Set（エリアを切り替えても残す）
  let selected = new Set();
  let byKey = {};
  let shapes = {};            // key -> SVG の <g>
  let rows = {};              // key -> 一覧の <tr>
  let zoom = 1;

  const groupOf = a => AREA.groups.find(g => g.id === a.group);
  const labelOf = a => `${groupOf(a).title} ${a.code}`;
  // 地名が「祖父江7」のように番号と同じなら、地名は重ねて出さない
  const nameOf = a => (a.name === a.group + a.code ? '' : a.name);

  // ---- エリアの切り替え ----
  function buildAreaTabs() {
    const nav = $('areaTabs');
    nav.innerHTML = '';
    for (const ar of AREAS) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = ar.title; b.dataset.area = ar.id;
      b.addEventListener('click', () => { if (ar.id !== AREA.id) { setArea(ar.id); update(); } });
      nav.appendChild(b);
    }
  }
  function setArea(id, mapId) {
    AREA = AREAS.find(a => a.id === id) || AREAS[0];
    selected = selectedBy[AREA.id] = selectedBy[AREA.id] || new Set();
    X.setArea(AREA.id);
    byKey = Object.fromEntries(AREA.areas.map(a => [a.key, a]));
    document.querySelectorAll('#areaTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.area === AREA.id)));
    $('source').textContent = AREA.source;
    buildMapTabs();
    buildLegend();
    buildBulk();
    buildTables();
    setMap(mapId || AREA.maps[0].id);
  }

  // ---- 地図 ----
  function buildMapTabs() {
    const box = $('mapTabs');
    box.innerHTML = '';
    box.hidden = AREA.maps.length < 2;
    for (const m of AREA.maps) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.map = m.id;
      b.innerHTML = `${m.title}<span class="map-tab-count" data-map-count="${m.id}"></span>`;
      b.addEventListener('click', () => setMap(m.id));
      box.appendChild(b);
    }
  }
  function buildLegend() {
    // 区ごとに色分けしている地図（西区・北区）だけ区の凡例を出す
    const tones = AREA.maps.length === 1 ? AREA.groups.map(g => `<span><i class="sw sw-${g.tone}"></i>${g.title}</span>`).join('') : '';
    $('legend').innerHTML = tones + '<span><i class="sw sw-sel"></i>選択中</span>';
  }
  function setMap(id) {
    MAP = AREA.maps.find(m => m.id === id) || AREA.maps[0];
    document.querySelectorAll('#mapTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.map === MAP.id)));
    const svg = $('map');
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `${MAP.x} ${MAP.y} ${MAP.width} ${MAP.height}`);
    const img = document.createElementNS(SVG_NS, 'image');
    img.setAttribute('href', MAP.src);
    img.setAttribute('x', MAP.x); img.setAttribute('y', MAP.y);
    img.setAttribute('width', MAP.width); img.setAttribute('height', MAP.height);
    svg.appendChild(img);
    shapes = {};
    const r = MAP.width / 170; // 選択印の大きさ（地図の幅に合わせる）
    for (const a of AREA.areas.filter(a => a.map === MAP.id)) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'zone zone-' + groupOf(a).tone);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${labelOf(a)} ${nameOf(a)} ${fmt(a.copies)}部`.replace(/  +/g, ' '));
      for (const p of a.polys) {
        const poly = document.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', p.map(q => q.join(',')).join(' '));
        g.appendChild(poly);
      }
      const mark = document.createElementNS(SVG_NS, 'circle');
      mark.setAttribute('class', 'mark');
      mark.setAttribute('cx', a.label[0]); mark.setAttribute('cy', a.label[1] - r * 2.6); mark.setAttribute('r', r);
      g.appendChild(mark);
      g.addEventListener('click', () => { toggle(a.key); showTip(a, true); });
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(a.key); } });
      g.addEventListener('mouseenter', () => showTip(a, false));
      g.addEventListener('mouseleave', hideTip);
      g.addEventListener('focus', () => showTip(a, false));
      g.addEventListener('blur', hideTip);
      svg.appendChild(g);
      shapes[a.key] = g;
      paint(a.key);
    }
    setZoom(1);
    writeHash();
  }

  let tipTimer = null;
  function showTip(a, fromTap) {
    const tip = $('mapTip');
    const on = selected.has(a.key);
    tip.innerHTML = `<b>${labelOf(a)}</b> ${nameOf(a)}<br>${fmt(a.copies)}部` +
      (fromTap ? `<span class="tip-state ${on ? 'on' : 'off'}">${on ? '選択しました' : '解除しました'}</span>` : '');
    tip.hidden = false;
    clearTimeout(tipTimer);
    if (fromTap) tipTimer = setTimeout(hideTip, 1800);
  }
  function hideTip() { $('mapTip').hidden = true; }

  function setZoom(z) {
    const scroller = $('mapScroll');
    // 拡大前の中心を保つ
    const cx = scroller.scrollWidth ? (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth : 0.5;
    const cy = scroller.scrollHeight ? (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight : 0.5;
    zoom = Math.min(4, Math.max(1, z));
    $('map').style.width = (zoom * 100) + '%';
    scroller.classList.toggle('zoomed', zoom > 1);
    scroller.scrollLeft = cx * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTop = cy * scroller.scrollHeight - scroller.clientHeight / 2;
  }

  // ---- 一覧 ----
  function buildBulk() {
    const box = $('bulk');
    box.innerHTML = '';
    for (const g of AREA.groups) {
      const b = document.createElement('button');
      // 押すたびに「すべて選択」⇔「すべて解除」（その地域の区画がぜんぶ選ばれていたら解除）
      b.type = 'button'; b.dataset.group = g.id; b.textContent = `${g.title}をすべて選択`;
      b.addEventListener('click', () => {
        const list = AREA.areas.filter(a => a.group === g.id);
        const allOn = list.every(a => selected.has(a.key));
        list.forEach(a => { if (allOn) selected.delete(a.key); else selected.add(a.key); });
        repaintAll(); update();
      });
      box.appendChild(b);
    }
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'danger'; c.textContent = 'すべて解除';
    c.addEventListener('click', () => { selected.clear(); X.clear(); repaintAll(); update(); });
    box.appendChild(c);
  }
  function buildTables() {
    const box = $('tables');
    box.innerHTML = '';
    rows = {};
    box.classList.toggle('three', AREA.groups.length >= 3);
    for (const grp of AREA.groups) {
      const list = AREA.areas.filter(a => a.group === grp.id);
      const total = list.reduce((s, a) => s + a.copies, 0);
      const wrap = document.createElement('div');
      wrap.className = 'ward ward-' + grp.tone;
      wrap.innerHTML = `<h3>${grp.title}<span>${list.length}区画・計${fmt(total)}部</span><em class="ward-sel" data-ward-sel="${grp.id}"></em></h3>`;
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th class="c-chk"></th><th class="c-no">番号</th><th>配布エリア</th><th class="c-num">可能部数</th></tr></thead>';
      const tb = document.createElement('tbody');
      for (const a of list) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="c-chk"><input type="checkbox" aria-label="${labelOf(a)} ${a.name}"></td>` +
          `<td class="c-no">${a.code}</td><td>${a.name}</td><td class="c-num">${fmt(a.copies)}</td>`;
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
  function toggle(key) {
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    paint(key);
    update();
  }
  function paint(key) {
    const on = selected.has(key);
    if (shapes[key]) { shapes[key].classList.toggle('selected', on); shapes[key].setAttribute('aria-pressed', String(on)); }
    if (rows[key]) { rows[key].classList.toggle('selected', on); rows[key].querySelector('input').checked = on; }
  }
  function repaintAll() { AREA.areas.forEach(a => paint(a.key)); }

  function calc() {
    const list = AREA.areas.filter(a => selected.has(a.key));
    const rawTotal = list.reduce((s, a) => s + a.copies, 0);
    const adj = X.resolve(list);          // 部数の調整（1区画から減らす）
    const total = rawTotal - adj.amount;  // 単価の段階も調整後の部数で決まる
    const size = $('size').value;
    const fold = $('fold').value === '1';
    const ins = $('insert').value === '1';
    return { list, rawTotal, adj, total, size, fold, ins, ...calcFee(total, size, fold, ins) };
  }

  // 地域ごとのボタンの文字: ぜんぶ選ばれていれば「すべて解除」
  function refreshBulk() {
    document.querySelectorAll('#bulk button[data-group]').forEach(b => {
      const g = AREA.groups.find(x => x.id === b.dataset.group); if (!g) return;
      const allOn = AREA.areas.filter(a => a.group === g.id).every(a => selected.has(a.key));
      b.textContent = `${g.title}をすべて${allOn ? '解除' : '選択'}`; b.classList.toggle('bulk-on', allOn);
    });
  }
  function update() {
    refreshBulk();
    const r = calc();
    $('totalCopies').textContent = fmt(r.total);
    X.render(r.list, r.adj);
    $('adjNote').hidden = !r.adj.amount;
    if (r.adj.amount) $('adjNote').textContent = `選択の合計 ${fmt(r.rawTotal)}部 − 調整 ${fmt(r.adj.amount)}部（${labelOf(r.adj.area)}：${fmt(r.adj.area.copies)}→${fmt(r.adj.area.copies - r.adj.amount)}部）`;
    $('selCount').textContent = r.list.length;
    const groupTotals = AREA.groups.map(g => {
      const l = r.list.filter(a => a.group === g.id);
      return { g, n: l.length, copies: l.reduce((s, a) => s + a.copies, 0) };
    });
    $('wardSub').textContent = groupTotals.filter(w => w.n).map(w => `${w.g.title} ${fmt(w.copies)}部`).join('／');
    document.querySelectorAll('[data-ward-sel]').forEach(el => {
      const w = groupTotals.find(x => x.g.id === el.dataset.wardSel);
      el.textContent = w && w.n ? `選択 ${w.n}区画・${fmt(w.copies)}部` : '';
    });
    // 地図タブに選択数を出す（地図が複数あるエリア）
    document.querySelectorAll('[data-map-count]').forEach(el => {
      const n = r.list.filter(a => a.map === el.dataset.mapCount).length;
      el.textContent = n ? n : '';
    });
    $('unitSize').textContent = fmtUnit(r.unitSize);
    $('unitFold').textContent = r.unitFold; $('foldLine').hidden = !r.fold;
    $('unitInsert').textContent = r.unitIns; $('insertLine').hidden = !r.ins;
    $('unitTotal').textContent = fmtUnit(r.unit);
    $('fee').textContent = fmt(r.fee);
    $('stickyCopies').textContent = fmt(r.total);
    $('stickyFee').textContent = fmt(r.fee);
    document.title = `情報誌くれよん 配布エリア選択シート｜${AREA.title}`;
    writeHash(r);
  }

  // ---- 選択内容を URL に残す（共有・再読み込みで復元） ----
  // 例: #area=inazawa&map=sobue&sel=a1,b2,s3&size=A3
  function writeHash(r) {
    r = r || calc();
    const p = new URLSearchParams();
    if (AREA !== AREAS[0]) p.set('area', AREA.id);
    if (MAP && MAP !== AREA.maps[0]) p.set('map', MAP.id);
    const sel = AREA.areas.filter(a => selected.has(a.key)).map(a => a.url).join(',');
    if (sel) p.set('sel', sel);
    if (r.size !== 'A4') p.set('size', r.size);
    if (r.fold) p.set('fold', '1');
    if (r.ins) p.set('ins', '1');
    X.writeHash(p, r.adj);
    const h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const area = AREAS.find(a => a.id === p.get('area')) || AREAS[0];
    const byUrl = Object.fromEntries(area.areas.map(a => [a.url, a.key]));
    const set = selectedBy[area.id] = new Set();
    for (const t of (p.get('sel') || '').split(',')) if (byUrl[t]) set.add(byUrl[t]);
    if (SIZE_PRICE[p.get('size')]) $('size').value = p.get('size');
    if (p.get('fold') === '1') $('fold').value = '1';
    if (p.get('ins') === '1') $('insert').value = '1';
    X.readHash(p, area);
    return { area: area.id, map: p.get('map') };
  }

  // ---- コピー用の文章 ----
  function summaryText() {
    const r = calc();
    if (!r.list.length) return '';
    const lines = [`【同時配布】${AREA.title} 選択エリア`];
    for (const g of AREA.groups) {
      const l = r.list.filter(a => a.group === g.id);
      if (!l.length) continue;
      lines.push(`${g.title}：${l.map(a => a.code).join('・')}（${l.length}区画・${fmt(l.reduce((s, a) => s + a.copies, 0))}部）`);
    }
    if (r.adj.amount) lines.push(`調整：${labelOf(r.adj.area)} −${fmt(r.adj.amount)}部（${fmt(r.adj.area.copies)}→${fmt(r.adj.area.copies - r.adj.amount)}部）`);
    lines.push(`合計：${fmt(r.total)}部${r.adj.amount ? `（選択の合計 ${fmt(r.rawTotal)}部から調整）` : ''}`);
    const opts = [r.fold ? `折加工+${r.unitFold}円` : '', r.ins ? `挟み込み+${r.unitIns}円` : ''].filter(Boolean).join('・');
    lines.push(`チラシ${r.size}　単価${fmtUnit(r.unitSize)}円${opts ? '（' + opts + '）' : ''}＝1部${fmtUnit(r.unit)}円`);
    lines.push(`配布料金：${fmt(r.fee)}円（税別）`);
    return lines.join('\n');
  }
  function flash(msg) {
    const box = $('copied');
    box.textContent = msg; box.hidden = false;
    clearTimeout(flash.t); flash.t = setTimeout(() => { box.hidden = true; }, 2500);
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); flash(msg); }
    catch (e) { flash('コピーできませんでした。お手数ですが手動で選択してください。'); }
  }

  // ---- 初期化 ----
  function init() {
    if (!AREAS.length) return;
    X = window.HaifuExtras.create({ labelOf: a => labelOf(a) + (nameOf(a) ? ' ' + nameOf(a) : ''), onChange: update });
    buildAreaTabs();
    const h = readHash();
    setArea(h.area, h.map);
    update();

    ['size', 'fold', 'insert'].forEach(id => $(id).addEventListener('change', update));
    X.bind(() => calc().rawTotal);
    $('zoomIn').addEventListener('click', () => setZoom(zoom + 0.75));
    $('zoomOut').addEventListener('click', () => setZoom(zoom - 0.75));
    $('zoomReset').addEventListener('click', () => setZoom(1));
    $('copyBtn').addEventListener('click', () => {
      const t = summaryText();
      if (!t) { flash('区画がまだ選ばれていません。'); return; }
      copyText(t, '選択内容をコピーしました。メールやLINEに貼り付けられます。');
    });
    $('shareBtn').addEventListener('click', () => copyText(location.href, 'このページのURLをコピーしました。開くと同じ選択状態になります。'));
  }

  init();
})();
