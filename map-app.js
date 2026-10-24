// 同時配布エリア選択（地図版）：実際の地図の上で区画を選び、部数と配布料金を計算する
(function () {
  'use strict';

  const AREAS = window.HAIFU_GEO || [];
  const { SIZE_PRICE, calcFee, fmt, fmtUnit } = window.HaifuPrice;
  const $ = id => document.getElementById(id);
  // 部数の調整（extras.js）
  let X = null;

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
  // 地図に出す呼び名: 一覧の地名に番号が入っていれば地名（北方1 など）、なければ番号（label.js）
  const shortOf = window.HaifuLabel.mapLabel;

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
    X.setArea(AREA.id);
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
    hideCircle();
    if (map) map.hideHome();
    if (map) map.destroy();
    map = window.HaifuMap.create(el);
    zones = {};
    for (const a of AREA.areas) {
      if (!a.polys.length) continue; // 地図に場所がない区画（一覧だけ）
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

  // ---- 円で選ぶ（ピンから半径○km） ----
  // 区画の面積の半分以上が円の中に入っていれば、その区画を選ぶ
  const CIRCLE_SHARE = 0.5;
  let circle = null;        // { lat, lng }（円を出していないときは null）
  let circleHits = [];      // 円に入る区画
  const inRing = (lng, lat, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
  const inArea = (a, lng, lat) => a.polys.some(poly => inRing(lng, lat, poly[0]) && !poly.slice(1).some(h => inRing(lng, lat, h)));
  // 区画の中に格子状の点を打っておく（円に入る割合を数えるため。最初に使うときに1回だけ作る）
  function samplesOf(a) {
    if (a._samples) return a._samples;
    let w = 180, s = 90, e = -180, n = -90;
    for (const poly of a.polys) for (const [lng, lat] of poly[0]) { if (lng < w) w = lng; if (lng > e) e = lng; if (lat < s) s = lat; if (lat > n) n = lat; }
    let pts = [];
    for (const k of [14, 30]) {
      pts = [];
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const lng = w + (e - w) * (i + 0.5) / k, lat = s + (n - s) * (j + 0.5) / k; if (inArea(a, lng, lat)) pts.push([lng, lat]); }
      if (pts.length >= 12) break;
    }
    if (!pts.length) pts = [a.label];
    return (a._samples = pts);
  }
  const distM = (lat1, lng1, lat2, lng2) => { const kx = 111320 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180); return Math.hypot((lng2 - lng1) * kx, (lat2 - lat1) * 110574); };
  function updateCircle() {
    if (!circle) return;
    const r = +$('radius').value;
    circleHits = AREA.areas.filter(a => {
      if (!a.polys.length) return false;
      const pts = samplesOf(a);
      return pts.filter(([lng, lat]) => distM(circle.lat, circle.lng, lat, lng) <= r).length / pts.length >= CIRCLE_SHARE;
    });
    const hitKeys = new Set(circleHits.map(a => a.key));
    AREA.areas.forEach(a => zones[a.key] && zones[a.key].setPreview(hitKeys.has(a.key)));
    const total = circleHits.reduce((s, a) => s + a.copies, 0);
    const fresh = circleHits.filter(a => !selected.has(a.key));
    const freshCopies = fresh.reduce((s, a) => s + a.copies, 0);
    const info = $('circleInfo');
    info.hidden = false;
    info.textContent = circleHits.length
      ? `円の中：${circleHits.length}区画・約${fmt(total)}部` + (fresh.length < circleHits.length ? `（うち未選択 ${fresh.length}区画・${fmt(freshCopies)}部）` : '')
      : '円の中に入る区画がありません。ピンを動かすか、半径を大きくしてください。';
    $('circleAdd').disabled = !fresh.length;
    $('circleAdd').textContent = fresh.length ? `この円の${fresh.length}区画を追加` : '追加する区画はありません';
  }
  function showCircle(lat, lng) {
    circle = { lat, lng };
    map.showCircle(lat, lng, +$('radius').value, ([la, ln]) => { circle = { lat: la, lng: ln }; updateCircle(); });
    ['circleAdd', 'circleClear'].forEach(id => { $(id).hidden = false; });
    $('circleShow').textContent = 'ピンを地図の中心に移動';
    updateCircle();
  }
  function hideCircle() {
    circle = null; circleHits = [];
    if (map) map.hideCircle();
    if (AREA) AREA.areas.forEach(a => zones[a.key] && zones[a.key].setPreview(false));
    ['circleAdd', 'circleClear', 'circleInfo'].forEach(id => { $(id).hidden = true; });
    $('circleShow').textContent = '地図の中心にピンを置く';
  }
  function addCircle() {
    circleHits.forEach(a => selected.add(a.key));
    repaintAll();
    update();
  }

  // ---- 住所 → 緯度経度（国土地理院の住所検索）。配布エリアの近くの結果を優先 ----
  async function geocode(q) {
    // つながらないときは少し待って、もう1回だけ
    let all;
    for (let t = 0; ; t++) {
      try { const res = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q)); all = await res.json(); break; }
      catch (err) { if (t >= 1) throw err; await new Promise(r => setTimeout(r, 800)); }
    }
    const [w, s, e, n] = areaBounds();
    const near = x => { const [lng, lat] = x.geometry.coordinates; return lng > w - 0.01 && lng < e + 0.01 && lat > s - 0.01 && lat < n + 0.01; };
    const list = all.filter(near).concat(all.filter(x => !near(x) && /愛知県/.test(x.properties.title)));
    if (!list.length) return null;
    const [lng, lat] = list[0].geometry.coordinates;
    return { lat, lng, title: list[0].properties.title };
  }

  // ---- おまかせ選択: 住所から近い区画を順に足し、指定の部数に届いたら、いちばん遠い区画で超えた分を減らす ----
  // 近さ = 住所から区画のふちまでの距離（住所が区画の中なら 0）。同じなら区画の番号の位置に近いほう
  function distToArea(a, lat, lng) {
    if (inArea(a, lng, lat)) return 0;
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574;
    let best = Infinity;
    for (const poly of a.polys) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lng) * kx, ay = (ring[i - 1][1] - lat) * ky, bx = (ring[i][0] - lng) * kx, by = (ring[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
  }
  async function omakase() {
    const msg = $('omMsg'); msg.hidden = false;
    const q = $('omAddr').value.trim();
    const target = +$('omCopies').value.replace(/[^0-9]/g, '');
    if (!q) { msg.textContent = '住所を入れてください。'; return; }
    if (!target) { msg.textContent = '部数を入れてください。'; return; }
    msg.textContent = '住所を探しています…';
    let pt;
    try { pt = await geocode(q); } catch (e) { msg.textContent = '住所の検索ができませんでした。時間をおいて試してください。'; return; }
    if (!pt) { msg.textContent = `「${q}」が見つかりませんでした。町名や番地を見直してください。`; return; }
    const cand = AREA.areas.filter(a => a.polys.length)
      .map(a => ({ a, d: distToArea(a, pt.lat, pt.lng), c: distM(pt.lat, pt.lng, a.label[1], a.label[0]) }))
      .sort((p, r) => p.d - r.d || p.c - r.c);
    // 前の選択と調整をやめて、近い順に足す
    hideCircle(); selected.clear(); X.clear();
    const picked = []; let sum = 0;
    for (const x of cand) { if (sum >= target) break; picked.push(x); sum += x.a.copies; }
    picked.forEach(x => selected.add(x.a.key));
    const far = picked[picked.length - 1];
    const over = sum - target;
    if (sum >= target && over > 0) X.set(far.a.key, over);
    repaintAll(); update();
    map.showHome(pt.lat, pt.lng, pt.title);
    map.fitZones(picked.map(x => zones[x.a.key]).filter(Boolean), [pt.lat, pt.lng]);
    const farName = window.HaifuLabel.tableLabel(far.a);
    const km = d => (d / 1000).toFixed(1) + 'km';
    let t = `「${pt.title}」から近い順に ${picked.length}区画を選びました${far.d > 0 ? `（いちばん遠い区画まで約${km(far.d)}）` : `（住所のある区画だけ）`}。`;
    if (sum < target) t += `${AREA.title}をぜんぶ選んでも ${fmt(sum)}部で、${fmt(target)}部に届きません。`;
    else if (over > 0) t += `いちばん遠い ${farName} で ${fmt(over)}部減らして、合計 ${fmt(target)}部にしました。`;
    else t += `ちょうど ${fmt(target)}部です。`;
    if (cand[0] && cand[0].d > 1500) t += `※この住所は${AREA.title}の区画から約${km(cand[0].d)}離れています。エリアの選び間違いがないか確認してください。`;
    msg.textContent = t;
  }

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
      if (circle) showCircle(lat, lng);
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
  // 区画一覧: 画面の横幅に合わせて列の数を決め、区ごとの表を列に分けて並べる（下までスクロールしなくて済むように）
  const COL_MIN = 240; // 1列の最小の幅(px)。地名が長いエリアは、いちばん長い地名が1行に収まる幅まで広げる
  const measure = document.createElement('canvas').getContext('2d');
  function colMin() {
    const td = document.querySelector('#tables td:nth-child(3)');
    measure.font = td ? getComputedStyle(td).font : '14px sans-serif';
    const longest = Math.max(0, ...AREA.areas.map(a => measure.measureText(a.name + (a.noMap ? '　地図なし' : '')).width));
    return Math.max(COL_MIN, Math.ceil(longest) + 28 + 44 + 72 + 30); // チェック・番号・部数の列と余白
  }
  function buildTables() {
    const box = $('tables');
    box.innerHTML = '';
    rows = {};
    box.classList.remove('three');
    const width = box.clientWidth || box.parentElement.clientWidth || 800;
    const nCol = Math.max(1, Math.floor((width + 16) / (colMin() + 16)));
    // 1列あたりの行数（見出しの分も1行と数える）。小さい区はまとめず、そのまま1列に入れる
    const nRows = AREA.areas.length + AREA.groups.length;
    const perCol = nCol === 1 ? Infinity : Math.max(8, Math.ceil(nRows / nCol));
    box.style.gridTemplateColumns = nCol === 1 ? '' : `repeat(${nCol}, minmax(0, 1fr))`;
    for (const grp of AREA.groups) {
      const list = AREA.areas.filter(a => a.group === grp.id);
      const total = list.reduce((s2, a) => s2 + a.copies, 0);
      for (let i = 0; i < list.length; i += perCol) {
        const part = list.slice(i, i + perCol);
        const wrap = document.createElement('div');
        wrap.className = 'ward ward-' + grp.tone;
        wrap.innerHTML = i === 0
          ? `<h3>${grp.title}<span>${list.length}区画・計${fmt(total)}部</span><em class="ward-sel" data-ward-sel="${grp.id}"></em></h3>`
          : `<h3>${grp.title}<span>（続き）</span></h3>`;
        const table = document.createElement('table');
        table.innerHTML = '<thead><tr><th class="c-chk"></th><th class="c-no">番号</th><th>配布エリア</th><th class="c-num">可能部数</th></tr></thead>';
        const tb = document.createElement('tbody');
        for (const a of part) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td class="c-chk"><input type="checkbox" aria-label="${labelOf(a)} ${a.name}"></td>` +
            `<td class="c-no">${a.code}</td><td>${a.name}${a.noMap ? '<span class="no-map">地図なし</span>' : ''}</td><td class="c-num">${fmt(a.copies)}</td>`;
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
  }
  // 画面の幅が変わったら列を組み直す
  let colTimer = null, lastCols = 0;
  function relayoutTables() {
    clearTimeout(colTimer);
    colTimer = setTimeout(() => {
      const w = $('tables').clientWidth;
      const n = Math.max(1, Math.floor((w + 16) / (COL_MIN + 16)));
      if (n === lastCols) return;
      lastCols = n;
      buildTables(); repaintAll(); update();
    }, 150);
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
    const rawTotal = list.reduce((s, a) => s + a.copies, 0);
    const adj = X.resolve(list);          // 部数の調整（1区画から減らす）
    const total = rawTotal - adj.amount;  // 単価の段階も調整後の部数で決まる
    const size = $('size').value, fold = $('fold').value === '1', ins = $('insert').value === '1';
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
    $('unitSize').textContent = fmtUnit(r.unitSize);
    $('unitFold').textContent = r.unitFold; $('foldLine').hidden = !r.fold;
    $('unitInsert').textContent = r.unitIns; $('insertLine').hidden = !r.ins;
    $('unitTotal').textContent = fmtUnit(r.unit);
    $('fee').textContent = fmt(r.fee);
    $('stickyCopies').textContent = fmt(r.total);
    $('stickyFee').textContent = fmt(r.fee);
    writeHash(r);
    updateCircle();
  }

  // ---- URL に選択を残す（配布マップ版と同じ書き方） ----
  function writeHash(r) {
    const p = new URLSearchParams();
    p.set('area', AREA.id); // エリアの並びを変えても開けるように、いつも書く
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
    // area が無いのは、西区・北区が先頭だったころのURL（2026-10-23 まで）
    const area = AREAS.find(a => a.id === (p.get('area') || (p.get('sel') ? 'seihoku' : ''))) || AREAS[0];
    const byUrl = Object.fromEntries(area.areas.map(a => [a.url, a.key]));
    const set = selectedBy[area.id] = new Set();
    for (const t of (p.get('sel') || '').split(',')) if (byUrl[t]) set.add(byUrl[t]);
    if (SIZE_PRICE[p.get('size')]) $('size').value = p.get('size');
    if (p.get('fold') === '1') $('fold').value = '1';
    if (p.get('ins') === '1') $('insert').value = '1';
    X.readHash(p, area);
    return area.id;
  }

  // ---- 保存用のスナップショット（order.js に渡す） ----
  function snapshot() {
    const r = calc();
    return {
      savedAt: Date.now(), areaId: AREA.id, areaTitle: AREA.title, url: location.href,
      sel: r.list.map(a => a.url), size: r.size, fold: r.fold, ins: r.ins,
      adj: r.adj.amount ? { url: r.adj.area.url, amount: r.adj.amount, copies: r.adj.area.copies, label: labelOf(r.adj.area) + (nameOf(r.adj.area) ? ' ' + nameOf(r.adj.area) : '') } : null,
      rawTotal: r.rawTotal, total: r.total, fee: r.fee, text: summaryText()
    };
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
    $('areaTabs').hidden = AREAS.length < 2;
    setArea(readHash());
    update();
    ['size', 'fold', 'insert'].forEach(id => $(id).addEventListener('change', update));
    X.bind(() => calc().rawTotal);
    $('showLabels').addEventListener('change', e => map.setLabels(e.target.checked));
    $('circleShow').addEventListener('click', () => { const [lat, lng] = map.center(); showCircle(lat, lng); });
    $('radius').addEventListener('change', () => { if (circle) { map.setRadius(+$('radius').value); updateCircle(); } else { const [lat, lng] = map.center(); showCircle(lat, lng); } });
    $('circleAdd').addEventListener('click', addCircle);
    $('circleClear').addEventListener('click', hideCircle);
    $('addrForm').addEventListener('submit', e => { e.preventDefault(); searchAddress($('addrInput').value); });
    $('omForm').addEventListener('submit', e => { e.preventDefault(); omakase(); });
    $('omCopies').addEventListener('blur', e => { const v = +e.target.value.replace(/[^0-9]/g, ''); e.target.value = v ? fmt(v) : ''; });
    $('copyBtn').addEventListener('click', () => {
      const t = summaryText();
      if (!t) { flash('区画がまだ選ばれていません。'); return; }
      copyText(t, '選択内容をコピーしました。メールやLINEに貼り付けられます。下の「保存した選択」にも残しました。');
      window.HaifuOrder.save(snapshot());
    });
    $('shareBtn').addEventListener('click', () => copyText(location.href, 'このページのURLをコピーしました。開くと同じ選択状態になります。'));
    window.addEventListener('resize', () => { if (map) map.resize(); relayoutTables(); });
    // 保存した選択を開くとき: URLの選択状態で読み直す
    window.HaifuOrder.init({ restore: url => { const h = url.split('#')[1] || ''; location.hash = h; location.reload(); } });
  }

  init();
})();
