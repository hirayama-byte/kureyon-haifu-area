// 使い方ガイド（地図版）。右上の「使い方ガイド」から開く。
//   左の目次から項目を選ぶと説明が出る。「この場所を見る」で画面のその部分を光らせて教える
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  // 各項目: id, 目次の名前, 本文（HTML）, 光らせる場所（CSSセレクタ。なければボタンなし）
  const SECTIONS = [
    {
      id: 'start', title: 'はじめに（3ステップ）', target: null,
      body: `
        <p>配布エリアを選ぶと、<b>配布できる部数</b>と<b>配布料金（税別）</b>がその場で出ます。</p>
        <ol class="g-steps">
          <li><b>エリアを選ぶ</b><br>上の「一宮」「稲沢」などのボタンで、配布したい版を選びます。</li>
          <li><b>区画を選ぶ</b><br>地図の区画をクリックするか、下の「区画一覧」のチェックで選びます。<br>住所と部数から自動で選ぶ「<b>おまかせ選択</b>」も便利です。</li>
          <li><b>右の合計を見る</b><br>合計部数と配布料金が出ます。「<b>選択内容をコピー</b>」でメールやLINEに貼り付けられます。</li>
        </ol>
        <p class="g-tip">💡 困ったときは右上の「<b>リセット</b>」で、選んだ区画をすべて外してやり直せます。</p>`
    },
    {
      id: 'area', title: 'エリア（版）を切り替える', target: '#areaTabs',
      body: `
        <p>いちばん上のボタンで、エリアを切り替えます。</p>
        <ul>
          <li>エリアごとに選んだ区画は覚えています。切り替えて戻っても消えません。</li>
          <li>1回に計算・申込書にできるのは、<b>表示しているエリアだけ</b>です。2つの版にまたがるときは、エリアごとに計算してください。</li>
        </ul>`
    },
    {
      id: 'pick', title: '区画を選ぶ・外す', target: '#geoMap',
      body: `
        <ul>
          <li><b>地図の区画をクリック</b>すると選ばれて、オレンジ色になります。もう一度クリックすると外れます。</li>
          <li>下の<b>区画一覧のチェック</b>でも同じように選べます。</li>
          <li>一覧の上の「<b>○○をすべて選択</b>」で、その地域をまとめて選べます。もう一度押すと、その地域だけ全部外れます。</li>
          <li>地図はマウスのホイールで拡大・縮小、ドラッグで移動できます。拡大すると区画の名前が出ます（右上の「番号を表示」で消せます）。</li>
          <li>地図の上の検索欄に住所や町名を入れて「移動」を押すと、その場所へ地図が動きます。</li>
        </ul>`
    },
    {
      id: 'omakase', title: 'おまかせ選択（住所＋部数）', target: '#omForm',
      body: `
        <p>お客様の住所と部数を入れるだけで、<b>近い区画から自動で選んで、ちょうどの部数</b>にします。</p>
        <ol class="g-steps">
          <li>「おまかせ選択」の欄に住所を入れます（例：一宮市木曽川町里小牧寺東125）。</li>
          <li>部数を入れます（例：20000）。</li>
          <li>「<b>おまかせ</b>」を押します。</li>
        </ol>
        <ul>
          <li>住所に近い区画から順に選び、部数を超えた分は<b>いちばん遠い区画で減らして</b>調整します。</li>
          <li>住所の場所には赤い★が付きます。</li>
          <li>押すたびに、前の選択はいったん消えてから選び直されます。</li>
          <li>選んだあとに、区画を足したり外したりもできます。</li>
        </ul>
        <p class="g-tip">💡 先に正しいエリア（版）を選んでから押してください。住所がエリアから離れているときは、注意が出ます。</p>`
    },
    {
      id: 'circle', title: '円で選ぶ（ピンから半径）', target: '#circleBar',
      body: `
        <ol class="g-steps">
          <li>地図をお店の場所あたりへ動かして、「<b>地図の中心にピンを置く</b>」を押します。</li>
          <li>半径（0.5〜5km）を選ぶと、円の中に入る区画の数と部数が出ます。ピンはドラッグで動かせます。</li>
          <li>「<b>この円の○区画を追加</b>」で、円の中の区画をまとめて選べます。</li>
        </ol>
        <p><b>部数を決めて選ぶとき</b>：ピンを置くと出る部数の欄に部数を入れて「<b>この部数でおまかせ</b>」を押すと、ピンから近い順に選んで、ちょうどの部数にします（円の外の区画も足します）。</p>
        <p>終わったら「円を消す」を押します。</p>`
    },
    {
      id: 'adjust', title: '部数の調整（端数合わせ）', target: '.adjust',
      body: `
        <p>合計を「30,000部」のようなきりのいい数にしたいときに使います。</p>
        <ul>
          <li>「<b>千部単位にそろえる</b>」を押すと、端数を自動で1つの区画から減らします。</li>
          <li>自分で決めるときは、「区画を選ぶ」で減らす区画を選び、減らす部数を入れます。</li>
          <li>減らした区画と部数は、合計の下と申込書に「※部数調整」として出ます。</li>
        </ul>`
    },
    {
      id: 'fee', title: '配布料金の計算', target: '.summary',
      body: `
        <ul>
          <li>チラシサイズ・折加工・挟み込みを選ぶと、配布料金（税別）が変わります。</li>
          <li>単価は合計部数で変わります（5,000部未満／1万部未満／3万部未満／3万部以上）。</li>
          <li>配布料金 ＝ 合計部数（調整後）×（サイズの単価＋折加工＋挟み込み）。計算は「同時配布エリア選択シート」と同じです。</li>
        </ul>`
    },
    {
      id: 'share', title: 'お客様・社内に送る', target: '#copyBtn',
      body: `
        <ul>
          <li>「<b>選択内容をコピー</b>」… 選んだ区画・部数・料金を文章でコピーします。メールやLINEにそのまま貼り付けられます。</li>
          <li>「<b>このURLを共有</b>」… 今の選び方が入ったURLをコピーします。受け取った人がURLを開くと、同じ区画が選ばれた状態で開きます。</li>
        </ul>`
    },
    {
      id: 'saved', title: '保存した選択・申込書', target: '.saved',
      body: `
        <ul>
          <li>「選択内容をコピー」を押すと、右の「<b>保存した選択</b>」に自動で残ります（このパソコンのこのブラウザだけ・18件まで。古いものから消えます）。</li>
          <li>メモ欄にクライアント名を入れておくと、あとで探しやすくなります。</li>
          <li>「<b>開く</b>」でその選び方に戻ります。</li>
          <li>「<b>申込書DL</b>」で配布会社向けの申込書PDF（A3・2枚）を作ります。スタッフ用で、社内で共有しているパスワードが必要です。</li>
          <li>いらなくなった保存は、左のチェックで選んで「選んだ○件を削除」か、「×」で消せます。</li>
        </ul>`
    },
    {
      id: 'faq', title: 'こまったとき（Q&A）', target: null,
      body: `
        <dl class="g-faq">
          <dt>選んだ区画を全部外したい</dt><dd>右の合計部数の横の「<b>リセット</b>」を押してください。今のエリアの選択・部数調整・ピンが消えます。</dd>
          <dt>地図が白くて表示されない</dt><dd>通信の具合で地図の画像が遅れることがあります。少し待つか、再読み込みしてください。計算はそのまま使えます。</dd>
          <dt>住所が見つからない</dt><dd>番地を省いて「○○市○○町」まで入れてみてください。それでもだめなら、地図を動かして「円で選ぶ」を使ってください。</dd>
          <dt>一覧に「地図なし」と出ている区画がある</dt><dd>配布マップに場所がない区画です。一覧のチェックで選べます（清須61〜64）。</dd>
          <dt>前に保存した選択が見当たらない</dt><dd>保存は使ったパソコン・ブラウザの中だけに残ります。別のパソコンやスマホでは出ません。URLで共有すると、どこでも開けます。</dd>
          <dt>区画の境目が実際と少しずれている</dt><dd>区画の形は配布マップをもとに、道路や町の境に合わせて作っています。数十メートルずれることがあります。正確な範囲は配布会社の配布マップで確認してください。</dd>
        </dl>`
    }
  ];

  function build() {
    const dlg = document.createElement('dialog');
    dlg.className = 'guide-dlg'; dlg.id = 'guideDlg'; dlg.setAttribute('aria-labelledby', 'guideTitle');
    dlg.innerHTML = `
      <div class="g-head"><h2 id="guideTitle">📘 使い方ガイド</h2><button type="button" class="g-close" aria-label="閉じる">×</button></div>
      <div class="g-body">
        <nav class="g-toc">${SECTIONS.map((s, i) => `<button type="button" data-sec="${s.id}"${i ? '' : ' aria-current="true"'}>${s.title}</button>`).join('')}</nav>
        <div class="g-main">${SECTIONS.map((s, i) => `
          <section class="g-sec" data-sec="${s.id}"${i ? ' hidden' : ''}>
            <h3>${s.title}</h3>${s.body}
            ${s.target ? `<button type="button" class="g-show" data-target="${s.target}">👀 この場所を見る</button>` : ''}
            <div class="g-nav">${i ? `<button type="button" data-go="${SECTIONS[i - 1].id}">← ${SECTIONS[i - 1].title}</button>` : '<span></span>'}${i < SECTIONS.length - 1 ? `<button type="button" data-go="${SECTIONS[i + 1].id}">${SECTIONS[i + 1].title} →</button>` : ''}</div>
          </section>`).join('')}</div>
      </div>`;
    document.body.appendChild(dlg);
    const show = id => {
      dlg.querySelectorAll('.g-sec').forEach(s => { s.hidden = s.dataset.sec !== id; });
      dlg.querySelectorAll('.g-toc button').forEach(b => b.toggleAttribute('aria-current', b.dataset.sec === id));
      dlg.querySelector('.g-main').scrollTop = 0;
    };
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { dlg.close(); return; }             // 外側をクリックしたら閉じる
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('g-close')) dlg.close();
      if (b.dataset.sec) show(b.dataset.sec);
      if (b.dataset.go) show(b.dataset.go);
      if (b.dataset.target) { dlg.close(); spotlight(b.dataset.target); }
    });
    return dlg;
  }

  // 画面のその場所までスクロールして、しばらく光らせる
  function spotlight(sel) {
    const el = document.querySelector(sel); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('g-spot'); void el.offsetWidth; el.classList.add('g-spot');
    setTimeout(() => el.classList.remove('g-spot'), 3200);
  }

  function init() {
    let dlg = null;
    $('guideBtn').addEventListener('click', () => { dlg = dlg || build(); dlg.showModal(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
