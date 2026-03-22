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
  let loading = $state(true);
  let error = $state("");

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
  onMount(async () => {
    try {
      // Supabaseから単語データを取得
      const { data: wordData, error: wordError } = await supabase.from("words").select("no, url, thai, reading, meaning, frequency, formality").order("no", { ascending: true }); // no順に並べる

      if (wordError) throw new Error(wordError.message);
      const allWords = wordData;
      words = allWords;

      // Supabaseから進捗読み込み
      const { data, error: sbError } = await supabase.from("word_status").select("word_no, status, is_favorite").eq("stage", 2); // stage2（日本語→タイ語）のデータだけ取得

      if (sbError) throw new Error(sbError.message);

      const loaded = {};
      for (const row of data) {
        loaded[row.word_no] = {
          status: row.status,
          isFavorite: row.is_favorite ?? false,
        };
      }
      statuses = loaded;

      // stage1で「知ってる」になった単語を別途取得する
      const { data: stage1Data, error: stage1Error } = await supabase.from("word_status").select("word_no").eq("stage", 1).eq("status", "known");

      if (stage1Error) throw new Error(stage1Error.message);

      // stage1で「知ってる」の word_no のセットを作る
      const knownInStage1 = new Set(stage1Data.map((r) => r.word_no));

      // stage1で「知ってる」の単語だけを出題対象にする
      words = allWords.filter((w) => knownInStage1.has(w.no));

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
      } else if (mode === "favorite") {
        return words.filter((w) => statuses[w.no]?.isFavorite);
      } else if (mode === "unanswered") {
        return words.filter((w) => !statuses[w.no]?.status);
      }
      return words;
    })(),
  );

  let filteredIndex = $state(0);

  $effect(() => {
    mode;
    filteredIndex = 0;
    showAnswer = false;
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
    filteredIndex = (filteredIndex + 1) % filteredWords.length;
  }

  function prevWord() {
    showAnswer = false;
    filteredIndex = (filteredIndex - 1 + filteredWords.length) % filteredWords.length;
  }

  async function saveStatus(wordNo, fields) {
    const { error: sbError } = await supabase.from("word_status").upsert({ word_no: wordNo, stage: 2, updated_at: new Date().toISOString(), ...fields }, { onConflict: "word_no, stage" });
    if (sbError) console.error("保存失敗:", sbError.message);
  }

  // 「分かる」「分からない」で知ってる単語から除外・維持
  async function markKnown() {
    const wordNo = currentWord.no;
    statuses = {
      ...statuses,
      [wordNo]: { ...statuses[wordNo], status: "known" },
    };
    await saveStatus(wordNo, { status: "known" });
    if (filteredWords.length > 1) nextWord();
  }

  async function markUnknown() {
    const wordNo = currentWord.no;
    // 「知らない」に変更してSupabaseも更新
    statuses = {
      ...statuses,
      [wordNo]: { ...statuses[wordNo], status: "unknown" },
    };
    const { error: sbError } = await supabase.from("word_status").upsert({ word_no: wordNo, stage: 2, status: "unknown", updated_at: new Date().toISOString() }, { onConflict: "word_no, stage" });
    if (sbError) console.error("保存失敗:", sbError.message);

    // リストから除外されるので次へ
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

  // 今の単語のステータスバッジ用
  let currentStatus = $derived(statuses[currentWord?.no]?.status);
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
    <p style="font-size: 48px;">🎉</p>
    <p>今日の出題が終わりました！</p>
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

    <!-- 答えを見るボタン or タイ語・読み -->
    {#if !showAnswer}
      <button onclick={toggleAnswer}>タイ語を見る</button>
    {:else}
      <h1 class="thai">{currentWord.thai}</h1>
      <p class="reading">{currentWord.reading}</p>
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

  .reading {
    color: #666;
    font-size: 18px;
    margin-bottom: 8px;
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
</style>
