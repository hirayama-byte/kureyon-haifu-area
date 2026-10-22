// 部数の調整（端数合わせ）と代理店。index.html と map.html の両方で使う
//  - 調整: 選んだ区画の中から1つを選び、その区画の部数を減らす（例: 合計30,123部 → 1区画で123部減らして30,000部）
//  - 代理店: チェックすると 1部あたり +1.0円（price.js の calcFee に agent として渡す）
(function () {
  'use strict';
  const { fmt } = window.HaifuPrice;
  const $ = id => document.getElementById(id);

  function create({ labelOf, onChange }) {
    const adjBy = {};   // エリアID → { key, amount }（エリアを切り替えても残す）
    let areaId = null;
    const st = () => (adjBy[areaId] = adjBy[areaId] || { key: '', amount: 0 });
    let lastList = [];
    let dropped = false; // 選択が外れて調整をやめたことを、次の表示で1回だけ知らせる

    // 今の選択から、調整の中身を決める（選択から外れた区画・部数の上限をここで整える）
    function resolve(list) {
      lastList = list;
      const s = st();
      const a = list.find(x => x.key === s.key);
      if (!a) {
        // 調整していた区画の選択が外れたら、調整をやめる（あとで選び直しても勝手に戻らないように）
        if (s.key && s.amount) dropped = true;
        s.key = ''; s.amount = 0;
        return { area: null, amount: 0, raw: 0, over: false };
      }
      const amount = Math.min(Math.max(0, Math.floor(s.amount || 0)), a.copies);
      return { area: a, amount, raw: s.amount, over: (s.amount || 0) > a.copies };
    }

    // 画面を今の状態にそろえる
    function render(list, adj) {
      const sel = $('adjArea');
      const s = st();
      const opts = ['<option value="">区画を選ぶ</option>']
        .concat(list.map(a => `<option value="${a.key}">${labelOf(a)}（${fmt(a.copies)}部）</option>`));
      sel.innerHTML = opts.join('');
      sel.value = adj.area ? adj.area.key : '';
      sel.disabled = !list.length;
      const q = $('adjQty');
      if (document.activeElement !== q) q.value = adj.area && s.amount ? s.amount : '';
      q.disabled = !adj.area;
      $('adjRound').disabled = !list.length;
      const msg = $('adjMsg');
      if (adj.over) { msg.hidden = false; msg.textContent = `${labelOf(adj.area)}は${fmt(adj.area.copies)}部までしか減らせません。`; }
      else if (dropped) { dropped = false; msg.hidden = false; msg.textContent = '調整していた区画の選択が外れたので、調整をやめました。'; }
      else msg.hidden = true;
    }

    // 千部単位にそろえる: 端数を、選んだ区画（未選択なら部数がいちばん多い区画）から減らす
    function roundTo1000(rawTotal) {
      const s = st();
      if (!lastList.length) return;
      const rest = rawTotal % 1000;
      let a = lastList.find(x => x.key === s.key);
      if (!a) a = lastList.slice().sort((x, y) => y.copies - x.copies)[0];
      const msg = $('adjMsg');
      if (rest === 0) { s.key = ''; s.amount = 0; onChange(); msg.hidden = false; msg.textContent = 'すでに千部単位なので、調整はいりません。'; return; }
      if (rest > a.copies) { msg.hidden = false; msg.textContent = `端数${fmt(rest)}部が${labelOf(a)}の部数より多いので、別の区画を選んでください。`; return; }
      s.key = a.key; s.amount = rest;
      onChange();
    }

    function bind(getRawTotal) {
      $('adjArea').addEventListener('change', e => { const s = st(); s.key = e.target.value; if (!s.key) s.amount = 0; onChange(); });
      $('adjQty').addEventListener('input', e => { const v = e.target.value.replace(/[^0-9]/g, ''); st().amount = v ? +v : 0; onChange(); });
      $('adjQty').addEventListener('blur', () => onChange());
      $('adjRound').addEventListener('click', () => roundTo1000(getRawTotal()));
      $('agent').addEventListener('change', onChange);
    }

    return {
      setArea(id) { areaId = id; },
      resolve,
      render,
      bind,
      agent: () => $('agent').checked,
      clear() { const s = st(); s.key = ''; s.amount = 0; },
      // URL: adj=w5:123（区画のURL記号:減らす部数）、ag=1
      writeHash(p, adj) {
        if (adj.area && adj.amount) p.set('adj', adj.area.url + ':' + adj.amount);
        if ($('agent').checked) p.set('ag', '1');
      },
      readHash(p, area) {
        const m = (p.get('adj') || '').match(/^([a-z0-9]+):(\d+)$/);
        if (m) { const a = area.areas.find(x => x.url === m[1]); if (a) adjBy[area.id] = { key: a.key, amount: +m[2] }; }
        if (p.get('ag') === '1') $('agent').checked = true;
      }
    };
  }

  window.HaifuExtras = { create };
})();
