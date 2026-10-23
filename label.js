// 区画の呼び名（地図の番号・申込書の表で共通）
//   地名に番号が入っている区画（北方1・木曽川⑩・開明1 A1 など）は、地図にも地名をそのまま出す
//   それ以外（比良・赤池 など）は、これまでどおり番号（北区・祖父江などは「北41」「祖父江1」）
(function () {
  'use strict';
  const PREFIX = ['北', '祖父江', '平和', '大口', '扶桑', '岩倉', 'あま'];
  const CIRCLED = '⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  // 地名の中に番号があるか（10〜20 は丸数字でもよい）
  function nameHasCode(a) {
    if (!a.name) return false;
    if (a.name === a.code || a.name.endsWith(a.code) || a.name.includes(' ' + a.code)) return true;
    const n = /^\d+$/.test(a.code) ? +a.code : NaN;
    return n >= 10 && n <= 20 && a.name.includes(CIRCLED[n - 10]);
  }
  const mapLabel = a => (nameHasCode(a) ? a.name : (PREFIX.includes(a.group) ? a.group : '') + a.code);
  const tableLabel = a => (nameHasCode(a) ? a.name : `${a.code} ${a.name}`);
  window.HaifuLabel = { nameHasCode, mapLabel, tableLabel };
})();
