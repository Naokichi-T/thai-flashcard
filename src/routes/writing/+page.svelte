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
      const { data, error: sbError } = await supabase.from("word_status").select("word_no, status, is_favorite").eq("stage", 3);
      if (sbError) throw new Error(sbError.message);

      const loaded = {};
      for (const row of data) {
        loaded[row.word_no] = {
          status: row.status,
          isFavorite: row.is_favorite ?? false,
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
      if (mode === "today") {
        const unknowns = words.filter((w) => statuses[w.no]?.status === "unknown");
        const seed = parseInt(todayKey.replace(/-/g, ""));
        return seededShuffle(unknowns, seed).slice(0, todayLimit);
      } else if (mode === "unknown") {
        return words.filter((w) => statuses[w.no]?.status === "unknown");
      } else if (mode === "unanswered") {
        return words.filter((w) => !statuses[w.no]?.status);
      } else if (mode === "favorite") {
        return words.filter((w) => statuses[w.no]?.isFavorite);
      }
      return words;
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

  // ============================================================
  // カードをリセットする
  // ============================================================
  function resetCard() {
    input = "";
    checked = false;
    isCorrect = false;
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

  async function markKnown() {
    const wordNo = currentWord.no;
    statuses = { ...statuses, [wordNo]: { ...statuses[wordNo], status: "known" } };
    await saveStatus(wordNo, { status: "known" });
    if (filteredWords.length > 1) nextWord();
  }

  async function markUnknown() {
    const wordNo = currentWord.no;
    statuses = { ...statuses, [wordNo]: { ...statuses[wordNo], status: "unknown" } };
    await saveStatus(wordNo, { status: "unknown" });
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
    <p style="font-size: 48px;">🎉</p>
    <p>該当する単語がありません！</p>
    <button onclick={() => (mode = "all")}>全部を見る</button>
  </div>
{:else if currentWord}
  <div class="card">
    <!-- メニューに戻る -->
    <a href="/" class="back-link">← メニューに戻る</a>

    <!-- モード切り替え -->
    <div class="mode-switch">
      <button class:active={mode === "all"} onclick={() => (mode = "all")}>
        📚 全部<span class="count">{words.length}</span>
      </button>
      <button class:active={mode === "unanswered"} onclick={() => (mode = "unanswered")}>
        ❓ 未回答<span class="count">{words.filter((w) => !statuses[w.no]?.status).length}</span>
      </button>
      <button class:active={mode === "unknown"} onclick={() => (mode = "unknown")}>
        ❌ 知らない<span class="count">{Object.values(statuses).filter((s) => s?.status === "unknown").length}</span>
      </button>
      <button class:active={mode === "today"} onclick={() => (mode = "today")}>
        📅 今日の{todayLimit}問
      </button>
      <button class:active={mode === "favorite"} onclick={() => (mode = "favorite")}>
        ⭐ お気に入り<span class="count">{Object.values(statuses).filter((s) => s?.isFavorite).length}</span>
      </button>
    </div>

    <!-- 番号・お気に入り -->
    <div class="top-row">
      <p class="counter">{filteredIndex + 1} / {filteredWords.length}</p>
      <button class="fav-btn" onclick={toggleFavorite}>
        {isFavorite ? "★" : "☆"}
      </button>
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
        <p>読み：<span class="reading">{currentWord.reading}</span></p>
        <p>入力：<span class={isCorrect ? "correct-text" : "incorrect-text"}>{input}</span></p>
      </div>

      <!-- gotthaiリンク -->
      <a class="gotthai-link" href={currentWord.url} target="_blank" rel="noreferrer"> 🔗 gotthaiで見る </a>

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
  }
  .back-link:hover {
    color: #2a7ae2;
  }

  .mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
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
  .reading {
    color: #666;
  }
  .correct-text {
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
</style>
