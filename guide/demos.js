// node guide/demos.js — 使い方ガイドの「動きで見る」用: 地図版（map.html）の写真（guide/img/demo-*.png）を撮り、押す場所を実際の画面の部品から測って guide/demos.json に書く
// 座標は手で打たない（画面を直したら、これを実行 → node guide/build-demos.js で index.html に反映 → node guide/verify-demos.js で確認）
// PW=<npx の playwright の場所> node guide/demos.js [demo-id ...]   … id を付けるとその分だけ撮り直す
// 地図の背景は国土地理院のタイル（ネット）。読み込めなかったタイルは読み直してから撮る。住所検索（国土地理院）は写真が毎回同じになるよう、決まった場所を返す
var pw = require(process.env.PW || 'playwright'), path = require('path'), fs = require('fs');
var OUT = path.join(__dirname, 'img'), JSON_OUT = path.join(__dirname, 'demos.json');
var PORT = 8812;
var srv = require('./serve.js')(PORT);
var r1 = function (v) { return Math.round(v * 10) / 10; };
// 住所検索の答え（一宮市木曽川町里小牧のあたり・写真用の決まった値）
var GEO = [{ geometry: { coordinates: [136.7745, 35.3535] }, properties: { title: '愛知県一宮市木曽川町里小牧' } }];

