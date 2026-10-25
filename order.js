// 保存した選択（18件まで）と、配布会社向けの申込書PDF（スタッフ用・パスワード）
//   保存先: このブラウザの中（localStorage）。別のパソコン・ブラウザとは共有されない
//   申込書: 1枚目 = エリア別配布部数＋注文書（A3横）／2枚目 = 選択した区画の地図（A3）
(function () {
  'use strict';
  const { fmt, fmtUnit, calcFee } = window.HaifuPrice;
  const $ = id => document.getElementById(id);
  const KEY = 'haifu-saved-v1';
  const MAX = 18;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- 保存リスト ----------------
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const store = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); return true; } catch (e) { return false; } };

  // 今の選択を保存する（同じ内容が直前にあれば重ねない）
  function save(snap) {
    const list = load();
    const sig = s => [s.areaId, s.sel.join(','), s.adj ? s.adj.url + ':' + s.adj.amount : '', s.size, s.fold, s.ins].join('|');
    if (list[0] && sig(list[0]) === sig(snap)) { list[0].savedAt = snap.savedAt; store(list); render(); return; }
    list.unshift({ ...snap, id: Date.now().toString(36), memo: '' });
    if (!store(list)) { alertMsg('このブラウザでは保存できませんでした（プライベートモードなど）。'); return; }
    render();
  }
  function remove(ids) { const del = new Set([].concat(ids)); store(load().filter(x => !del.has(x.id))); render(); }
  function setMemo(id, memo) { const list = load(); const x = list.find(v => v.id === id); if (x) { x.memo = memo; store(list); } }
  function alertMsg(t) { const m = $('savedMsg'); m.textContent = t; m.hidden = false; clearTimeout(alertMsg.t); alertMsg.t = setTimeout(() => { m.hidden = true; }, 3000); }

  function render() {
    const list = load();
    const box = $('savedList');
    $('savedCount').textContent = `${list.length}/${MAX}`;
    $('savedBulk').hidden = !list.length; $('savedAll').checked = false;
    if (!list.length) { box.innerHTML = '<li class="saved-empty">「選択内容をコピー」を押すと、ここに保存されます。</li>'; return; }
    box.innerHTML = list.map(x => {
      const d = new Date(x.savedAt);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<li data-id="${x.id}">
        <input type="checkbox" class="saved-check" aria-label="まとめて削除する対象に選ぶ">
        <div class="saved-main">
          <input class="saved-memo" value="${esc(x.memo)}" placeholder="メモ（クライアント名など）" aria-label="メモ">
          <p class="saved-sum"><b>${esc(x.areaTitle)}</b> ${x.sel.length}区画・<b>${fmt(x.total)}部</b>・${fmt(x.fee)}円<span>${when}</span></p>
        </div>
        <div class="saved-btns">
          <button type="button" data-act="open" title="この内容を地図に戻す">開く</button>
          <button type="button" data-act="pdf" class="saved-pdf">申込書DL</button>
          <button type="button" data-act="del" class="saved-del" aria-label="削除">×</button>
        </div>
      </li>`;
    }).join('');
    checkedChanged();
  }

  // チェックした数を「選んだものを削除」ボタンに出す
  function checkedIds() { return [...document.querySelectorAll('#savedList .saved-check:checked')].map(c => c.closest('li').dataset.id); }
  function checkedChanged() {
    const n = checkedIds().length, all = document.querySelectorAll('#savedList .saved-check').length;
    $('savedDelChecked').disabled = !n; $('savedDelChecked').textContent = n ? `選んだ ${n}件を削除` : '選んだものを削除';
    $('savedAll').checked = !!all && n === all; $('savedAll').indeterminate = n > 0 && n < all;
  }

  // ---------------- スタッフ用（パスワード） ----------------
  let staff = null; // 復号した社内設定
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function unlock(pass) {
    const E = window.HAIFU_STAFF_ENC;
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(E.salt), iterations: E.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(E.iv) }, key, b64(E.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function ensureStaff() {
    if (staff) return true;
    const saved = sessionStorageGet('haifu-staff');
    if (saved) { try { staff = await unlock(saved); return true; } catch (e) { /* 違えば聞き直す */ } }
    return false;
  }
  const sessionStorageGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const sessionStorageSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* なくても動く */ } };
  const localGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const localSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* なくても動く */ } };

  // ---------------- 申込書ダイアログ ----------------
  let current = null; // 申込書を作る保存項目
  async function openOrder(item) {
    current = item;
    const dlg = $('orderDlg');
    $('orderErr').hidden = true;
    const ok = await ensureStaff();
    $('orderLock').hidden = ok;
    $('orderForm').hidden = !ok;
    $('orderMake').hidden = !ok;
    if (ok) fillForm(); else { $('orderPass').value = ''; setTimeout(() => $('orderPass').focus(), 50); }
    dlg.showModal();
  }
  function fillForm() {
    const x = current;
    const today = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    $('oCompany').innerHTML = staff.companies.map(c => `<option>${esc(c)}</option>`).join('');
    $('oCompany').value = localGet('haifu-company') || staff.companies[0];
    $('oEdition').innerHTML = staff.editions.map(c => `<option>${esc(c)}</option>`).join('');
    $('oEdition').value = { seihoku: '西北版', inazawa: '一宮版', ichinomiya: '一宮版', konan: '江南版', kiyosu: '清須版', kitanagoya: '岩倉版', tsushima: '津島版' }[x.areaId] || staff.editions[0];
    $('oDate').value = iso(today);
    $('oFrom').value = ''; $('oTo').value = '';
    $('oClient').value = x.memo || '';
    $('oNote').value = '';
    $('oReq').value = x.adj ? `※${x.adj.label}で部数調整（−${fmt(x.adj.amount)}部）をお願いします` : '';
    $('oStaff').value = localGet('haifu-staff-name') || '';
    $('oUnit').value = staff.cost.base;
    $('oFoldUnit').value = staff.cost.foldBySize ? (staff.cost.foldBySize[x.size] ?? 0) : staff.cost.fold; $('oFoldRow').hidden = !x.fold; // 折加工の仕入れはサイズで変わる
    $('oInsUnit').value = staff.cost.insert; $('oInsRow').hidden = !x.ins;
  }
  async function tryUnlock() {
    const pass = $('orderPass').value.trim();
    try { staff = await unlock(pass); sessionStorageSet('haifu-staff', pass); $('orderLock').hidden = true; $('orderForm').hidden = false; $('orderMake').hidden = false; $('orderErr').hidden = true; fillForm(); }
    catch (e) { const er = $('orderErr'); er.hidden = false; er.textContent = 'パスワードが違います。'; }
  }

  // ---------------- PDF を作る ----------------
  const MM = 200 / 25.4; // 200dpi
  const A3 = { w: Math.round(420 * MM), h: Math.round(297 * MM) };
  const FONT = '"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
  const font = (px, w) => `${w || 400} ${px}px ${FONT}`;

  async function makePdf() {
    const btn = $('orderMake');
    const x = current;
    const area = (window.HAIFU_GEO || []).find(a => a.id === x.areaId);
    if (!area) return;
    const form = {
      company: $('oCompany').value, edition: $('oEdition').value, date: $('oDate').value,
      from: $('oFrom').value, to: $('oTo').value, client: $('oClient').value.trim(), note: $('oNote').value.trim(),
      req: $('oReq').value.trim(), staffName: $('oStaff').value.trim(),
      unit: +$('oUnit').value || 0, foldUnit: x.fold ? (+$('oFoldUnit').value || 0) : 0, insUnit: x.ins ? (+$('oInsUnit').value || 0) : 0
    };
    localSet('haifu-company', form.company); localSet('haifu-staff-name', form.staffName);
    if (form.client && form.client !== x.memo) { setMemo(x.id, form.client); x.memo = form.client; render(); }
    btn.disabled = true; btn.textContent = '作成中…（地図を読み込んでいます）';
    try {
      await document.fonts.load(font(20, 700)); await document.fonts.load(font(20));
      const p1 = drawSheet(area, x, form);
      const p2 = await drawMap(area, x, form);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
      pdf.addImage(p1.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 420, 297);
      pdf.addPage('a3', p2.width >= p2.height ? 'landscape' : 'portrait');
      const [w, h] = p2.width >= p2.height ? [420, 297] : [297, 420];
      pdf.addImage(p2.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, w, h);
      const d = form.date.replace(/-/g, '');
      pdf.save(`同時配布申込書_${area.title}_${form.client || 'クライアント未入力'}_${d}.pdf`);
      $('orderDlg').close();
    } catch (e) {
      const er = $('orderErr'); er.hidden = false; er.textContent = 'PDFを作れませんでした。通信状態を確かめて、もう一度押してください。（' + e.message + '）';
    } finally { btn.disabled = false; btn.textContent = 'PDFをダウンロード（2枚）'; }
  }

  // 保存した内容から、区画ごとの「今回」部数を出す
  function quantities(area, x) {
    const sel = new Set(x.sel);
    const q = {};
    for (const a of area.areas) q[a.key] = sel.has(a.url) ? a.copies - (x.adj && x.adj.url === a.url ? x.adj.amount : 0) : 0;
    return q;
  }

  // 1枚目: エリア別配布部数 ＋ 注文書（A3横）
  function drawSheet(area, x, f) {
    const cv = document.createElement('canvas'); cv.width = A3.w; cv.height = A3.h;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    const q = quantities(area, x);
    const L = 12 * MM, T = 12 * MM, R = A3.w - 12 * MM;
    // 見出し
    const srcDate = (area.source.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/) || []).slice(1).join('/');
    g.fillStyle = '#111'; g.font = font(5.2 * MM, 700); g.textBaseline = 'alphabetic';
    g.fillText(`${area.title}　エリア別 配布部数`, L, T + 5 * MM);
    g.font = font(3.4 * MM, 400); g.fillText(srcDate ? `${srcDate} 現在` : '', L + 110 * MM, T + 5 * MM);

    // 区画の表（区ごと・1列 最大 rowsMax 行）
    const cols = [];
    const totalRows = area.areas.length;
    const rowsMax = Math.max(30, Math.min(42, Math.ceil(totalRows / 5)));
    // 地域が少なければ地域ごとに1列。多いとき（一宮は15地域）は、地域をまたいで詰めて並べる（列が細くなって部数が切れないように）
    const perGroup = area.groups.reduce((n, grp) => n + Math.ceil(area.areas.filter(a => a.group === grp.id).length / rowsMax), 0);
    if (perGroup <= 6) {
      for (const grp of area.groups) {
        const list = area.areas.filter(a => a.group === grp.id);
        for (let i = 0; i < list.length; i += rowsMax) cols.push({ grp, list: list.slice(i, i + rowsMax) });
      }
    } else {
      const all = area.groups.flatMap(grp => area.areas.filter(a => a.group === grp.id));
      for (let i = 0; i < all.length; i += rowsMax) cols.push({ grp: null, list: all.slice(i, i + rowsMax) });
    }
    const tableTop = T + 10 * MM;
    const sideW = 92 * MM;
    const gap = 3 * MM;
    // 下の注文書（約65mm）を残して、表で紙面を使い切る
    const rowH = Math.min(6 * MM, (A3.h - tableTop - 75 * MM) / (rowsMax + 2));
    // 列の幅: ふだんは 62mm。長い地名があるときは、紙の幅が許すかぎり広げる（地名の欄が 1行に収まるように）
    g.font = font(rowH * 0.5, 400);
    const longest = Math.max(...area.areas.map(a => g.measureText(window.HaifuLabel.tableLabel(a)).width)) + 10;
    const room = (R - L - sideW - gap * cols.length) / cols.length;
    const nameR = 0.46;
    const colW = Math.min(room, Math.max(62 * MM, longest / nameR));
    const cw = [nameR, 0.2, 0.12, 0.22].map(r => r * colW); // 配布エリア / 可能部数 / 選択 / 今回
    const cell = (x0, y0, w, h, text, o = {}) => {
      if (o.fill) { g.fillStyle = o.fill; g.fillRect(x0, y0, w, h); }
      g.strokeStyle = '#9CA3AF'; g.lineWidth = 1; g.strokeRect(x0, y0, w, h);
      if (text === '' || text == null) return;
      g.fillStyle = o.color || '#111'; g.font = font(o.size || rowH * 0.62, o.bold ? 700 : 400);
      g.textBaseline = 'middle';
      let t = String(text);
      // 長い地名は切らずに文字を小さくして収める（小さくしすぎない所まで。それでも入らなければ切る）
      let fs0 = o.size || rowH * 0.62;
      while (g.measureText(t).width > w - 6 && fs0 > rowH * 0.25) { fs0 *= 0.94; g.font = font(fs0, o.bold ? 700 : 400); }
      while (g.measureText(t).width > w - 6 && t.length > 1) t = t.slice(0, -1);
      const tx = o.align === 'right' ? x0 + w - 5 - g.measureText(t).width : o.align === 'center' ? x0 + (w - g.measureText(t).width) / 2 : x0 + 4;
      g.fillText(t, tx, y0 + h / 2 + 1);
    };
    const tone = { nishi: '#FCE7F3', kita: '#E0F2FE', heiwa: '#DCFCE7', iwakura: '#EDE9FE' };
    let sumAll = 0, sumSel = 0, sumNow = 0;
    cols.forEach((c, i) => {
      const x0 = L + i * (colW + gap);
      let y = tableTop;
      const hd = ['配布エリア', '可能部数', '選択', '今回'];
      let xx = x0; hd.forEach((h, k) => { cell(xx, y, cw[k], rowH, h, { fill: '#FEF3C7', bold: true, align: 'center', size: rowH * 0.46 }); xx += cw[k]; });
      y += rowH;
      let cAll = 0, cSel = 0, cNow = 0;
      for (const a of c.list) {
        const on = q[a.key] > 0 || x.sel.includes(a.url);
        // 地名に番号が入っている（祖父江7・北方1・木曽川⑩・開明1 A1 など）なら地名だけ、それ以外は「番号 地名」（label.js）
        const label = window.HaifuLabel.tableLabel(a);
        const adjMark = x.adj && x.adj.url === a.url;
        xx = x0;
        cell(xx, y, cw[0], rowH, label, { fill: tone[(c.grp || area.groups.find(g => g.id === a.group)).tone] }); xx += cw[0];
        cell(xx, y, cw[1], rowH, fmt(a.copies), { align: 'right' }); xx += cw[1];
        cell(xx, y, cw[2], rowH, on ? '1' : '', { align: 'center', fill: '#DBEAFE', color: '#1D4ED8', bold: on }); xx += cw[2];
        cell(xx, y, cw[3], rowH, on ? fmt(q[a.key]) : '0', { align: 'right', fill: adjMark ? '#FDE047' : on ? '#FEF9C3' : '#FFF7ED', color: on ? '#C2410C' : '#2563EB', bold: on });
        cAll += a.copies; if (on) { cSel++; cNow += q[a.key]; }
        y += rowH;
      }
      for (let k = c.list.length; k < rowsMax; k++) { xx = x0; cw.forEach(w => { cell(xx, y, w, rowH, ''); xx += w; }); y += rowH; }
      xx = x0;
      cell(xx, y, cw[0], rowH, '合　計', { bold: true, align: 'center' }); xx += cw[0];
      cell(xx, y, cw[1], rowH, fmt(cAll), { align: 'right', color: '#1D4ED8' }); xx += cw[1];
      cell(xx, y, cw[2], rowH, String(cSel), { align: 'center', fill: '#FEF08A', bold: true }); xx += cw[2];
      cell(xx, y, cw[3], rowH, fmt(cNow), { align: 'right', fill: '#FEF08A', bold: true });
      sumAll += cAll; sumSel += cSel; sumNow += cNow;
    });

    // 右側: 全エリア合計と売値
    const sx = R - sideW, sy = tableTop + (rowsMax - 8) * rowH;
    const sw = [0.4, 0.24, 0.14, 0.22].map(r => r * sideW);
    let yy = sy;
    cell(sx + sw[0] + sw[1], yy, sw[2], rowH, '選択', { fill: '#DBEAFE', align: 'center', size: rowH * 0.5 }); cell(sx + sw[0] + sw[1] + sw[2], yy, sw[3], rowH, '今回', { fill: '#DBEAFE', align: 'center', size: rowH * 0.5 });
    yy += rowH;
    cell(sx, yy, sw[0], rowH, '全エリア合計', { bold: true }); cell(sx + sw[0], yy, sw[1], rowH, fmt(sumAll), { align: 'right', color: '#1D4ED8' });
    cell(sx + sw[0] + sw[1], yy, sw[2], rowH, String(sumSel), { align: 'center', fill: '#FEF08A', bold: true }); cell(sx + sw[0] + sw[1] + sw[2], yy, sw[3], rowH, fmt(sumNow), { align: 'right', fill: '#FEF08A', bold: true });
    yy += rowH * 1.4;
    const sale = calcFee(sumNow, x.size, x.fold, x.ins);
    const lines = [['チラシサイズ⇒', x.size, fmtUnit(sale.unitSize)], ['※折加工追加 ⇒', x.fold ? '必要' : '不要', fmtUnit(sale.unitFold)], ['※挟み込み配布⇒', x.ins ? '必要' : '不要', fmtUnit(sale.unitIns)]];
    cell(sx + sw[0], yy, sw[1], rowH, '選択', { fill: '#DBEAFE', align: 'center', size: rowH * 0.5 }); cell(sx + sw[0] + sw[1], yy, sw[2], rowH, '単価', { align: 'center', size: rowH * 0.5 });
    yy += rowH;
    for (const [a, b, c] of lines) { cell(sx, yy, sw[0], rowH, a); cell(sx + sw[0], yy, sw[1], rowH, b, { align: 'center', fill: '#DBEAFE' }); cell(sx + sw[0] + sw[1], yy, sw[2], rowH, c, { align: 'right' }); yy += rowH; }
    cell(sx + sw[0] + sw[1], yy - rowH, sw[3] + 0, rowH, '');
    cell(sx + sw[0] + sw[1] + sw[2], yy - rowH, sw[3], rowH, '配布料金', { fill: '#ECFCCB', align: 'center', size: rowH * 0.5 });
    cell(sx + sw[0] + sw[1], yy, sw[2], rowH, '税別', { align: 'center', size: rowH * 0.5 }); cell(sx + sw[0] + sw[1] + sw[2], yy, sw[3], rowH, fmt(sale.fee), { align: 'right', fill: '#ECFCCB', bold: true });
    if (x.adj) { g.fillStyle = '#B45309'; g.font = font(rowH * 0.55); g.textBaseline = 'alphabetic'; g.fillText(`※ ${x.adj.label}：${fmt(x.adj.copies)}部 → ${fmt(x.adj.copies - x.adj.amount)}部（−${fmt(x.adj.amount)}部 調整）`, sx, yy + rowH * 2); }

    // 下: 注文書
    const oy = tableTop + (rowsMax + 2) * rowH + 8 * MM;
    const oh = Math.min(9 * MM, (A3.h - 10 * MM - oy - 7 * MM) / 5);
    g.fillStyle = '#111'; g.font = font(4.6 * MM, 700); g.textBaseline = 'alphabetic';
    g.fillText('情報誌くれよん　同時配布注文書', L, oy - 2 * MM);
    const ow = R - L, priceW = 72 * MM, leftW = ow - priceW;
    const md = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${+m}/${+d}`; };
    const ymd = s => (s ? s.replace(/-/g, '/') : '');
    const big = oh * 0.36;
    const row = (y, parts) => { let xx = L; for (const [w, t, o] of parts) { cell(xx, y, w, oh, t, { size: big, ...(o || {}) }); xx += w; } };
    const Y = '#FEF9C3';
    const u = leftW / 12;
    const cost = () => ({ base: sumNow * f.unit, fold: x.fold ? sumNow * f.foldUnit : 0, ins: x.ins ? sumNow * f.insUnit : 0 });
    const c = cost();
    // 金額欄の見出し
    const px = L + leftW, pw = [0.4, 0.22, 0.16, 0.22].map(r => r * priceW);
    cell(px + pw[0], oy - oh * 0.7, pw[1], oh * 0.7, '部数', { align: 'center', size: big * 0.9 }); cell(px + pw[0] + pw[1], oy - oh * 0.7, pw[2], oh * 0.7, '単価', { align: 'center', size: big * 0.9 }); cell(px + pw[0] + pw[1] + pw[2], oy - oh * 0.7, pw[3], oh * 0.7, '金額', { align: 'center', size: big * 0.9 });
    const price = (y, label, n, unit, amt, o) => { cell(px, y, pw[0], oh, label, { size: big, fill: '#F3F4F6' }); cell(px + pw[0], y, pw[1], oh, fmt(n), { size: big, align: 'right', fill: Y, ...(o || {}) }); cell(px + pw[0] + pw[1], y, pw[2], oh, fmtUnit(unit), { size: big, align: 'right', fill: Y }); cell(px + pw[0] + pw[1] + pw[2], y, pw[3], oh, fmt(Math.round(amt)), { size: big, align: 'right', fill: Y }); };
    row(oy, [[u * 3, f.company, { fill: Y, align: 'center', bold: true }], [u * 1.5, '申込日', { fill: '#F3F4F6', align: 'center' }], [u * 2.5, ymd(f.date), { fill: Y, align: 'center' }], [u * 3, staff.sender, { fill: Y, align: 'center' }], [u * 2, f.staffName, { fill: Y, align: 'center' }]]);
    price(oy, '部数', sumNow, f.unit, c.base);
    row(oy + oh, [[u * 1.5, '配布エリア', { fill: '#F3F4F6' }], [u * 1.5, f.edition, { fill: Y, align: 'center' }], [u * 1.5, '配布期間', { fill: '#F3F4F6', align: 'center' }], [u * 2.5, f.from || f.to ? `${md(f.from)} ～ ${md(f.to)}` : '', { fill: Y, align: 'center' }], [u * 5, '', { fill: '#F3F4F6' }]]);
    price(oy + oh, '折り加工', x.fold ? sumNow : 0, f.foldUnit, c.fold);
    row(oy + oh * 2, [[u * 1.5, '配布形態', { fill: '#F3F4F6' }], [u * 1.5, '同時配布', { fill: Y, align: 'center' }], [u * 1.5, '商品', { fill: '#F3F4F6', align: 'center' }], [u * 2.5, 'チラシ', { fill: Y, align: 'center' }], [u * 1.5, 'サイズ', { fill: '#F3F4F6', align: 'center' }], [u * 1.5, x.size, { fill: Y, align: 'center' }], [u * 2, '', { fill: '#F3F4F6' }]]);
    price(oy + oh * 2, '挟み込み', x.ins ? sumNow : 0, f.insUnit, c.ins);
    row(oy + oh * 3, [[u * 1.5, 'クライアント名', { fill: '#F3F4F6' }], [u * 5, f.client, { fill: Y }], [u * 1.5, '備考(納品)', { fill: '#F3F4F6', align: 'center' }], [u * 4, f.note, { fill: Y }]]);
    cell(px, oy + oh * 3, pw[0] + pw[1], oh, '合計', { size: big, align: 'center', fill: '#F3F4F6' }); cell(px + pw[0] + pw[1], oy + oh * 3, pw[2], oh, fmtUnit(f.unit + f.foldUnit + f.insUnit), { size: big, align: 'right', fill: Y }); cell(px + pw[0] + pw[1] + pw[2], oy + oh * 3, pw[3], oh, fmt(Math.round(c.base + c.fold + c.ins)), { size: big, align: 'right', fill: Y, bold: true });
    row(oy + oh * 4, [[u * 1.5, '依頼事項', { fill: '#F3F4F6' }], [leftW - u * 1.5, f.req, { fill: Y }]]);
    return cv;
  }

  // 2枚目: 選択した区画の地図（A3。形に合わせて縦横を決める）
  const lon2x = (lng, z) => (lng + 180) / 360 * 256 * 2 ** z;
  const lat2y = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
  const loadImg = src => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

  async function drawMap(area, x, f) {
    const q = quantities(area, x);
    const sel = area.areas.filter(a => x.sel.includes(a.url) && a.polys.length);
    const noMapSel = area.areas.filter(a => x.sel.includes(a.url) && !a.polys.length);
    let w = 180, s = 90, e = -180, n = -90;
    for (const a of sel) for (const poly of a.polys) for (const [lng, lat] of poly[0]) { if (lng < w) w = lng; if (lng > e) e = lng; if (lat < s) s = lat; if (lat > n) n = lat; }
    // まわりに少し余白（選択範囲の15%・最低300m）
    const padX = Math.max((e - w) * 0.15, 0.0035), padY = Math.max((n - s) * 0.15, 0.0028);
    w -= padX; e += padX; s -= padY; n += padY;
    const head = 16 * MM;
    const landscape = (lon2x(e, 15) - lon2x(w, 15)) >= (lat2y(s, 15) - lat2y(n, 15));
    const W = landscape ? A3.w : A3.h, H = landscape ? A3.h : A3.w;
    const mapW = W - 16 * MM, mapH = H - head - 12 * MM;
    // 入る中でいちばん詳しいズーム（地図の文字が読めるよう、タイルは拡大しすぎない）
    let z = 18;
    while (z > 10 && ((lon2x(e, z) - lon2x(w, z)) > mapW / 1.6 || (lat2y(s, z) - lat2y(n, z)) > mapH / 1.6)) z--;
    const pxW = lon2x(e, z) - lon2x(w, z), pxH = lat2y(s, z) - lat2y(n, z);
    const k = Math.min(mapW / pxW, mapH / pxH);
    const ox = 8 * MM + (mapW - pxW * k) / 2, oy = head + (mapH - pxH * k) / 2;
    const X = lng => ox + (lon2x(lng, z) - lon2x(w, z)) * k, Yp = lat => oy + (lat2y(lat, z) - lat2y(n, z)) * k;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    // タイル
    const tx0 = Math.floor(lon2x(w, z) / 256), tx1 = Math.floor(lon2x(e, z) / 256), ty0 = Math.floor(lat2y(n, z) / 256), ty1 = Math.floor(lat2y(s, z) / 256);
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(loadImg(`https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${tx}/${ty}.png`).then(im => ({ im, tx, ty })));
    const tiles = await Promise.all(jobs);
    g.save(); g.beginPath(); g.rect(ox, oy, pxW * k, pxH * k); g.clip();
    for (const t of tiles) if (t.im) g.drawImage(t.im, ox + (t.tx * 256 - lon2x(w, z)) * k, oy + (t.ty * 256 - lat2y(n, z)) * k, 256 * k + 1, 256 * k + 1);
    // 区画
    const path = a => { g.beginPath(); for (const poly of a.polys) for (const ring of poly) ring.forEach(([lng, lat], i) => (i ? g.lineTo(X(lng), Yp(lat)) : g.moveTo(X(lng), Yp(lat)))); };
    for (const a of area.areas.filter(v => v.polys.length)) { path(a); g.strokeStyle = 'rgba(190,24,93,.55)'; g.lineWidth = 2; g.stroke(); }
    for (const a of sel) { path(a); g.fillStyle = 'rgba(249,115,22,.42)'; g.fill('evenodd'); g.strokeStyle = '#C2410C'; g.lineWidth = 5; g.stroke(); }
    // 選択区画のラベル
    const fs = Math.max(4 * MM, Math.min(6 * MM, k * 9));
    for (const a of sel) {
      const lx = X(a.label[0]), ly = Yp(a.label[1]);
      const adj = x.adj && x.adj.url === a.url;
      const t1 = window.HaifuLabel.mapLabel(a), t2 = fmt(q[a.key]) + '部' + (adj ? '※' : '');
      g.font = font(fs, 700); const w1 = g.measureText(t1).width; g.font = font(fs * 0.8, 700); const w2 = g.measureText(t2).width;
      const bw = Math.max(w1, w2) + fs * 0.8, bh = fs * 2.2;
      g.fillStyle = adj ? '#FDE047' : '#fff'; g.strokeStyle = '#C2410C'; g.lineWidth = 3;
      g.beginPath(); g.rect(lx - bw / 2, ly - bh / 2, bw, bh); g.fill(); g.stroke();
      g.fillStyle = '#7C2D12'; g.textBaseline = 'middle'; g.font = font(fs, 700); g.fillText(t1, lx - w1 / 2, ly - bh * 0.22);
      g.font = font(fs * 0.8, 700); g.fillText(t2, lx - w2 / 2, ly + bh * 0.25);
    }
    g.restore();
    g.strokeStyle = '#374151'; g.lineWidth = 3; g.strokeRect(ox, oy, pxW * k, pxH * k);
    // 見出し
    g.fillStyle = '#111'; g.textBaseline = 'alphabetic'; g.font = font(5.5 * MM, 700);
    g.fillText(`同時配布エリア　${area.title}`, 8 * MM, 10 * MM);
    g.font = font(3.8 * MM, 400);
    const total = Object.values(q).reduce((s2, v) => s2 + v, 0);
    const info = [`${sel.length}区画　合計 ${fmt(total)}部`, f.client ? `クライアント：${f.client}` : '', f.from || f.to ? `配布期間：${(f.from || '').replace(/-/g, '/')} ～ ${(f.to || '').replace(/-/g, '/')}` : ''].filter(Boolean).join('　／　');
    g.fillText(info, 8 * MM, 15 * MM);
    if (x.adj) { g.fillStyle = '#B45309'; g.font = font(3.2 * MM); g.fillText(`※ ${x.adj.label} は −${fmt(x.adj.amount)}部 調整（${fmt(x.adj.copies)}→${fmt(x.adj.copies - x.adj.amount)}部）`, W / 2, 15 * MM); }
    if (noMapSel.length) { g.fillStyle = '#B45309'; g.font = font(3.2 * MM); g.fillText('※ 地図に場所がない区画も選択：' + noMapSel.map(a => a.group + a.code + '（' + fmt(q[a.key]) + '部）').join('・'), 8 * MM, H - 10 * MM); }
    g.fillStyle = '#6B7280'; g.font = font(2.6 * MM); g.fillText('地図：国土地理院　区画の境目は実際と数十メートルずれることがあります', 8 * MM, H - 5 * MM);
    return cv;
  }

  // ---------------- 初期化 ----------------
  function init(opts) {
    render();
    $('savedList').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.closest('li').dataset.id; const item = load().find(v => v.id === id); if (!item) return;
      if (b.dataset.act === 'del') remove(id);
      if (b.dataset.act === 'open') opts.restore(item.url);
      if (b.dataset.act === 'pdf') openOrder(item);
    });
    $('savedList').addEventListener('change', e => {
      if (e.target.classList.contains('saved-memo')) setMemo(e.target.closest('li').dataset.id, e.target.value.trim());
      if (e.target.classList.contains('saved-check')) checkedChanged();
    });
    $('savedAll').addEventListener('change', () => { document.querySelectorAll('#savedList .saved-check').forEach(c => { c.checked = $('savedAll').checked; }); checkedChanged(); });
    $('savedDelChecked').addEventListener('click', () => {
      const ids = checkedIds(); if (!ids.length) return;
      if (!confirm(`チェックした ${ids.length}件の保存を削除します。元に戻せません。よろしいですか？`)) return;
      remove(ids); alertMsg(`${ids.length}件を削除しました。`);
    });
    $('orderUnlock').addEventListener('click', tryUnlock);
    $('orderPass').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });
    $('orderMake').addEventListener('click', makePdf);
    $('orderClose').addEventListener('click', () => $('orderDlg').close());
    // 配布開始日を選んだら、配布完了日は +5日 を自動で入れる（あとから変えられる）
    $('oFrom').addEventListener('change', () => {
      const v = $('oFrom').value; if (!v) return;
      const [y, m, d] = v.split('-').map(Number);
      const t = new Date(y, m - 1, d + 5);
      $('oTo').value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    });
  }

  window.HaifuOrder = { init, save };
})();
