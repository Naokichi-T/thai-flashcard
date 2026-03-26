<script>
  // ============================================================
  // 書き取りモード
  // 日本語を見てタイ語を入力して正解か確認する
  // ============================================================

  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";
  import { page } from "$app/stores";

  // --- 状態変数 ---
  let words = $state([]);
  // stage2の進捗（全部モードのフィルタ用・読み取り専用）
  let stage1Statuses = $state({});
  // stage3の進捗（writingでの知ってる/知らない用）
  let statuses = $state({});
  let currentIndex = $state(0);
  let input = $state(""); // 入力されたタイ語
  let checked = $state(false); // 答え合わせをしたかどうか
  let showReading = $state(false); // 読みを表示するかどうか
  let isCorrect = $state(false); // 正解かどうか
  let loading = $state(true);
  let error = $state("");
  let memos = $state({});
  let showMemoPanel = $state(false);
  let currentMemo = $derived(memos[currentWord?.no] ?? "");

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLimit = 20;

  const todayAnswerKey = `todayAnswer_stage3_${todayKey}`;
  let todayAnswerCount = $state(
    (() => {
      // ✅ ブラウザ上でのみlocalStorageを読む
      if (typeof window === "undefined") return 0;
      const saved = localStorage.getItem(todayAnswerKey);
      return saved ? parseInt(saved) : 0;
    })(),
  );

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

      // stage2の進捗を取得
      const { data: statusData, error: statusError } = await supabase.from("word_status").select("word_no, status, is_favorite, is_pending, review_count, next_review_at").eq("stage", 2); // ← writingはstage2を読み込む

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
      // stage1のデータはstage1Statusesに入れる
      stage1Statuses = loaded;

      // stage3の進捗を取得
      const { data: status2Data, error: status2Error } = await supabase.from("word_status").select("word_no, status, is_favorite, is_pending, review_count, next_review_at").eq("stage", 3);

      if (status2Error) throw new Error(status2Error.message);

      const loaded2 = {};
      for (const row of status2Data) {
        loaded2[row.word_no] = {
          status: row.status,
          isFavorite: row.is_favorite ?? false,
          isPending: row.is_pending ?? false,
          reviewCount: row.review_count ?? 0,
          nextReviewAt: row.next_review_at ?? null,
        };
      }
      statuses = loaded2;

      // メモを取得
      const { data: memoData, error: memoError } = await supabase.from("word_memo").select("word_no, memo");

      if (memoError) throw new Error(memoError.message);

      const loadedMemos = {};
      for (const row of memoData) {
        loadedMemos[row.word_no] = row.memo;
      }
      memos = loadedMemos;

      const wordParam = $page.url.searchParams.get("word");
      if (wordParam) {
        mode = "all";
        const targetIndex = words.findIndex((w) => String(w.no) === wordParam);
        if (targetIndex !== -1) {
          filteredIndex = targetIndex;
        }
      }

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
        // 未回答 = stage2で「知ってる」かつwritingでまだ回答していない単語
        return words.filter((w) => stage1Statuses[w.no]?.status === "known" && !statuses[w.no]?.status && !statuses[w.no]?.isPending);
      } else if (mode === "pending") {
        return words.filter((w) => statuses[w.no]?.isPending);
      } else if (mode === "review") {
        // next_review_at が今日以前の単語だけ絞り込む
        const now = new Date();
        const reviewWords = words.filter((w) => {
          const next = statuses[w.no]?.nextReviewAt;
          return next && new Date(next) <= now;
        });
        // 今日のシード値でシャッフルしてランダム順にする
        const seed = parseInt(todayKey.replace(/-/g, ""));
        return seededShuffle(reviewWords, seed);
      } else {
        // 全部 = stage2で「知ってる」にした単語（writingでの状態は問わない）
        return words.filter((w) => stage1Statuses[w.no]?.status === "known");
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
    showMemoPanel = false;
  }

  function prevWord() {
    resetCard();
    filteredIndex = (filteredIndex - 1 + filteredWords.length) % filteredWords.length;
    showMemoPanel = false;
  }

  // ============================================================
  // 知ってる・知らないボタン
  // ============================================================
  async function saveStatus(wordNo, fields) {
    // ログイン中のユーザーIDを取得
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const { error } = await supabase.from("word_status").upsert(
      {
        word_no: wordNo,
        stage: 3, // writingは3
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
  const MAX_INTERVAL_DAYS = 180; // 6か月

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
    const currentCount = statuses[wordNo]?.reviewCount ?? 0;
    const newCount = currentCount + 1;

    const days = getNextInterval(newCount);
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + days);

    // ✅ 次の単語のIDを先に記憶
    const nextIndex = (filteredIndex + 1) % filteredWords.length;
    const nextWordNo = filteredWords.length > 1 ? filteredWords[nextIndex].no : null;

    // ✅ 表示をリセット（checked = false になってもここで完結するので問題ない）
    resetCard();
    showMemoPanel = false;

    // statuses を更新（リストが再計算される）
    statuses = {
      ...statuses,
      [wordNo]: {
        ...statuses[wordNo],
        status: "known",
        reviewCount: newCount,
        nextReviewAt: nextReview.toISOString(),
      },
    };

    // ✅ IDから新しい位置を探して移動
    if (nextWordNo !== null) {
      const newIndex = filteredWords.findIndex((w) => w.no === nextWordNo);
      filteredIndex = newIndex !== -1 ? newIndex : Math.min(filteredIndex, filteredWords.length - 1);
    }

    todayAnswerCount += 1;
    // ✅ ブラウザ上でのみlocalStorageに保存する
    if (typeof window !== "undefined") {
      localStorage.setItem(todayAnswerKey, todayAnswerCount);
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("todayAnswer_") && key !== todayAnswerKey) {
          localStorage.removeItem(key);
        }
      }
    }

    await saveStatus(wordNo, {
      status: "known",
      review_count: newCount,
      next_review_at: nextReview.toISOString(),
    });
  }

  async function markUnknown() {
    const wordNo = currentWord.no;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 1);

    // ✅ 次の単語のIDを先に記憶
    const nextIndex = (filteredIndex + 1) % filteredWords.length;
    const nextWordNo = filteredWords.length > 1 ? filteredWords[nextIndex].no : null;

    // ✅ 表示をリセット
    resetCard();
    showMemoPanel = false;

    statuses = {
      ...statuses,
      [wordNo]: {
        ...statuses[wordNo],
        status: "unknown",
        reviewCount: 0,
        nextReviewAt: nextReview.toISOString(),
      },
    };

    // ✅ IDから位置を探して移動
    if (nextWordNo !== null) {
      const newIndex = filteredWords.findIndex((w) => w.no === nextWordNo);
      filteredIndex = newIndex !== -1 ? newIndex : Math.min(filteredIndex, filteredWords.length - 1);
    }

    todayAnswerCount += 1;
    // ✅ ブラウザ上でのみlocalStorageに保存する
    if (typeof window !== "undefined") {
      localStorage.setItem(todayAnswerKey, todayAnswerCount);
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("todayAnswer_") && key !== todayAnswerKey) {
          localStorage.removeItem(key);
        }
      }
    }

    await saveStatus(wordNo, {
      status: "unknown",
      review_count: 0,
      next_review_at: nextReview.toISOString(),
    });
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

    // パネルを開いたとき、既存メモの高さに合わせる
    if (showMemoPanel) {
      // DOMが更新されてからtextareaの高さを調整する
      setTimeout(() => {
        const textarea = document.querySelector(".memo-textarea");
        if (textarea) {
          textarea.style.height = "auto";
          textarea.style.height = textarea.scrollHeight + "px";
        }
      }, 0);
    }
  }

  // メモの内容が変わったとき：状態を更新して保存
  async function handleMemoInput(e) {
    const wordNo = currentWord.no;
    const text = e.target.value;
    // 状態を更新
    memos = { ...memos, [wordNo]: text };
    // Supabaseに保存
    await saveMemo(wordNo, text);
    // 入力内容に応じてtextareaの高さを自動調整
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
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
          📅 今日の{todayLimit}問<span class="count">{formatCount(Math.min(words.filter((w) => statuses[w.no]?.status === "unknown" && !statuses[w.no]?.isPending).length, todayLimit))}</span>
        </button>
        <button class:active={mode === "unanswered"} onclick={() => (mode = "unanswered")}>
          ❓ 未回答<span class="count">{formatCount(words.filter((w) => stage1Statuses[w.no]?.status === "known" && !statuses[w.no]?.status && !statuses[w.no]?.isPending).length)}</span>
        </button>
      </div>

      <!-- 下段：サブ4つ -->
      <div class="mode-secondary">
        <button class:active={mode === "all"} onclick={() => (mode = "all")}>
          📚 全部<span class="count">{formatCount(words.filter((w) => stage1Statuses[w.no]?.status === "known").length)}</span>
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
      <!-- 未回答モードのときだけ本日回答数を中央に表示 -->
      {#if mode === "unanswered"}
        <p class="today-count">本日回答: {todayAnswerCount}</p>
      {/if}
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
      <div class="gotthai-wrap">
        <a class="gotthai-link" href={currentWord.url} target="_blank" rel="noreferrer"> 🔗 ごったいで見る </a>
      </div>

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
    width: 90vw;
    max-width: 400px;
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

  .pending {
    background: #fff3cd;
    color: #856404;
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

  .gotthai-wrap {
    text-align: center;
    margin-bottom: 16px;
  }

  .gotthai-link {
    display: inline-block;
    font-size: 12px;
    color: #999;
    text-decoration: none;
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
    gap: 10px;
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
    min-height: 60px;
    height: auto;
    resize: none;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
    font-family: inherit;
  }

  /* 本日回答数 */
  .today-count {
    font-size: 13px;
    color: #999;
  }
</style>