// ---------- 共通 ----------
async function openPage(b, o) {
  o = o || {};
  var ctx = await b.newContext({ viewport: { width: o.w || 1440, height: o.h || 900 }, deviceScaleFactor: o.dsf || 1, isMobile: !!o.mobile, hasTouch: !!o.mobile });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:' + PORT });
  var p = await ctx.newPage();
  p.on('pageerror', function (e) { console.error('pageerror', e); });
  await p.route('https://msearch.gsi.go.jp/**', function (r) { r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(GEO) }); });
  await p.goto('http://localhost:' + PORT + '/map.html' + (o.hash || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await tiles(p);
  return p;
}
// 地図の背景（タイル）が全部出るまで待つ。失敗したものは読み直す
async function tiles(p) {
  for (var k = 0; k < 40; k++) {
    var st = await p.evaluate(function (k) {
      var im = [].slice.call(document.querySelectorAll('.leaflet-tile'));
      var bad = im.filter(function (i) { return i.complete && !i.naturalWidth; });
      bad.forEach(function (i) { var s = i.src.replace(/[?&]r=\d+$/, ''); i.src = s + (s.indexOf('?') < 0 ? '?' : '&') + 'r=' + k; });
      return { all: im.length, ok: im.filter(function (i) { return i.complete && i.naturalWidth; }).length };
    }, k);
    if (st.all && st.ok === st.all) { await p.waitForTimeout(450); return; }
    await p.waitForTimeout(500);
  }
  console.warn('  地図の背景が一部読み込めませんでした');
}
async function box(p, sel) { if (sel && sel.width != null) return sel; var l = typeof sel === 'string' ? p.locator(sel).first() : sel; var b = await l.boundingBox(); if (!b) throw new Error('見つからない: ' + sel); return b; }
async function clipOf(p, sels, pad) {
  pad = pad == null ? 12 : pad; var vp = p.viewportSize(), x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (var s of sels) { var b = await box(p, s); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height); }
  var c = { x: Math.max(0, Math.floor(x1 - pad)), y: Math.max(0, Math.floor(y1 - pad)) };
  c.width = Math.min(vp.width, Math.ceil(x2 + pad)) - c.x; c.height = Math.min(vp.height, Math.ceil(y2 + pad)) - c.y;
  return c;
}
async function snap(p, demo, name, clip, dw, alt) {
  // 地図が大きく写る写真は JPEG（PNG だと地図の背景で 1枚 1MB 近くになる）。小さい切り抜きは文字がくっきりする PNG
  var big = clip.width * clip.height > 200000, file = 'demo-' + name + (big ? '.jpg' : '.png');
  await p.screenshot(big ? { path: path.join(OUT, file), clip: clip, type: 'jpeg', quality: 80 } : { path: path.join(OUT, file), clip: clip });
  demo.images.push({ src: 'img/' + file, w: Math.round(clip.width), h: Math.round(clip.height), dw: dw || Math.round(clip.width), alt: alt || '' });
  return { k: demo.images.length - 1, clip: clip };
}
function pct(shot, b, dx, dy) {
  var c = shot.clip;
  return {
    x: r1(((b.x + (dx == null ? b.width / 2 : dx)) - c.x) / c.width * 100), y: r1(((b.y + (dy == null ? b.height / 2 : dy)) - c.y) / c.height * 100),
    box: { x: r1((b.x - c.x) / c.width * 100), y: r1((b.y - c.y) / c.height * 100), w: r1(b.width / c.width * 100), h: r1(b.height / c.height * 100) }
  };
}
// opt: { dx, dy, look, lookPad, type, drag:{dx,dy}(px), more:[sel..] }
async function step(p, shot, sel, t, opt) {
  opt = opt || {};
  var b = await box(p, sel), q = pct(shot, b, opt.dx, opt.dy);
  var s = { img: shot.k, x: q.x, y: q.y, t: t, box: q.box };
  if (opt.look) { var pad = opt.lookPad == null ? 4 : opt.lookPad, c = shot.clip; s.look = { x: r1((b.x - pad - c.x) / c.width * 100), y: r1((b.y - pad - c.y) / c.height * 100), w: r1((b.width + pad * 2) / c.width * 100), h: r1((b.height + pad * 2) / c.height * 100) }; }
  if (opt.type) s.type = opt.type;
  if (opt.drag) s.drag = { x: r1(q.x + opt.drag.dx / shot.clip.width * 100), y: r1(q.y + opt.drag.dy / shot.clip.height * 100) };
  if (opt.more) { s.more = []; for (var m of opt.more) { var mb = await box(p, m); var mq = pct(shot, mb); s.more.push({ x: mq.x, y: mq.y }); } }
  return s;
}
var selCount = function (p) { return p.evaluate(function () { return +document.getElementById('selCount').textContent; }); };
// 地図の真ん中あたりの区画を n 個、実際にクリックして選ぶ。押した点（小さな箱）を返す
async function pickZones(p, n, from) {
  var m = await box(p, '#geoMap'), cx = m.x + m.width * (from ? from[0] : .5), cy = m.y + m.height * (from ? from[1] : .5);
  var paths = await p.evaluate(function () { return [].map.call(document.querySelectorAll('#geoMap path.leaflet-interactive'), function (e, i) { var r = e.getBoundingClientRect(); return { i: i, x: r.x, y: r.y, w: r.width, h: r.height }; }); });
  paths = paths.filter(function (r) { return r.w > 22 && r.h > 22 && r.w < 160 && r.h < 160 && r.x > m.x + 40 && r.y > m.y + 40 && r.x + r.w < m.x + m.width - 20 && r.y + r.h < m.y + m.height - 20; })
    .sort(function (a, b2) { return Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b2.x + b2.w / 2 - cx, b2.y + b2.h / 2 - cy); });
  // 地図を押すと左の列が動く（地図にフォーカスが移るため）ので、押すたびに元の位置へ戻す
  var keep = await scrollState(p);
  var picked = [];
  for (var r of paths) {
    if (picked.length >= n) break;
    var rr = await pathBox(p, r.i), x = rr.x + rr.w / 2, y = rr.y + rr.h / 2, before = await selCount(p);
    await p.mouse.click(x, y); await p.waitForTimeout(250); await restoreScroll(p, keep);
    var now = await selCount(p);
    if (now === before + 1) picked.push({ i: r.i, dx: x - rr.x, dy: y - rr.y }); else if (now !== before) { await p.mouse.click(x, y); await p.waitForTimeout(200); await restoreScroll(p, keep); }
  }
  await p.mouse.move(5, 5); await p.waitForTimeout(200); // ふきだしを消す
  await restoreScroll(p, keep);
  var out = [];
  for (var q of picked) { var bb = await pathBox(p, q.i); out.push({ x: bb.x + q.dx - 1, y: bb.y + q.dy - 1, width: 2, height: 2 }); } // 今の位置で測り直す
  return out;
}
async function pathBox(p, i) { return p.evaluate(function (i) { var r = document.querySelectorAll('#geoMap path.leaflet-interactive')[i].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, i); }
async function scrollState(p) { return p.evaluate(function () { return { w: scrollY, m: (document.querySelector('.main-col') || {}).scrollTop || 0, s: (document.querySelector('.side') || {}).scrollTop || 0 }; }); }
async function restoreScroll(p, k) { await p.evaluate(function (k) { window.scrollTo(0, k.w); var m = document.querySelector('.main-col'), s = document.querySelector('.side'); if (m) m.scrollTop = k.m; if (s) s.scrollTop = k.s; }, k); await p.waitForTimeout(150); }
async function sideTo(p, sel) { await p.evaluate(function (s) { document.querySelector(s).scrollIntoView({ block: 'start' }); window.scrollTo(0, 0); }, sel); await p.waitForTimeout(400); }
async function scrollMain(p, sel) { await p.evaluate(function (s) { document.querySelector(s).scrollIntoView({ block: 'start' }); }, sel); await p.waitForTimeout(400); }

// ---------- 各章 ----------
var DEMOS = {};

// 1 はじめに: 3ステップ
DEMOS.start = { section: 'start', title: '見積もりの基本（3ステップ）', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  var s1 = await snap(p, d, 'start-1', { x: 0, y: 0, width: 1440, height: 900 }, 1000, '配布エリア選択シートの画面');
  var tab = p.locator('#areaTabs button').first();
  var picks = await pickZones(p, 3);
  await tiles(p);
  var s2 = await snap(p, d, 'start-2', { x: 0, y: 0, width: 1440, height: 900 }, 1000, '区画を選んだところ');
  d.steps.push(await step(p, s1, tab, '上のボタンで、配布したいエリア（版）を選びます'));
  d.steps.push(await step(p, s1, picks[0], '地図の区画を押して選びます（もう一度押すと外れます）', { more: picks.slice(1) }));
  d.steps.push(await step(p, s2, '.sum-row', '右上に合計部数と、選んだ区画の数が出ます', { look: true }));
  d.steps.push(await step(p, s2, '.fee', '配布料金（税別）も自動で出ます', { look: true }));
  d.steps.push(await step(p, s2, '#copyBtn', '「選択内容をコピー」で、メールやLINEに貼り付けられます'));
} };

