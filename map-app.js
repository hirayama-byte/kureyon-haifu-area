// 同時配布エリア選択（地図版）：実際の地図の上で区画を選び、部数と配布料金を計算する
(function () {
  'use strict';

  const AREAS = window.HAIFU_GEO || [];
  const { SIZE_PRICE, calcFee, fmt, fmtUnit } = window.HaifuPrice;
  const $ = id => document.getElementById(id);

  let AREA = null;
  let map = null;
  const selectedBy = {};
  let selected = new Set();
  let zones = {};   // key -> 地図上の区画
  let rows = {};    // key -> 一覧の行

  const groupOf = a => AREA.groups.find(g => g.id === a.group);
  const labelOf = a => `${groupOf(a).title} ${a.code}`;
  // 地名が「祖父江7」のように番号と同じなら、地名は重ねて出さない
  const nameOf = a => (a.name === a.group + a.code ? '' : a.name);
  // 地図に出す番号: 北区は「北41」、祖父江・平和は「祖父江1」、それ以外は番号だけ
  const shortOf = a => (a.group === '北' || a.group === '祖父江' || a.group === '平和' ? a.group : '') + a.code;

  // ---- エリア ----
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
  function setArea(id) {
    AREA = AREAS.find(a => a.id === id) || AREAS[0];
    selected = selectedBy[AREA.id] = selectedBy[AREA.id] || new Set();
    document.querySelectorAll('#areaTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.area === AREA.id)));
    $('source').textContent = AREA.source;
    $('legend').innerHTML = AREA.groups.map(g => `<span><i class="sw sw-${g.tone}"></i>${g.title}</span>`).join('') + '<span><i class="sw sw-sel"></i>選択中</span>';
    buildMap();
    buildBulk();
    buildTables();
    AREA.areas.forEach(a => paint(a.key));
  }

  // ---- 地図 ----
  function buildMap() {
    const el = $('geoMap');
    if (map) map.destroy();
    map = window.HaifuMap.create(el);
    zones = {};
    for (const a of AREA.areas) {
      const tone = groupOf(a).tone;
      zones[a.key] = map.addZone(
        { polys: a.polys, label: a.label, tone, text: shortOf(a) },
        { onClick: () => { toggle(a.key); showTip(a, true); }, onHover: on => (on ? showTip(a, false) : hideTip()) }
      );
    }
    map.setLabels($('showLabels').checked);
    map.fitAll();
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

  // ---- 住所で地図を移動（国土地理院の住所検索） ----
  async function searchAddress(q) {
    const msg = $('addrMsg');
    q = q.trim();
    if (!q) return;
    msg.hidden = false; msg.textContent = '検索しています…';
    try {
      const res = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q));
      const all = await res.json();
      // 配布エリアの範囲（少し広め）に入る結果を優先する。無ければ愛知県内の結果
      const [w, s, e, n] = areaBounds();
      const inArea = x => { const [lng, lat] = x.geometry.coordinates; return lng > w - 0.01 && lng < e + 0.01 && lat > s - 0.01 && lat < n + 0.01; };
      const list = all.filter(inArea).concat(all.filter(x => !inArea(x) && /愛知県/.test(x.properties.title)));
      if (!list.length) { msg.textContent = `「${q}」が配布エリアの近くに見つかりませんでした。`; return; }
      const [lng, lat] = list[0].geometry.coordinates;
      map.panTo(lat, lng, 16);
      msg.textContent = `「${list[0].properties.title}」に移動しました。`;
      setTimeout(() => { msg.hidden = true; }, 3000);
    } catch (e) {
      msg.textContent = '住所の検索ができませんでした。時間をおいて試してください。';
    }
  }

  function areaBounds() {
    let w = 180, s = 90, e = -180, n = -90;
    for (const a of AREA.areas) for (const poly of a.polys) for (const [lng, lat] of poly[0]) { if (lng < w) w = lng; if (lng > e) e = lng; if (lat < s) s = lat; if (lat > n) n = lat; }
    return [w, s, e, n];
  }

  // ---- 一覧 ----
  function buildBulk() {
    const box = $('bulk');
    box.innerHTML = '';
    for (const g of AREA.groups) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = `${g.title}をすべて選択`;
      b.addEventListener('click', () => { AREA.areas.forEach(a => { if (a.group === g.id) selected.add(a.key); }); repaintAll(); update(); });
      box.appendChild(b);
    }
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'danger'; c.textContent = 'すべて解除';
    c.addEventListener('click', () => { selected.clear(); repaintAll(); update(); });
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
    if (zones[key]) zones[key].setSelected(on);
    if (rows[key]) { rows[key].classList.toggle('selected', on); rows[key].querySelector('input').checked = on; }
  }
  function repaintAll() { AREA.areas.forEach(a => paint(a.key)); }

  function calc() {
    const list = AREA.areas.filter(a => selected.has(a.key));
    const total = list.reduce((s, a) => s + a.copies, 0);
    const size = $('size').value, fold = $('fold').value === '1', ins = $('insert').value === '1';
    return { list, total, size, fold, ins, ...calcFee(total, size, fold, ins) };
  }

  function update() {
    const r = calc();
    $('totalCopies').textContent = fmt(r.total);
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
    $('unitSize').textContent = fmtUnit(r.unitSize);
    $('unitFold').textContent = r.unitFold; $('foldLine').hidden = !r.fold;
    $('unitInsert').textContent = r.unitIns; $('insertLine').hidden = !r.ins;
    $('unitTotal').textContent = fmtUnit(r.unit);
    $('fee').textContent = fmt(r.fee);
    $('stickyCopies').textContent = fmt(r.total);
    $('stickyFee').textContent = fmt(r.fee);
    writeHash(r);
  }

  // ---- URL に選択を残す（配布マップ版と同じ書き方） ----
  function writeHash(r) {
    const p = new URLSearchParams();
    if (AREA !== AREAS[0]) p.set('area', AREA.id);
    const sel = AREA.areas.filter(a => selected.has(a.key)).map(a => a.url).join(',');
    if (sel) p.set('sel', sel);
    if (r.size !== 'A4') p.set('size', r.size);
    if (r.fold) p.set('fold', '1');
    if (r.ins) p.set('ins', '1');
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
    return area.id;
  }

  // ---- コピー ----
  function summaryText() {
    const r = calc();
    if (!r.list.length) return '';
    const lines = [`【同時配布】${AREA.title} 選択エリア`];
    for (const g of AREA.groups) {
      const l = r.list.filter(a => a.group === g.id);
      if (!l.length) continue;
      lines.push(`${g.title}：${l.map(a => a.code).join('・')}（${l.length}区画・${fmt(l.reduce((s, a) => s + a.copies, 0))}部）`);
    }
    lines.push(`合計：${fmt(r.total)}部`);
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
    buildAreaTabs();
    $('areaTabs').hidden = AREAS.length < 2;
    setArea(readHash());
    update();
    ['size', 'fold', 'insert'].forEach(id => $(id).addEventListener('change', update));
    $('showLabels').addEventListener('change', e => map.setLabels(e.target.checked));
    $('addrForm').addEventListener('submit', e => { e.preventDefault(); searchAddress($('addrInput').value); });
    $('copyBtn').addEventListener('click', () => {
      const t = summaryText();
      if (!t) { flash('区画がまだ選ばれていません。'); return; }
      copyText(t, '選択内容をコピーしました。メールやLINEに貼り付けられます。');
    });
    $('shareBtn').addEventListener('click', () => copyText(location.href, 'このページのURLをコピーしました。開くと同じ選択状態になります。'));
    window.addEventListener('resize', () => map && map.resize());
  }

  init();
})();
