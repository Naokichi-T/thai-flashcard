<script>
  // ============================================================
  // 書き取りモード
  // 日本語を見てタイ語を入力して正解か確認する
  // ============================================================

  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let words = $state([]);
  let statuses = $state({});
  let currentIndex = $state(0);
  let input = $state(""); // 入力されたタイ語
  let checked = $state(false); // 答え合わせをしたかどうか
  let showReading = $state(false); // 読みを表示するかどうか
  let isCorrect = $state(false); // 正解かどうか
  let loading = $state(true);
  let error = $state("");

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLimit = 10;

  // ============================================================
  // シャッフル関数（他のページと同じ）
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
  onMount(async () => {
    try {
      // Supabaseから単語データを取得
      const { data: wordData, error: wordError } = await supabase.from("words").select("no, url, thai, reading, meaning, frequency, formality").order("no", { ascending: true }); // no順に並べる

      if (wordError) throw new Error(wordError.message);
      const allWords = wordData;
      words = allWords;

      // stage3の進捗を読み込む
      const { data, error: sbError } = await supabase.from("word_status").select("word_no, status, is_favorite, is_pending, review_count, next_review_at").eq("stage", 3);
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

      // stage2で「知ってる」の単語を出題対象にする
      const { data: stage2Data, error: stage2Error } = await supabase.from("word_status").select("word_no").eq("stage", 2).eq("status", "known");
      if (stage2Error) throw new Error(stage2Error.message);

      const knownInStage2 = new Set(stage2Data.map((r) => r.word_no));
      words = allWords.filter((w) => knownInStage2.has(w.no));

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
        return words.filter((w) => !statuses[w.no]?.isPending);
      }
    })(),
  );

  let filteredIndex = $state(0);

  $effect(() => {
    mode;
    filteredIndex = 0;
    resetCard();
  });

  let currentWord = $derived(filteredWords[filteredIndex]);
  let currentStatus = $derived(statuses[currentWord?.no]?.status);
  let isFavorite = $derived(statuses[currentWord?.no]?.isFavorite ?? false);
  let isPending = $derived(statuses[currentWord?.no]?.isPending ?? false);

  // ============================================================
  // カードをリセットする
  // ============================================================
  function resetCard() {
    input = "";
    checked = false;
    isCorrect = false;
    showReading = false;
  }

  // ============================================================
  // 答え合わせボタンを押したとき
  // ============================================================
  function checkAnswer() {
    // 入力値と正解を比較（前後のスペースを除去して比較）
    isCorrect = input.trim() === currentWord.thai.trim();
    checked = true;
  }

  // ============================================================
  // 次へ・前へ
  // ============================================================
  function nextWord() {
    resetCard();
    filteredIndex = (filteredIndex + 1) % filteredWords.length;
  }

  function prevWord() {
    resetCard();
    filteredIndex = (filteredIndex - 1 + filteredWords.length) % filteredWords.length;
  }

  // ============================================================
  // 知ってる・知らないボタン
  // ============================================================
  async function saveStatus(wordNo, fields) {
    const { error: sbError } = await supabase.from("word_status").upsert({ word_no: wordNo, stage: 3, updated_at: new Date().toISOString(), ...fields }, { onConflict: "word_no, stage" });
    if (sbError) console.error("保存失敗:", sbError.message);
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

  // ============================================================
  // お気に入り
  // ============================================================
  async function toggleFavorite() {
    const wordNo = currentWord.no;
    const newVal = !statuses[wordNo]?.isFavorite;
    statuses = { ...statuses, [wordNo]: { ...statuses[wordNo], isFavorite: newVal } };
    await saveStatus(wordNo, { is_favorite: newVal });
  }

  // ============================================================
  // 保留
  // ============================================================
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

  // 999以上は「999+」と表示する
  function formatCount(n) {
    return n > 999 ? "999+" : n;
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
  <div class="card">
    <p style="font-size: 48px;">📚</p>
    <p>「日本語→タイ語」で「知ってる」単語がまだありません。</p>
    <a href="/reverse" class="back-link">← 日本語→タイ語へ</a>
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
      </div>
    </div>

    <!-- ステータスバッジ -->
    {#if currentStatus === "known"}
      <span class="badge known">✅ 知ってる</span>
    {:else if currentStatus === "unknown"}
      <span class="badge unknown">❌ 知らない</span>
    {:else}
      <span class="badge none">未回答</span>
    {/if}

    <!-- 日本語（意味）を表示 -->
    <p class="meaning-main">{currentWord.meaning}</p>

    <!-- 読みを見るボタン -->
    {#if !showReading}
      <button class="reading-btn" onclick={() => (showReading = true)}>読みを見る</button>
    {:else}
      <p class="reading-hint">{currentWord.reading}</p>
    {/if}

    <!-- 入力エリア（答え合わせ前） -->
    {#if !checked}
      <input class="thai-input" type="text" placeholder="タイ語を入力..." bind:value={input} />
      <button onclick={checkAnswer} disabled={input.trim() === ""}> 答え合わせ </button>

      <!-- 答え合わせ後 -->
    {:else}
      <!-- 正解・不正解の表示 -->
      <div class="result {isCorrect ? 'correct' : 'incorrect'}">
        {isCorrect ? "⭕ 正解！" : "❌ 不正解"}
      </div>

      <!-- 正解と入力の比較 -->
      <div class="answer-compare">
        <p>正解：<span class="thai">{currentWord.thai}</span></p>
        <p>入力：<span class={isCorrect ? "correct-text" : "incorrect-text"}>{input}</span></p>
      </div>

      <!-- 頻出度・フォーマル度 -->
      <div class="word-meta">
        <span>頻出 {currentWord.frequency ?? "-"}</span>
        <span>格式 {currentWord.formality ?? "-"}</span>
      </div>
      <!-- gotthaiリンク -->
      <a class="gotthai-link" href={currentWord.url} target="_blank" rel="noreferrer"> 🔗 ごったいで見る </a>

      <!-- 知ってる・知らないボタン -->
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

  /* 意味を大きく表示 */
  .meaning-main {
    font-size: 24px;
    color: #333;
    margin: 16px 0;
    min-height: 60px;
  }

  /* タイ語入力ボックス */
  .thai-input {
    width: 100%;
    font-size: 24px;
    text-align: center;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 12px;
    box-sizing: border-box;
    outline: none;
  }
  .thai-input:focus {
    border-color: #2a7ae2;
  }

  /* 正解・不正解の表示 */
  .result {
    font-size: 24px;
    font-weight: bold;
    margin: 8px 0;
  }
  .correct {
    color: #28a745;
  }
  .incorrect {
    color: #dc3545;
  }

  /* 正解と入力の比較エリア */
  .answer-compare {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 12px;
    margin: 12px 0;
    text-align: left;
    font-size: 14px;
  }
  .answer-compare p {
    margin: 4px 0;
  }

  .thai {
    font-size: 20px;
  }

  .correct-text {
    font-size: 20px;
    color: #28a745;
    font-weight: bold;
  }
  .incorrect-text {
    font-size: 20px;
    color: #dc3545;
    font-weight: bold;
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
    margin-top: 8px;
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
  button:disabled {
    background: #aaa;
    cursor: not-allowed;
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

  /* 頻出度・フォーマル度の小さい表示 */
  .word-meta {
    display: flex;
    justify-content: center;
    gap: 12px;
    font-size: 12px;
    color: #aaa;
    margin-top: 16px;
    margin-bottom: 16px;
  }

  .reading-btn {
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
</style>