// 2 画面の見方
DEMOS.screen = { section: 'screen', title: '画面のどこに何があるか', head: '見る場所', run: async function (b, d) {
  var p = await openPage(b);
  var s1 = await snap(p, d, 'screen-1', { x: 0, y: 0, width: 1440, height: 900 }, 1000, '画面全体');
  d.steps.push(await step(p, s1, '#areaTabs', 'いちばん上：エリア（版）の切り替え', { look: true }));
  d.steps.push(await step(p, s1, '#guideBtn', '右上：この使い方ガイド', { look: true }));
  d.steps.push(await step(p, s1, '#addrForm', '住所・町名で地図を動かす欄', { look: true }));
  d.steps.push(await step(p, s1, '#circleBar', '円で選ぶ（ピンからの半径）', { look: true, lookPad: 0 }));
  d.steps.push(await step(p, s1, '#omForm', 'おまかせ選択（住所＋部数）', { look: true, lookPad: 0 }));
  d.steps.push(await step(p, s1, '#geoMap', '地図：区画を押して選びます', { look: true, lookPad: -6 }));
  d.steps.push(await step(p, s1, '.summary', '右：合計部数と配布料金', { look: true }));
  d.steps.push(await step(p, s1, '.saved', '右下：保存した選択', { look: true }));
  await scrollMain(p, '.list-card');
  var s2 = await snap(p, d, 'screen-2', await clipOf(p, ['.list-card .list-head', '#tables'], 12), 0, '区画一覧');
  d.steps.push(await step(p, s2, '.list-card .list-head', '地図の下（左の列を下へ動かす）：区画一覧。チェックでも選べます', { look: true }));
} };

// 3 エリアを切り替える
DEMOS.area = { section: 'area', title: 'エリア（版）を切り替える', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  var c = await clipOf(p, ['.site-header .head-row', '#geoMap'], 10);
  c.height = Math.min(c.height, 620);
  var s1 = await snap(p, d, 'area-1', c, 900, '一宮の地図');
  var tab = p.locator('#areaTabs button').nth(1);
  var tb = await box(p, tab);
  await tab.click(); await p.waitForTimeout(900); await tiles(p);
  var s2 = await snap(p, d, 'area-2', c, 900, '稲沢の地図');
  d.steps.push(await step(p, s1, tb, '切り替えたいエリアのボタンを押します（ここでは「稲沢」）'));
  d.steps.push(await step(p, s2, '#legend', '地図と、地域ごとの色分けが切り替わります', { look: true }));
  d.steps.push(await step(p, s2, '#geoMap', '計算・申込書にできるのは、表示しているエリアだけです', { look: true, lookPad: -6, dy: 160 }));
} };

