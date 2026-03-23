<script>
  // ============================================================
  // 日本語→タイ語モード
  // 「知ってる」単語から出題し、タイ語の読み方を答える
  // ============================================================

  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let words = $state([]);
  let statuses = $state({});
  let currentIndex = $state(0);
  let showAnswer = $state(false); // タイ語・読みを表示するかどうか
  let showReading = $state(false); // 読みを表示するかどうか
  let loading = $state(true);
  let error = $state("");
  let memos = $state({});
  let showMemoPanel = $state(false);
  let currentMemo = $derived(memos[currentWord?.no] ?? "");

  // 今日の日付（今日のN問用）
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLimit = 10;

  // ============================================================
  // シャッフル関数（study と同じ）
  // ============================================================
  function seededShuffle(array, seed) {
    const arr = [...array];
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = Math.abs(s) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ============================================================
  // データ読み込み
  // ============================================================
  // 全件取得する関数（1000件ずつ分割して取得）
  async function fetchAllWords() {
    let allWords = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("words")
        .select("no, url, thai, reading, meaning, frequency, formality")
        .order("no", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) throw new Error(error.message);
      allWords = [...allWords, ...data];

      if (data.length < batchSize) break; // 取得件数が1000未満なら終了
      from += batchSize;
    }

    return allWords;
  }

  onMount(async () => {
    try {
      // 全単語を取得（1000件ずつ分割）
      words = await fetchAllWords();
      console.log("取得件数:", words.length); // 確認用

      // stage1の進捗を取得
      const { data: statusData, error: statusError } = await supabase.from("word_status").select("word_no, status, is_favorite, is_pending, review_count, next_review_at").eq("stage", 1);

      if (statusError) throw new Error(statusError.message);

      const loaded = {};
      for (const row of statusData) {
        loaded[row.word_no] = {
          status: row.status,
          isFavorite: row.is_favorite ?? false,
          isPending: row.is_pending ?? false,
          reviewCount: row.review_count ?? 0,
          nextReviewAt: row.next_review_at ?? null,
        };
      }
      statuses = loaded;

      // メモを取得
      const { data: memoData, error: memoError } = await supabase.from("word_memo").select("word_no, memo");

      if (memoError) throw new Error(memoError.message);

      const loadedMemos = {};
      for (const row of memoData) {
        loadedMemos[row.word_no] = row.memo;
      }
      memos = loadedMemos;

      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  // ============================================================
  // 表示モード
  // ============================================================
  let mode = $state("all");

  let filteredWords = $derived(
    (() => {
      if (mode === "unknown") {
        return words.filter((w) => statuses[w.no]?.status === "unknown" && !statuses[w.no]?.isPending);
      } else if (mode === "today") {
        const unknowns = words.filter((w) => statuses[w.no]?.status === "unknown" && !statuses[w.no]?.isPending);
        const seed = parseInt(todayKey.replace(/-/g, ""));
        return seededShuffle(unknowns, seed).slice(0, todayLimit);
      } else if (mode === "favorite") {
        return words.filter((w) => statuses[w.no]?.isFavorite && !statuses[w.no]?.isPending);
      } else if (mode === "unanswered") {
        return words.filter((w) => !statuses[w.no]?.status && !statuses[w.no]?.isPending);
      } else if (mode === "pending") {
        return words.filter((w) => statuses[w.no]?.isPending);
      } else if (mode === "review") {
        const now = new Date();
        return words.filter((w) => {
          const next = statuses[w.no]?.nextReviewAt;
          return next && new Date(next) <= now;
        });
      } else {
        return words;
      }
    })(),
  );

  let filteredIndex = $state(0);

  $effect(() => {
    mode;
    filteredIndex = 0;
    showAnswer = false;
    showReading = false;
  });

  let currentWord = $derived(filteredWords[filteredIndex]);

  // ============================================================
  // ボタンの処理
  // ============================================================
  function toggleAnswer() {
    showAnswer = !showAnswer;
  }

  function nextWord() {
    showAnswer = false;
    showReading = false;
    filteredIndex = (filteredIndex + 1) % filteredWords.length;
  }

  function prevWord() {
    showAnswer = false;
    showReading = false;
    filteredIndex = (filteredIndex - 1 + filteredWords.length) % filteredWords.length;
  }

  async function saveStatus(wordNo, fields) {
    // ログイン中のユーザーIDを取得
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const { error } = await supabase.from("word_status").upsert(
      {
        word_no: wordNo,
        stage: 2, // reverseは2、writingは3
        user_id: userId, // ← 追加
        updated_at: new Date().toISOString(),
        ...fields,
      },
      { onConflict: "word_no, stage, user_id" },
    );

    if (error) {
      console.error("保存に失敗:", error.message);
    }
  }

  // 復習間隔の上限（日数）
  const MAX_INTERVAL_DAYS = 270; // 9か月

  function getNextInterval(count) {
    const base = [1, 3, 7, 14, 30];
    let days;
    if (count <= base.length) {
      days = base[count - 1];
    } else {
      days = Math.round(30 * Math.pow(2, count - 5));
    }
    // 上限を超えたらMAX_INTERVAL_DAYSを返す
    return Math.min(days, MAX_INTERVAL_DAYS);
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

  // お気に入りを切り替える
  async function toggleFavorite() {
    const wordNo = currentWord.no;
    const newVal = !statuses[wordNo]?.isFavorite;
    statuses = {
      ...statuses,
      [wordNo]: { ...statuses[wordNo], isFavorite: newVal },
    };
    const { error: sbError } = await supabase.from("word_status").upsert({ word_no: wordNo, stage: 2, is_favorite: newVal, updated_at: new Date().toISOString() }, { onConflict: "word_no, stage" });
    if (sbError) console.error("保存失敗:", sbError.message);
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

  // 今の単語のステータスバッジ用
  let currentStatus = $derived(statuses[currentWord?.no]?.status);

  // 999以上は「999+」と表示する
  function formatCount(n) {
    return n > 999 ? "999+" : n;
  }

  // メモをSupabaseに保存する
  async function saveMemo(wordNo, memoText) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const { error } = await supabase.from("word_memo").upsert(
      {
        word_no: wordNo,
        user_id: userId,
        memo: memoText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, word_no" },
    );

    if (error) {
      console.error("メモの保存に失敗:", error.message);
    }
  }

  // ✏️ボタンを押したとき：メモパネルの開閉
  function toggleMemoPanel() {
    showMemoPanel = !showMemoPanel;
  }

  // メモの内容が変わったとき：状態を更新して保存
  async function handleMemoInput(e) {
    const wordNo = currentWord.no;
    const text = e.target.value;
    // 状態を更新
    memos = { ...memos, [wordNo]: text };
    // Supabaseに保存
    await saveMemo(wordNo, text);
  }
</script>

<!-- ============================================================
  HTML
============================================================ -->

{#if loading}
  <p>読み込み中...</p>
{:else if error}
  <p style="color:red;">エラー: {error}</p>
{:else if words.length === 0}
  <!-- 知ってる単語がまだない場合 -->
  <div class="card">
    <p style="font-size: 48px;">📚</p>
    <p>「知ってる」単語がまだありません。</p>
    <p style="font-size:13px; color:#999;">まずタイ語→日本語モードで単語を仕分けしてください。</p>
    <a href="/study" class="back-link">← タイ語→日本語へ</a>
  </div>
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
    <!-- メニューに戻る -->
    <a href="/" class="back-link">← メニューに戻る</a>

    <!-- モード切り替え -->
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
        <button class="memo-btn" class:active={currentMemo !== ""} onclick={toggleMemoPanel}> ✏️ </button>
      </div>
    </div>

    <!-- ステータスバッジ -->
    {#if isPending}
      <span class="badge pending">💤 保留中</span>
    {:else if currentStatus === "known"}
      <span class="badge known">✅ 知ってる</span>
    {:else if currentStatus === "unknown"}
      <span class="badge unknown">❌ 知らない</span>
    {:else}
      <span class="badge none">未回答</span>
    {/if}

    <!-- 日本語（意味）を表示 -->
    <p class="meaning-main">{currentWord.meaning}</p>

    <!-- 答えを見るボタン or タイ語・読み -->
    {#if !showAnswer}
      <!-- 読みを見るボタン -->
      {#if !showReading}
        <button class="reading-btn" onclick={() => (showReading = true)}>読みを見る</button>
      {:else}
        <p class="reading-hint">{currentWord.reading}</p>
      {/if}

      <!-- タイ語を見るボタン -->
      <button onclick={toggleAnswer}>タイ語を見る</button>
    {:else}
      <h1 class="thai">{currentWord.thai}</h1>
      <div class="word-meta">
        <span>頻出 {currentWord.frequency ?? "-"}</span>
        <span>格式 {currentWord.formality ?? "-"}</span>
      </div>

      <!-- gotthaiリンク -->
      <a class="gotthai-link" href={currentWord.url} target="_blank" rel="noreferrer"> 🔗 ごったいで見る </a>

      <!-- 分かる／分からないボタン -->
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

    <!-- メモパネル（✏️を押したら表示） -->
    {#if showMemoPanel}
      <div class="memo-panel">
        <textarea class="memo-textarea" placeholder="語源・例文などをメモ..." value={currentMemo} oninput={handleMemoInput}></textarea>
      </div>
    {/if}
  </div>
{/if}

<style>
  .card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 90vw; /* 画面幅の90% */
    max-width: 400px; /* 最大400px */
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .back-link {
    display: block;
    font-size: 13px;
    color: #999;
    text-decoration: none;
    margin-bottom: 10px;
    text-align: left;
  }
  .back-link:hover {
    color: #2a7ae2;
  }

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
    white-space: nowrap !important;
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

  .count {
    font-size: 11px;
    color: #666;
  }

  .mode-switch button.active {
    background: #2a7ae2;
    color: white;
  }

  .mode-switch button.active .count {
    color: #cce0ff;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .counter {
    color: #999;
    font-size: 14px;
  }

  /* 意味を大きく表示 */
  .meaning-main {
    font-size: 24px;
    color: #333;
    margin: 24px 0;
    min-height: 60px;
  }

  .thai {
    font-size: 48px;
    margin: 16px 0;
    color: #333;
  }

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

  .judge {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 16px;
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

  .known-btn {
    background: #28a745;
  }
  .known-btn:hover {
    background: #1e7e34;
  }

  .unknown-btn {
    background: #dc3545;
  }
  .unknown-btn:hover {
    background: #bd2130;
  }

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

  .pending {
    background: #fff3cd;
    color: #856404;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

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

  .count {
    font-size: 11px;
    color: #666;
  }

  .mode-switch button.active .count {
    color: #cce0ff;
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

  /* 読みを見るボタン（控えめなスタイル） */
  .reading-btn {
    display: block;
    margin: 0 auto;
    margin-bottom: 12px;
    background: none;
    border: 1px solid #ccc;
    color: #999;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 20px;
    cursor: pointer;
    margin-bottom: 12px;
  }
  .reading-btn:hover {
    background: #f0f0f0;
    color: #666;
  }

  /* 読みの表示 */
  .reading-hint {
    font-size: 16px;
    color: #aaa;
    margin-bottom: 12px;
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

  /* メモボタン */
  .memo-btn {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    opacity: 0.3; /* メモなしは薄く */
  }

  .memo-btn:hover {
    background: none;
    opacity: 0.6;
  }

  .memo-btn.active {
    opacity: 1; /* メモありは普通の濃さ */
  }

  /* メモ入力エリア */
  .memo-panel {
    margin-top: 16px;
    text-align: left;
  }

  .memo-textarea {
    width: 100%;
    min-height: 100px;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    resize: vertical; /* 縦方向にだけリサイズ可能 */
    box-sizing: border-box;
    font-family: inherit;
  }
</style>
