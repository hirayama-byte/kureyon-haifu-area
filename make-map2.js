// 代理店用ページ map2.html を map.html から作る（map.html を直したら node make-map2.js で作り直す）
//   ・売値のサイズ単価に 1.0円 上乗せ（price.js が window.HAIFU_AGENCY を見る）
//   ・ダークの背景（agency.css）・見出しに「代理店用」・保存は社内用と別・申込書DLは出さない
const fs = require('fs');
let h = fs.readFileSync('map.html', 'utf8');
const rep = (a, b) => { if (!h.includes(a)) throw new Error('map.html に見つからない: ' + a); h = h.replace(a, b); };
rep('<html lang="ja">', '<html lang="ja" class="agency">');
rep('<title>情報誌くれよん 配布エリア選択シート</title>', '<title>情報誌くれよん 配布エリア選択シート（代理店用）</title>');
// 版番号（?v=）は map.html と同じものを使う（2026-11-03: 決め打ちをやめた）
const css = (h.match(/<link rel="stylesheet" href="style\.css(\?v=\d+)?">/) || [])[0]; if (!css) throw new Error('map.html に style.css が見つからない');
const ver = (css.match(/\?v=\d+/) || [''])[0];
rep(css, css + '\n<link rel="stylesheet" href="agency.css' + ver + '">');
rep('<h1>情報誌くれよん 配布エリア選択シート</h1>', '<h1>情報誌くれよん 配布エリア選択シート<span class="agency-badge">代理店用</span></h1>');
const pj = (h.match(/<script src="price\.js(\?v=\d+)?"><\/script>/) || [])[0]; if (!pj) throw new Error('map.html に price.js が見つからない');
rep(pj, '<script>window.HAIFU_AGENCY = true;</script>\n' + pj);
// 注意書きは DOCTYPE の後ろに入れる（前に置くと古い表示モードになる）
rep('<html lang="ja" class="agency">', '<!-- 自動で作ったファイル（make-map2.js）。直すときは map.html を直して node make-map2.js -->\n<html lang="ja" class="agency">');
fs.writeFileSync('map2.html', h);
console.log('map2.html を作りました');