// 4 区画を選ぶ・外す
DEMOS.pick = { section: 'pick', title: '区画を選ぶ・外す', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  var mc = await clipOf(p, ['.map-card'], 0); mc.height = Math.min(mc.height, 640);
  var s1 = await snap(p, d, 'pick-1', mc, 900, '地図');
  var picks = await pickZones(p, 2);
  await tiles(p);
  var s2 = await snap(p, d, 'pick-2', mc, 900, '区画を選んだ地図');
  d.steps.push(await step(p, s1, picks[0], '地図の区画を押すと選ばれます', { more: picks.slice(1) }));
  d.steps.push(await step(p, s2, picks[0], '選んだ区画はオレンジ色。もう一度押すと外れます', { look: true, lookPad: 14 }));
  d.steps.push(await step(p, s2, '#addrInput', '住所・町名を入れて「移動」で、その場所へ地図が動きます', { dx: 80, type: '国府宮' }));
  d.steps.push(await step(p, s2, '.label-toggle', '拡大すると区画の名前が出ます。「番号を表示」で消せます'));
  await scrollMain(p, '.list-card');
  var s3 = await snap(p, d, 'pick-3', await clipOf(p, ['.list-card .list-head', '#tables'], 12), 0, '区画一覧');
  var first = p.locator('#tables tbody tr').first();
  d.steps.push(await step(p, s3, first.locator('input'), '区画一覧のチェックでも、同じように選べます'));
  d.steps.push(await step(p, s3, p.locator('#bulk button').first(), '「○○をすべて選択」でその地域をまとめて選択（もう一度押すと外れます）'));
  d.steps.push(await step(p, s3, '#bulk button.danger', '「すべて解除」で、このエリアの選択を全部外します'));
} };

// 5 おまかせ選択
DEMOS.omakase = { section: 'omakase', title: '住所と部数でおまかせ選択', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  var c = await clipOf(p, ['#omForm', '#geoMap'], 0); c.height = Math.min(c.height, 560);
  var s1 = await snap(p, d, 'omakase-1', c, 900, 'おまかせ選択の欄');
  d.steps.push(await step(p, s1, '#omAddr', 'お客様の住所を入れます', { dx: 120, type: '一宮市木曽川町里小牧寺東125' }));
  d.steps.push(await step(p, s1, '#omCopies', '部数を入れます', { dx: 50, type: '20000' }));
  d.steps.push(await step(p, s1, '#omForm button[type=submit]', '「おまかせ」を押します'));
  await p.fill('#omAddr', '一宮市木曽川町里小牧寺東125'); await p.fill('#omCopies', '20000');
  await p.click('#omForm button[type=submit]'); await p.waitForTimeout(1500); await tiles(p);
  var s2 = await snap(p, d, 'omakase-2', { x: 0, y: 0, width: 1440, height: 900 }, 1000, 'おまかせで選んだところ');
  d.steps.push(await step(p, s2, '.home-pin', '住所の場所に赤い★。近い区画から順に選ばれます', { look: true, lookPad: 6 }));
  d.steps.push(await step(p, s2, '#omMsg', '選んだ結果がここに出ます', { look: true }));
  d.steps.push(await step(p, s2, '.sum-row', 'いちばん遠い区画で部数を減らして、ちょうどの部数にします', { look: true }));
} };

// 6 円で選ぶ
DEMOS.circle = { section: 'circle', title: 'ピンから半径で選ぶ', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  var c = await clipOf(p, ['#circleBar', '#geoMap'], 0); c.height = Math.min(c.height, 560);
  var s1 = await snap(p, d, 'circle-1', c, 900, '円で選ぶの欄');
  d.steps.push(await step(p, s1, '#circleShow', '地図をお店のあたりへ動かして「地図の中心にピンを置く」'));
  await p.click('#circleShow'); await p.waitForTimeout(1200); await tiles(p);
  c = await clipOf(p, ['#circleBar', '#geoMap'], 0);
  var pinB = await box(p, '.circle-pin'); c.height = Math.min(c.height, Math.ceil(pinB.y + 200 - c.y));
  var s2 = await snap(p, d, 'circle-2', c, 900, 'ピンと円');
  d.steps.push(await step(p, s2, '.circle-pin', 'ピンはドラッグで動かせます', { drag: { dx: 40, dy: 20 } }));
  d.steps.push(await step(p, s2, '#radius', '半径（0.5〜5km）を選びます'));
  d.steps.push(await step(p, s2, '#circleInfo', '円の中の区画の数と部数が出ます', { look: true }));
  d.steps.push(await step(p, s2, '#circleAdd', '「この円の区画を追加」でまとめて選びます'));
  d.steps.push(await step(p, s2, '#circleCopies', '部数を決めるときは、部数を入れて…', { dx: 50, type: '10000' }));
  d.steps.push(await step(p, s2, '#circleOmakase', '「この部数でおまかせ」：ピンから近い順にちょうどの部数'));
  d.steps.push(await step(p, s2, '#circleClear', '終わったら「円を消す」'));
} };

