<script>
  // ============================================================
  // CSVファイルを読み込んで単語カードを表示するページ
  // ============================================================

  // onMount：ページが表示されたタイミングで処理を実行するための関数
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";
  import { page } from "$app/stores";

  // --- 状態変数 ---
  let words = $state([]);
  let currentIndex = $state(0);
  let showMeaning = $state(false);
  let loading = $state(true);
  let error = $state("");

  // ============================================================
  // Supabaseから単語データを取得する処理
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

      // URLパラメータ ?word=123 があればその単語の位置に飛ぶ
      const wordParam = $page.url.searchParams.get("word");
      if (wordParam) {
        // 全部モードにする
        mode = "all";
        // 該当する単語のインデックスを探す
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
  // 「知ってる」「知らない」の管理
  // ============================================================

  // 各単語の状態を記録するオブジェクト
  // キー：word_no、値：'known' か 'unknown'
  let statuses = $state({});

  // ============================================================
  // メモの管理
  // ============================================================

  // メモの内容を記録するオブジェクト（キー：word_no、値：メモ文字列）
  let memos = $state({});

  // メモ編集パネルの表示フラグ
  let showMemoPanel = $state(false);

  // 今の単語のメモ内容
  let currentMemo = $derived(memos[currentWord?.no] ?? "");

  // ============================================================
  // Supabase に学習進捗を保存する
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
        stage: 1, // reverseは2、writingは3
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
  const MAX_INTERVAL_DAYS = 365; // 1年

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

    // ✅ 「次に表示すべき単語」のIDを先に記憶しておく
    const nextIndex = (filteredIndex + 1) % filteredWords.length;
    const nextWordNo = filteredWords.length > 1 ? filteredWords[nextIndex].no : null;

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

    // ✅ IDから新しいリスト上の位置を探して移動する
    if (nextWordNo !== null) {
      showMeaning = false;
      showMemoPanel = false;
      const newIndex = filteredWords.findIndex((w) => w.no === nextWordNo);
      // 見つかればその位置へ、見つからなければ末尾に合わせる
      filteredIndex = newIndex !== -1 ? newIndex : Math.min(filteredIndex, filteredWords.length - 1);
    }

    await saveStatus(wordNo, {
      status: "known",
      review_count: newCount,
      next_review_at: nextReview.toISOString(),
    });
  }

  // 「知らない」ボタンを押したとき
  async function markUnknown() {
    const wordNo = currentWord.no;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 1);

    // ✅ 次の単語のIDを先に記憶
    const nextIndex = (filteredIndex + 1) % filteredWords.length;
    const nextWordNo = filteredWords.length > 1 ? filteredWords[nextIndex].no : null;

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
      showMeaning = false;
      showMemoPanel = false;
      const newIndex = filteredWords.findIndex((w) => w.no === nextWordNo);
      filteredIndex = newIndex !== -1 ? newIndex : Math.min(filteredIndex, filteredWords.length - 1);
    }

    await saveStatus(wordNo, {
      status: "unknown",
      review_count: 0,
      next_review_at: nextReview.toISOString(),
    });
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
        // 全部（保留も含めて全単語を表示）
        return words;
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
    showMemoPanel = false;
    filteredIndex = (filteredIndex + 1) % filteredWords.length;
  }

  function prevWord() {
    showMeaning = false;
    showMemoPanel = false;
    filteredIndex = (filteredIndex - 1 + filteredWords.length) % filteredWords.length;
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
          📅 今日の{todayLimit}問<span class="count">{formatCount(Math.min(words.filter((w) => statuses[w.no]?.status === "unknown" && !statuses[w.no]?.isPending).length, todayLimit))}</span>
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

    <!-- 今の単語の状態バッジ -->
    {#if isPending}
      <span class="badge pending">💤 保留中</span>
    {:else if currentStatus === "known"}
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
    <div class="gotthai-wrap">
      <a class="gotthai-link" href={currentWord.url} target="_blank" rel="noreferrer"> 🔗 ごったいで見る </a>
    </div>

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

  /* 保留バッジ */
  .pending {
    background: #fff3cd;
    color: #856404;
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
    text-align: left;
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
    font-size: 18px;
    box-sizing: border-box;
    font-family: Noto Sans Thai;
  }
</style>
