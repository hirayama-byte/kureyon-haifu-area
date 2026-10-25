// 配布料金の計算（同時配布エリア選択シートと同じ計算）。haifu-map.html（配布マップ版）と map.html の両方で使う
(function () {
  'use strict';
  // サイズ単価は合計部数で変わる: 5,000部未満 / 1万部未満 / 3万部未満 / 3万部以上
  const SIZE_PRICE = {
    A4: [7, 6.5, 6, 5],
    B4: [7, 6.5, 6, 5],
    A3: [7.5, 7, 6.5, 5.5],
    B3: [8, 7.5, 7, 6],
    A2: [8, 7.5, 7, 6]
  };
  // 代理店用のページ（map2.html）では、売値のサイズ単価に 1.0円を上乗せする
  const AGENCY_PLUS = window.HAIFU_AGENCY ? 1 : 0;
  const tierOf = n => (n < 5000 ? 0 : n < 10000 ? 1 : n < 30000 ? 2 : 3);
  // 折加工（1部あたり・サイズで変わる）: A4 0円 / B4・A3 2円 / B3・A2 4円（2026-10-25 オーナー指示）
  const FOLD_PRICE = { A4: 0, B4: 2, A3: 2, B3: 4, A2: 4 };
  const foldPrice = (size, on) => (on ? FOLD_PRICE[size] || 0 : 0);
  const insertPrice = on => (on ? 2 : 0);                            // 挟み込み：+2円

  function calcFee(total, size, fold, ins) {
    const unitSize = SIZE_PRICE[size][tierOf(total)] + AGENCY_PLUS;
    const unitFold = foldPrice(size, fold);
    const unitIns = insertPrice(ins);
    const unit = unitSize + unitFold + unitIns;
    return { unitSize, unitFold, unitIns, unit, fee: Math.round(total * unit) };
  }

  window.HaifuPrice = {
    SIZE_PRICE,
    AGENCY_PLUS,
    FOLD_PRICE,
    calcFee,
    fmt: n => n.toLocaleString('ja-JP'),
    fmtUnit: n => (Number.isInteger(n) ? n.toFixed(1) : String(n))
  };
})();