// 7 部数の調整
DEMOS.adjust = { section: 'adjust', title: '部数の端数をそろえる', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  await pickZones(p, 4);
  var c = await clipOf(p, ['.summary .sum-row', '.adjust'], 12);
  var s1 = await snap(p, d, 'adjust-1', c, 0, '部数の調整');
  d.steps.push(await step(p, s1, '#adjRound', '「千部単位にそろえる」で、端数を自動で1つの区画から減らします'));
  d.steps.push(await step(p, s1, '#adjArea', '自分で決めるときは、減らす区画を選んで…'));
  d.steps.push(await step(p, s1, '#adjQty', '減らす部数を入れます', { type: '300' }));
  await p.click('#adjRound'); await p.waitForTimeout(600);
  c = await clipOf(p, ['.summary .sum-row', '.adjust'], 12);
  var s2 = await snap(p, d, 'adjust-2', c, 0, '端数をそろえたところ');
  d.steps.push(await step(p, s2, '#adjNote', '減らした区画と部数は、合計の下と申込書に「※部数調整」で出ます', { look: true }));
} };

// 8 配布料金
DEMOS.fee = { section: 'fee', title: '配布料金を計算する', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  await pickZones(p, 4);
  await p.selectOption('#size', 'A3'); await p.waitForTimeout(300); // A4 は折加工なし（選べない）ので、写真は A3 で
  var c = await clipOf(p, ['.price h2', '.price .fee'], 12);
  var s1 = await snap(p, d, 'fee-1', c, 0, '配布料金の計算');
  d.steps.push(await step(p, s1, '#size', 'チラシサイズ（A4〜A2）を選びます'));
  d.steps.push(await step(p, s1, '#fold', '折加工が必要なときは「必要」（A4は折加工なし）'));
  d.steps.push(await step(p, s1, '#insert', '挟み込み配布が必要なときは「必要」'));
  d.steps.push(await step(p, s1, '#unitSize', 'サイズ単価は書き換えられます（「手動」と出ます）', { type: '6.5' }));
  d.steps.push(await step(p, s1, '.price .fee', '配布料金（税別）＝ 部数 ×（サイズ単価＋折加工＋挟み込み）', { look: true }));
} };

// 9 送る（コピー・URL）
DEMOS.share = { section: 'share', title: 'お客様・社内に送る', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  await pickZones(p, 3);
  await sideTo(p, '.price .fee');
  var c = await clipOf(p, ['.price .fee', '.actions', '.saved .saved-head'], 12);
  var s1 = await snap(p, d, 'share-1', c, 0, 'コピーと共有のボタン');
  d.steps.push(await step(p, s1, '#copyBtn', '「選択内容をコピー」：区画・部数・料金を文章でコピーします'));
  await p.click('#copyBtn'); await p.waitForTimeout(600);
  await sideTo(p, '.price .fee');
  c = await clipOf(p, ['.price .fee', '.actions', '#savedList li'], 12);
  var s2 = await snap(p, d, 'share-2', c, 0, 'コピーしたところ');
  d.steps.push(await step(p, s2, '#copied', 'メールやLINEにそのまま貼り付けられます', { look: true }));
  d.steps.push(await step(p, s2, '#savedList li', '下の「保存した選択」にも自動で残ります', { look: true }));
  d.steps.push(await step(p, s2, '#shareBtn', '「このURLを共有」：開くと同じ区画が選ばれた状態で開くURLです'));
} };

