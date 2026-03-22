<script>
  // ============================================================
  // CSVファイルを読み込んで単語カードを表示するページ
  // ============================================================

  // onMount：ページが表示されたタイミングで処理を実行するための関数
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let words = $state([]);
  let currentIndex = $state(0);
  let showMeaning = $state(false);
  let loading = $state(true);
  let error = $state("");

  // ============================================================
  // Supabaseから単語データを取得する処理
  // ============================================================
  onMount(async () => {
    try {
      const { data: wordData, error: wordError } = await supabase.from("words").select("no, url, thai, reading, meaning, frequency, formality").order("no", { ascending: true }); // no順に並べる

      if (wordError) throw new Error(wordError.message);
      const allWords = wordData;
      words = allWords;

      // Supabaseから進捗を読み込む
      const { data, error: sbError } = await supabase.from("word_status").select("word_no, status, is_favorite, is_pending, review_count, next_review_at").eq("stage", 1);

      if (sbError) throw new Error(sbError.message);

      const loaded = {};
      for (const row of data) {
        loaded[row.word_no] = {
          status: row.status,
          isFavorite: row.is_favorite ?? false,
          isPending: row.is_pending ?? false,
          reviewCount: row.review_count ?? 0,
          nextReviewAt: row.next_review_at ?? null,
        };
      }
      statuses = loaded;
      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  // ============================================================
  // 「知ってる」「知らない」の管理
  // ============================================================

  // 各単語の状態を記録するオブジェクト
  // キー：word_no、値：'known' か 'unknown'
  let statuses = $state({});

  // ============================================================
  // Supabase から学習進捗を読み込む
  // ============================================================
  onMount(async () => {
    const { data, error } = await supabase.from("word_status").select("word_no, status, is_favorite, is_pending, review_count, next_review_at").eq("stage", 1); // stage1（タイ語→日本語）のデータだけ取得

    if (error) {
      console.error("進捗の読み込みに失敗:", error.message);
      return;
    }

    const loaded = {};
    for (const row of data) {
      loaded[row.word_no] = {
        status: row.status,
        isFavorite: row.is_favorite ?? false,
      };
    }
    statuses = loaded;
  });

  // ============================================================
  // Supabase に学習進捗を保存する
  // ============================================================
  async function saveStatus(wordNo, fields) {
    // fields には { status: '...' } や { is_favorite: true } などを渡す
    const { error } = await supabase.from("word_status").upsert(
      { word_no: wordNo, stage: 1, updated_at: new Date().toISOString(), ...fields },
      { onConflict: "word_no, stage" }, // word_no と stage の組み合わせで判断
    );

    if (error) {
      console.error("保存に失敗:", error.message);
    }
  }

  // 正解回数に応じた次回出題までの日数
  function getNextInterval(count) {
    // 1回目→1日、2回目→3日、3回目→7日、4回目→14日、5回目→30日
    // 6回目以降は前回の2倍ずつ伸びていく
    const base = [1, 3, 7, 14, 30];
    if (count <= base.length) {
      return base[count - 1];
    }
    // 6回目以降：30 * 2^(count-5)
    return Math.round(30 * Math.pow(2, count - 5));
  }

  async function markKnown() {
    const wordNo = currentWord.no;

    // 今の正解回数を取得（なければ0）
    const currentCount = statuses[wordNo]?.reviewCount ?? 0;
    const newCount = currentCount + 1;

    // 次回出題日を計算する
    const days = getNextInterval(newCount);
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + days); // 今日 + days日後

    statuses = {
      ...statuses,
      [wordNo]: {
        ...statuses[wordNo],
        status: "known",
        reviewCount: newCount,
        nextReviewAt: nextReview.toISOString(),
      },
    };

    await saveStatus(wordNo, {
      status: "known",
      review_count: newCount,
      next_review_at: nextReview.toISOString(),
    });

    if (filteredWords.length > 1) nextWord();
  }

  // 「知らない」ボタンを押したとき
  async function markUnknown() {
    const wordNo = currentWord.no;

    // 明日また出題されるようにリセット
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 1);

    statuses = {
      ...statuses,
      [wordNo]: {
        ...statuses[wordNo],
        status: "unknown",
        reviewCount: 0,
        nextReviewAt: nextReview.toISOString(),
      },
    };

    await saveStatus(wordNo, {
      status: "unknown",
      review_count: 0,
      next_review_at: nextReview.toISOString(),
    });

    if (filteredWords.length > 1) nextWord();
  }

  // ☆ボタンを押したとき
  async function toggleFavorite() {
    const wordNo = currentWord.no;
    // 今の状態を反転する
    const newVal = !statuses[wordNo]?.isFavorite;
    statuses = {
      ...statuses,
      [wordNo]: { ...statuses[wordNo], isFavorite: newVal },
    };
    await saveStatus(wordNo, { is_favorite: newVal });
  }

  // 今の単語がお気に入りかどうか
  let isFavorite = $derived(statuses[currentWord?.no]?.isFavorite ?? false);

  // 💤保留ボタンを押したとき
  async function togglePending() {
    const wordNo = currentWord.no;
    // 今の状態を反転する
    const newVal = !statuses[wordNo]?.isPending;
    statuses = {
      ...statuses,
      [wordNo]: { ...statuses[wordNo], isPending: newVal },
    };
    await saveStatus(wordNo, { is_pending: newVal });
  }

  // 今の単語が保留かどうか
  let isPending = $derived(statuses[currentWord?.no]?.isPending ?? false);

  // 今の単語の状態
  let currentStatus = $derived(statuses[currentWord?.no]?.status);

  // ============================================================
  // ボタンの処理
  // ============================================================

  function toggleMeaning() {
    showMeaning = !showMeaning;
  }

  // ============================================================
  // 復習モードの管理
  // ============================================================

  // 表示モード： 'all'（全部）か 'unknown'（知らない単語のみ）
  let mode = $state("all");

  // 今日の日付を「2026-03-20」のような文字列で取得する
  // 日付が変わると自動的に別のセットになる
  const todayKey = new Date().toISOString().slice(0, 10);

  // シード値（乱数の種）を作る関数
  // 同じシード値なら同じ並び順になる → 今日中は同じx個の単語が出る
  function seededShuffle(array, seed) {
    const arr = [...array]; // 元の配列を壊さないようにコピー
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      // シード値をもとに疑似乱数を生成する
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = Math.abs(s) % (i + 1);
      // i番目とj番目を入れ替える
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 今日の出題数（ここを変えるだけで問題数が変わる）
  const todayLimit = 10;

  // 表示対象の単語リスト（モードによって変わる）
  let filteredWords = $derived(
    (() => {
      if (mode === "unknown") {
        // 知らない単語だけ
        return words.filter((w) => statuses[w.no]?.status === "unknown" && !statuses[w.no]?.isPending);
      } else if (mode === "today") {
        // 知らない単語からランダムでx個の単語を選ぶ
        const unknowns = words.filter((w) => statuses[w.no]?.status === "unknown" && !statuses[w.no]?.isPending);
        // 今日の日付をシード値（数字）に変換する
        // 例：'2026-03-20' → 20260320
        const seed = parseInt(todayKey.replace(/-/g, ""));
        // シャッフルして最初のx個の単語を取る
        return seededShuffle(unknowns, seed).slice(0, todayLimit);
      } else if (mode === "favorite") {
        // お気に入りの単語だけ
        return words.filter((w) => statuses[w.no]?.isFavorite && !statuses[w.no]?.isPending);
      } else if (mode === "unanswered") {
        // 未回答の単語だけ（statusがない単語）
        return words.filter((w) => !statuses[w.no]?.status && !statuses[w.no]?.isPending);
      } else if (mode === "pending") {
        // 保留中の単語だけ
        return words.filter((w) => statuses[w.no]?.isPending);
      } else if (mode === "review") {
        // next_review_at が今日以前の「知ってる」単語だけ
        const now = new Date();
        return words.filter((w) => {
          const next = statuses[w.no]?.nextReviewAt;
          return next && new Date(next) <= now;
        });
      } else {
        // 全部（保留は除外）
        return words.filter((w) => !statuses[w.no]?.isPending);
      }
    })(),
  );

  // filteredWords の中での現在位置
  let filteredIndex = $state(0);

  // モードが切り替わったらインデックスをリセット
  $effect(() => {
    mode; // mode を参照することで、変化を検知する
    filteredIndex = 0;
    showMeaning = false;
  });

  // 今表示している単語（filteredWords ベース）
  let currentWord = $derived(filteredWords[filteredIndex]);

  // 次へ・前へも filteredWords ベースに変更
  function nextWord() {
    showMeaning = false;
    filteredIndex = (filteredIndex + 1) % filteredWords.length;
  }

  function prevWord() {
    showMeaning = false;
    filteredIndex = (filteredIndex - 1 + filteredWords.length) % filteredWords.length;
  }

  // 999以上は「999+」と表示する
  function formatCount(n) {
    return n > 999 ? "999+" : n;
  }
</script>

{#if loading}
  <p>読み込み中...</p>
{:else if error}
  <p style="color: red;">エラー: {error}</p>
  <!-- 該当する単語が0件のとき -->
{:else if filteredWords.length === 0}
  <div class="card">
    {#if mode === "pending"}
      <p style="font-size: 48px;">💤</p>
      <p>保留中の単語はありません</p>
      <button onclick={() => (mode = "all")}>全部を見る</button>
    {:else if mode === "favorite"}
      <p style="font-size: 48px;">⭐</p>
      <p>お気に入りの単語はありません</p>
      <button onclick={() => (mode = "all")}>全部を見る</button>
    {:else if mode === "review"}
      <p style="font-size: 48px;">🎉</p>
      <p>今日の復習はありません！</p>
      <button onclick={() => (mode = "all")}>全部を見る</button>
    {:else}
      <p style="font-size: 48px;">🎉</p>
      <p>該当する単語がありません！</p>
      <button onclick={() => (mode = "all")}>全部を見る</button>
    {/if}
  </div>
{:else if currentWord}
  <div class="card">
    <!-- メニューに戻るリンク -->
    <a href="/" class="back-link">← メニューに戻る</a>
    <!-- モード切り替えボタン -->
    <div class="mode-switch">
      <!-- 上段：よく使う3つ -->
      <div class="mode-primary">
        <button class:active={mode === "review"} onclick={() => (mode = "review")}>
          🔁 復習<span class="count"
            >{formatCount(
              words.filter((w) => {
                const next = statuses[w.no]?.nextReviewAt;
                return next && new Date(next) <= new Date();
              }).length,
            )}</span
          >
        </button>
        <button class:active={mode === "today"} onclick={() => (mode = "today")}>
          📅 今日の{todayLimit}問
        </button>
        <button class:active={mode === "unanswered"} onclick={() => (mode = "unanswered")}>
          ❓ 未回答<span class="count">{formatCount(words.filter((w) => !statuses[w.no]?.status && !statuses[w.no]?.isPending).length)}</span>
        </button>
      </div>
      <!-- 下段：サブ4つ -->
      <div class="mode-secondary">
        <button class:active={mode === "all"} onclick={() => (mode = "all")}>
          📚 全部<span class="count">{formatCount(words.filter((w) => !statuses[w.no]?.isPending).length)}</span>
        </button>
        <button class:active={mode === "unknown"} onclick={() => (mode = "unknown")}>
          ❌ 知らない<span class="count">{formatCount(Object.values(statuses).filter((s) => s?.status === "unknown").length)}</span>
        </button>
        <button class:active={mode === "favorite"} onclick={() => (mode = "favorite")}>
          ⭐ スター<span class="count">{formatCount(Object.values(statuses).filter((s) => s?.isFavorite).length)}</span>
        </button>
        <button class:active={mode === "pending"} onclick={() => (mode = "pending")}>
          💤 保留<span class="count">{formatCount(words.filter((w) => statuses[w.no]?.isPending).length)}</span>
        </button>
      </div>
    </div>
    <!-- 番号・お気に入り・保留ボタン -->
    <div class="top-row">
      <p class="counter">{filteredIndex + 1} / {filteredWords.length}</p>
      <div class="top-buttons">
        <button class="fav-btn" onclick={toggleFavorite}>
          {isFavorite ? "★" : "☆"}
        </button>
        <button class="pending-btn" class:active={isPending} onclick={togglePending}> 💤 </button>
      </div>
    </div>

    <!-- 今の単語の状態バッジ -->
    {#if currentStatus === "known"}
      <span class="badge known">✅ 知ってる</span>
    {:else if currentStatus === "unknown"}
      <span class="badge unknown">❌ 知らない</span>
    {:else}
      <span class="badge none">未回答</span>
    {/if}

    <!-- タイ語 -->
    <h1 class="thai">{currentWord.thai}</h1>

    <!-- 読み -->
    <p class="reading">{currentWord.reading}</p>

    <!-- 頻出度・フォーマル度 -->
    <div class="word-meta">
      <span>頻出 {currentWord.frequency ?? "-"}</span>
      <span>格式 {currentWord.formality ?? "-"}</span>
    </div>

    <!-- gotthaiリンク -->
    <a class="gotthai-link" href={currentWord.url} target="_blank" rel="noreferrer"> 🔗 ごったいで見る </a>

    <!-- 意味を見るボタン or 意味 -->
    {#if !showMeaning}
      <button onclick={toggleMeaning}>意味を見る</button>
    {:else}
      <p class="meaning">{currentWord.meaning}</p>

      <!-- 意味が表示されたら「知ってる／知らない」ボタンを出す -->
      <div class="judge">
        <button class="known-btn" onclick={markKnown}>😊 知ってる</button>
        <button class="unknown-btn" onclick={markUnknown}>😓 知らない</button>
      </div>
    {/if}

    <!-- 前へ・次へ -->
    <div class="nav">
      <button onclick={prevWord}>← 前へ</button>
      <button onclick={nextWord}>次へ →</button>
    </div>
  </div>
{/if}

<style>
  .card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 340px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .counter {
    color: #999;
    font-size: 14px;
    margin-bottom: 8px;
  }

  .thai {
    font-size: 48px;
    margin: 16px 0;
    color: #333;
  }

  .reading {
    color: #666;
    font-size: 18px;
    margin-bottom: 24px;
  }

  .meaning {
    font-size: 20px;
    color: #2a7ae2;
    margin: 16px 0;
  }

  .nav {
    display: flex;
    justify-content: space-between;
    margin-top: 24px;
  }

  button {
    background: #2a7ae2;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 16px;
    cursor: pointer;
  }

  button:hover {
    background: #1a5fbb;
  }

  /* 状態バッジ */
  .badge {
    display: inline-block;
    font-size: 12px;
    padding: 2px 10px;
    border-radius: 20px;
    margin-bottom: 8px;
  }
  .known {
    background: #d4edda;
    color: #155724;
  }
  .unknown {
    background: #f8d7da;
    color: #721c24;
  }
  .none {
    background: #e2e8f0;
    color: #666;
  }

  /* 知ってる／知らないボタンエリア */
  .judge {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 16px;
  }

  /* 知ってるボタン（緑） */
  .known-btn {
    background: #28a745;
  }
  .known-btn:hover {
    background: #1e7e34;
  }

  /* 知らないボタン（赤） */
  .unknown-btn {
    background: #dc3545;
  }
  .unknown-btn:hover {
    background: #bd2130;
  }

  /* モード切り替えエリア */
  .mode-switch {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  /* 上段：3つ均等 */
  .mode-primary {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }

  /* 下段：4つ均等 */
  .mode-secondary {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 6px;
  }

  .mode-primary button {
    background: #e2e8f0;
    color: #333;
    border: none;
    border-radius: 8px;
    padding: 8px 4px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .mode-secondary button {
    background: #f0f4f8;
    color: #666;
    border: none;
    border-radius: 8px;
    padding: 6px 2px;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .mode-primary button.active {
    background: #2a7ae2;
    color: white;
  }

  .mode-secondary button.active {
    background: #2a7ae2;
    color: white;
  }

  .mode-primary button.active .count,
  .mode-secondary button.active .count {
    color: #cce0ff;
  }

  /* ボタン共通 */
  .mode-switch button {
    background: #e2e8f0;
    color: #333;
    border: none;
    border-radius: 8px;
    padding: 8px 4px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  /* 件数の数字 */
  .count {
    font-size: 11px;
    color: #666;
  }

  /* アクティブなボタン */
  .mode-switch button.active {
    background: #2a7ae2;
    color: white;
  }

  .mode-switch button.active .count {
    color: #cce0ff;
  }

  /* gotthaiリンク */
  .gotthai-link {
    display: block;
    font-size: 12px;
    color: #999;
    text-decoration: none;
    margin-bottom: 16px;
  }

  .gotthai-link:hover {
    color: #2a7ae2;
  }

  /* 番号とお気に入りボタンの行 */
  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  /* お気に入りボタン */
  .fav-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #f5a623;
    padding: 0;
  }

  .fav-btn:hover {
    background: none;
  }

  .back-link {
    display: block;
    font-size: 13px;
    color: #999;
    text-decoration: none;
    margin-top: 16px;
    margin-bottom: 10px;
  }

  .back-link:hover {
    color: #2a7ae2;
  }

  /* 頻出度・フォーマル度の小さい表示 */
  .word-meta {
    display: flex;
    justify-content: center;
    gap: 12px;
    font-size: 12px;
    color: #aaa;
    margin-bottom: 16px;
  }

  .top-buttons {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .pending-btn {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    opacity: 0.3; /* 保留していないときは薄く表示 */
  }

  .pending-btn:hover {
    background: none;
    opacity: 0.6;
  }

  .pending-btn.active {
    opacity: 1;
  }
</style>
