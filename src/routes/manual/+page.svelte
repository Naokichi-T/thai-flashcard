<script>
  // ============================================================
  // マニュアルページ
  // アプリの使い方をまとめたページ
  // ============================================================
</script>

<div class="manual">
  <h1 class="title">📖 マニュアル</h1>

  <!-- ==============================
    単語帳アプリの特徴
  ============================== -->
  <section>
    <h2>単語帳アプリの特徴</h2>
    <ul>
      <li>ごったいの2026年3月12日現在の辞書データを収録（構成する語・例文はなし）</li>
      <li>頻出度10から順に単語を覚えられる（頻出度の降順、URLの昇順）</li>
      <li>①タイ語→日本語 ②日本語→タイ語 ③書き取り の3ステージで学習を進める</li>
      <li>忘却曲線を取り入れた復習機能がある</li>
      <li>暗記の必要がない単語を、各ステージ毎に「保留」として除外できる</li>
      <li>各ステージで情報を共有したメモ機能がある</li>
      <li>タイ語・日本語での検索機能がある</li>
    </ul>
  </section>

  <!-- ==============================
    基本的な学習の進め方
  ============================== -->
  <section>
    <h2>基本的な学習の進め方</h2>

    <h3>復習モードに単語が表示されるまで</h3>
    <ol>
      <li><span class="tag">未回答</span>モードで「知ってる」「知らない」を振り分ける</li>
      <li><span class="tag">今日の20問</span>モードで「知らない」単語を潰す</li>
    </ol>

    <h3>復習モードに単語が表示された後</h3>
    <ol>
      <li><span class="tag">復習</span>モードで過去に出題された単語を復習する</li>
      <li><span class="tag">今日の20問</span>モードでランダムで出題された「知らない」単語を潰す</li>
      <li><span class="tag">未回答</span>モードで新規出題単語の「知ってる」「知らない」を振り分ける</li>
    </ol>

    <h3>個別に覚えたい単語があるとき</h3>
    <ol>
      <li><span class="tag">検索</span>メニューからタイ語または日本語で検索する</li>
      <li><span class="tag">知らない</span>ボタンを押し、復習サイクルに乗せる</li>
    </ol>
  </section>

  <!-- ==============================
    メニューについて
  ============================== -->
  <section>
    <h2>メニューについて</h2>
    <div class="item-list">
      <div class="item">
        <div class="item-title">🇹🇭 タイ語→日本語（ステージ１）</div>
        <ul>
          <li>約18,000語から「知ってる」「知らない」を振り分ける</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">🇯🇵 日本語→タイ語（ステージ２）</div>
        <ul>
          <li>タイ語→日本語の「知ってる」単語から出題される</li>
          <li>複数回答が正解の場合があるので、必要に応じて<span class="tag">読みを見る</span></li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">✏️ 書き取り（ステージ３）</div>
        <ul>
          <li>日本語→タイ語の「知ってる」単語から出題される</li>
          <li>スマホは予測変換があるので、嫌な場合はPCを使用する</li>
          <li>複数回答が正解の場合があるので、必要に応じて<span class="tag">読みを見る</span></li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">📊 進捗確認</div>
        <ul>
          <li>学習の進捗状況が確認できる</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">💤 保留一覧</div>
        <ul>
          <li>各ステージで保留にした単語の確認と登録解除ができる</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">🔍 検索</div>
        <ul>
          <li>タイ語または日本語で単語を検索できる</li>
          <li>メモの内容は検索できない</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ==============================
    モードについて
  ============================== -->
  <section>
    <h2>モードについて</h2>
    <div class="item-list">
      <div class="item">
        <div class="item-title">🔁 復習</div>
        <ul>
          <li>忘却曲線による復習タイミングに合わせて出題される</li>
          <li>タイ語→日本語は最長で1年サイクル</li>
          <li>日本語→タイ語は最長で9か月サイクル</li>
          <li>書き取りは最長で6か月サイクル</li>
          <li>毎日こなさないとどんどん溜まっていく</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">📅 今日の20問</div>
        <ul>
          <li>知らないモードからランダムで20問出題される</li>
          <li>ランダムで出題することで順番がヒントになることを防いでいる</li>
          <li>1日のノルマのイメージ</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">❓ 未回答</div>
        <ul>
          <li>「知ってる」「知らない」を振り分けていない単語が出題される</li>
          <li>新規の単語はこのモードから回答する想定</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">📚 全部</div>
        <ul>
          <li>現在表示できるすべての単語が表示される</li>
          <li>設計の都合上、このモードがデフォルトで選択されている</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">❌ 知らない</div>
        <ul>
          <li>知らないボタンが押された単語が頻出度順で表示される</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">⭐ スター</div>
        <ul>
          <li>カード右側の<span class="star">☆</span>アイコンを押した単語が表示される</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">💤 保留</div>
        <ul>
          <li>カード右側の💤アイコンを押した単語が表示される</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ==============================
    アイコンボタンについて
  ============================== -->
  <section>
    <h2>アイコンボタンについて</h2>
    <div class="item-list">
      <div class="item">
        <div class="item-title"><span class="star">☆</span> スター</div>
        <ul>
          <li>お気に入り登録機能</li>
          <li>用途はご自由に</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">💤 保留</div>
        <ul>
          <li>出題の対象外にする保留機能</li>
          <li>タイ語→日本語：暗記不要の単語を登録する</li>
          <li>日本語→タイ語：読んで思い出せば十分な単語を登録する</li>
          <li>書き取り：読めるし言えるが正しく書けなくてもよい単語を登録する</li>
        </ul>
      </div>

      <div class="item">
        <div class="item-title">✏️ メモ</div>
        <ul>
          <li>メモ機能</li>
          <li><span class="star">☆</span>・💤 とは異なり、各ステージで同じメモ内容を共有する</li>
        </ul>
      </div>
    </div>
  </section>
</div>

<style>
  .manual {
    max-width: 600px;
    margin: 0 auto;
    padding: 24px 20px 60px;
    color: #333;
    line-height: 1.7;
  }

  /* タイトル */
  .title {
    font-size: 30px;
    text-align: center;
    margin-bottom: 32px;
    color: #333;
  }

  /* セクション間の余白 */
  section {
    margin-bottom: 40px;
  }

  /* 見出しh2 */
  h2 {
    font-size: 22px;
    font-weight: bold;
    border-left: 4px solid #2a7ae2;
    padding-left: 10px;
    margin-bottom: 16px;
    color: #222;
  }

  /* 見出しh3 */
  h3 {
    font-size: 17px;
    font-weight: bold;
    color: #555;
    margin: 16px 0 8px;
  }

  /* リスト */
  ul,
  ol {
    padding-left: 20px;
    margin: 0 0 12px;
  }

  li {
    margin-bottom: 6px;
    font-size: 16px;
  }

  /* モード名・機能名などのタグ */
  .tag {
    display: inline-block;
    background: #e8f0fb;
    color: #2a7ae2;
    font-size: 14px;
    padding: 1px 8px;
    border-radius: 20px;
    font-weight: bold;
  }

  /* 各項目のカード */
  .item-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .item {
    background: #f8f9fa;
    border-radius: 10px;
    padding: 14px 16px;
  }

  /* 項目タイトル */
  .item-title {
    font-size: 17px;
    font-weight: bold;
    margin-bottom: 6px;
    color: #333;
  }

  .item ul {
    margin: 0;
    padding-left: 16px;
  }

  /* お気に入りの☆をオレンジに */
  .item-title .star,
  li .star {
    color: #f5a623;
  }
</style>