// 10 保存した選択・申込書
DEMOS.saved = { section: 'saved', title: '保存した選択を使う・申込書を作る', head: 'この順に押します', run: async function (b, d) {
  var p = await openPage(b);
  await pickZones(p, 3); await p.click('#copyBtn'); await p.waitForTimeout(400);
  await pickZones(p, 2, [.35, .4]); await p.click('#copyBtn'); await p.waitForTimeout(600);
  await sideTo(p, '.saved');
  var c = await clipOf(p, ['.saved'], 10);
  var s1 = await snap(p, d, 'saved-1', c, 0, '保存した選択');
  var li = p.locator('#savedList li').first();
  d.steps.push(await step(p, s1, li.locator('.saved-memo'), 'メモ欄にクライアント名を入れておくと探しやすくなります', { dx: 70, type: 'ラーメン一番 様' }));
  d.steps.push(await step(p, s1, li.locator('[data-act=open]'), '「開く」でその選び方に戻ります'));
  d.steps.push(await step(p, s1, li.locator('[data-act=pdf]'), '「申込書DL」で配布会社向けの申込書PDF（A3・2枚）'));
  await li.locator('[data-act=pdf]').click(); await p.waitForTimeout(600);
  var s2 = await snap(p, d, 'saved-2', await clipOf(p, ['#orderDlg'], 8), 0, '申込書のパスワード');
  d.steps.push(await step(p, s2, '#orderPass', 'スタッフ用です。社内で共有しているパスワードを入れて…', { dx: 40, type: '••••' }));
  d.steps.push(await step(p, s2, '#orderUnlock', '「確認」を押すと、申込書の入力欄が出ます'));
  d.steps.push(await step(p, s1, li.locator('.saved-check'), 'いらない保存は、チェックして…'));
  d.steps.push(await step(p, s1, '#savedDelChecked', '「選んだものを削除」（1件だけなら右の「×」）'));
} };

// 11 スマホ
DEMOS.mobile = { section: 'mobile', title: 'スマホで使う', head: '見る場所', run: async function (b, d) {
  var p = await openPage(b, { w: 390, h: 844, dsf: 2, mobile: true });
  var s1 = await snap(p, d, 'mobile-1', { x: 0, y: 0, width: 390, height: 844 }, 300, 'スマホの画面');
  d.steps.push(await step(p, s1, '#areaTabs', 'エリアのボタンは上に並びます', { look: true, lookPad: 2 }));
  d.steps.push(await step(p, s1, '#guideBtn', '右上の「使い方ガイド」でこのガイド', { look: true, lookPad: 2 }));
  await p.evaluate(function () { document.querySelector('#geoMap').scrollIntoView({ block: 'start' }); }); await p.waitForTimeout(500); await tiles(p);
  var picks = await pickZones(p, 2);
  await p.evaluate(function () { document.querySelector('#geoMap').scrollIntoView({ block: 'start' }); }); await p.waitForTimeout(400); await tiles(p);
  var s2 = await snap(p, d, 'mobile-2', { x: 0, y: 0, width: 390, height: 844 }, 300, 'スマホの地図');
  d.steps.push(await step(p, s2, picks[0], '地図の区画をタップして選びます（2本の指で拡大）', { more: picks.slice(1) }));
  d.steps.push(await step(p, s2, '#stickyTotal', '下の黒い帯に、いつでも合計部数と料金が出ます', { look: true, lookPad: 0 }));
  await p.evaluate(function () { document.querySelector('.summary').scrollIntoView({ block: 'start' }); }); await p.waitForTimeout(400);
  var s3 = await snap(p, d, 'mobile-3', { x: 0, y: 0, width: 390, height: 844 }, 300, 'スマホの料金');
  d.steps.push(await step(p, s3, '.price', '地図の下に、料金の計算・コピー・保存した選択が続きます', { look: true, lookPad: 0 }));
} };

(async function () {
  var only = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  var prev = fs.existsSync(JSON_OUT) ? JSON.parse(fs.readFileSync(JSON_OUT, 'utf8')) : { demos: [] };
  var keep = {}; prev.demos.forEach(function (x) { keep[x.id] = x; });
  var b = await pw.chromium.launch({ channel: 'chrome' });
  var out = [];
  for (var id of Object.keys(DEMOS)) {
    var def = DEMOS[id];
    if (only.length && only.indexOf(id) < 0) { if (keep[id]) out.push(keep[id]); continue; }
    var d = { id: id, section: def.section, after: def.after || '', title: def.title, head: def.head, images: [], steps: [] };
    await def.run(b, d);
    console.log(id, d.steps.length + ' 手順', d.images.map(function (m) { return m.src + ' ' + m.w + 'x' + m.h; }).join(', '));
    out.push(d);
  }
  fs.writeFileSync(JSON_OUT, JSON.stringify({ note: 'guide/demos.js が書き出す（手で直さない）', demos: out }, null, 1));
  await b.close(); srv.close();
})().catch(function (e) { console.error(e); process.exit(1); });
