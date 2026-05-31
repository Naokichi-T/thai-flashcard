<script>
  // ============================================================
  // 苦手な単語一覧ページ
  // study / reverse / writing で間違えた回数を集計して多い順に表示する
  // ============================================================

  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let loading = $state(true);
  let error = $state("");
  let weakWords = $state([]); // 集計済みの苦手単語リスト

  // 絞り込みの閾値（この回数以上の単語だけ表示）
  let minCount = $state(5);

  // 絞り込みの選択肢
  const filterOptions = [1, 3, 5, 10];

  // ============================================================
  // word_status を全件取得する関数（1000件ずつ分割）
  // incorrect_count > 0 のレコードだけ取得する
  // ============================================================
  async function fetchAllStatuses() {
    let allData = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("word_status")
        .select("word_no, stage, incorrect_count")
        // incorrect_count が 1 以上のものだけ取得（0は不要）
        .gt("incorrect_count", 0)
        .range(from, from + batchSize - 1);

      if (error) throw new Error(error.message);
      allData = [...allData, ...data];

      if (data.length < batchSize) break; // 1000件未満なら最後のページ
      from += batchSize;
    }

    return allData;
  }

  // ============================================================
  // words テーブルを全件取得する関数（1000件ずつ分割）
  // ============================================================
  async function fetchAllWords() {
    let allWords = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("words")
        .select("no, thai, reading, meaning")
        .range(from, from + batchSize - 1);

      if (error) throw new Error(error.message);
      allWords = [...allWords, ...data];

      if (data.length < batchSize) break;
      from += batchSize;
    }

    return allWords;
  }

  // ============================================================
  // ページ読み込み時にデータを取得・集計する
  // ============================================================
  onMount(async () => {
    try {
      // word_status と words を並行して取得（速くなる）
      const [statusData, wordsData] = await Promise.all([fetchAllStatuses(), fetchAllWords()]);

      // words を word_no をキーにしたオブジェクトに変換（検索を速くするため）
      const wordsMap = {};
      for (const w of wordsData) {
        wordsMap[w.no] = w;
      }

      // word_no ごとに incorrect_count を合計する
      const countMap = {};
      for (const row of statusData) {
        const no = row.word_no;
        if (!countMap[no]) {
          countMap[no] = 0;
        }
        countMap[no] += row.incorrect_count;
      }

      // 単語情報と合計回数を組み合わせてリストを作る
      const result = [];
      for (const [wordNo, total] of Object.entries(countMap)) {
        const word = wordsMap[Number(wordNo)];
        if (!word) continue; // words に存在しない場合はスキップ

        result.push({
          no: word.no,
          thai: word.thai,
          reading: word.reading,
          meaning: word.meaning,
          totalIncorrect: total,
        });
      }

      // 間違え回数の多い順に並べる
      result.sort((a, b) => b.totalIncorrect - a.totalIncorrect);

      weakWords = result;
      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  // ============================================================
  // 絞り込み後のリスト（minCount 以上のものだけ）
  // ============================================================
  let filteredWords = $derived(weakWords.filter((w) => w.totalIncorrect >= minCount));
</script>

<div class="container">
  <a href="/" class="back-link">← メニューに戻る</a>
  <h1 class="title">🔴 苦手な単語</h1>

  {#if loading}
    <p class="loading">読み込み中...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <!-- 絞り込みボタン -->
    <div class="filter-bar">
      {#each filterOptions as opt}
        <button class:active={minCount === opt} onclick={() => (minCount = opt)}>
          {opt}回以上
        </button>
      {/each}
    </div>

    <p class="count-label">全 {filteredWords.length} 件</p>

    <!-- 単語リスト -->
    {#each filteredWords as word}
      <div class="word-card">
        <div class="word-row">
          <span class="thai">{word.thai}</span>
          <span class="incorrect-count">❌ {word.totalIncorrect}回</span>
        </div>
        <div class="reading">{word.reading}</div>
        <div class="meaning">{word.meaning}</div>
      </div>
    {/each}

    {#if filteredWords.length === 0}
      <p class="empty">該当する単語がありません 🎉</p>
    {/if}
  {/if}
</div>

<style>
  .back-link {
    display: block;
    font-size: 13px;
    color: #999;
    text-decoration: none;
    margin-bottom: 16px;
  }

  .back-link:hover {
    color: #2a7ae2;
  }

  .container {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 340px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .title {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 16px;
    color: #333;
    text-align: center;
  }

  .loading {
    color: #999;
    text-align: center;
  }

  .error {
    color: #dc3545;
    text-align: center;
  }

  /* 絞り込みボタンエリア */
  .filter-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    justify-content: center;
  }

  .filter-bar button {
    background: #e2e8f0;
    color: #333;
    border: none;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
  }

  .filter-bar button:hover {
    background: #cbd5e0;
  }

  .filter-bar button.active {
    background: #2a7ae2;
    color: white;
  }

  /* 件数表示 */
  .count-label {
    font-size: 13px;
    color: #999;
    margin-bottom: 12px;
    text-align: center;
  }

  /* 単語カード */
  .word-card {
    background: white;
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .word-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .thai {
    font-size: 22px;
    color: #333;
  }

  .incorrect-count {
    font-size: 14px;
    font-weight: bold;
    color: #dc3545;
  }

  .reading {
    font-size: 13px;
    color: #888;
    font-family: Arial, Helvetica, sans-serif;
    margin-bottom: 2px;
  }

  .meaning {
    font-size: 14px;
    color: #555;
  }

  .empty {
    text-align: center;
    color: #999;
    margin-top: 40px;
  }
</style>
