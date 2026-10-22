// 配布料金の計算（同時配布エリア選択シートと同じ計算）。index.html と map.html の両方で使う
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
  const tierOf = n => (n < 5000 ? 0 : n < 10000 ? 1 : n < 30000 ? 2 : 3);
  const foldPrice = (size, on) => (on ? (size === 'A2' ? 2 : 1) : 0); // 折加工：A2は+2円、それ以外+1円
  const insertPrice = on => (on ? 2 : 0);                            // 挟み込み：+2円

  function calcFee(total, size, fold, ins) {
    const unitSize = SIZE_PRICE[size][tierOf(total)];
    const unitFold = foldPrice(size, fold);
    const unitIns = insertPrice(ins);
    const unit = unitSize + unitFold + unitIns;
    return { unitSize, unitFold, unitIns, unit, fee: Math.round(total * unit) };
  }

  window.HaifuPrice = {
    SIZE_PRICE,
    calcFee,
    fmt: n => n.toLocaleString('ja-JP'),
    fmtUnit: n => (Number.isInteger(n) ? n.toFixed(1) : String(n))
  };
})();
