<script>
  // ============================================================
  // 検索ページ
  // タイ語・日本語・メモで単語を検索する
  // ============================================================
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let query = $state(""); // 検索ワード
  let results = $state([]); // 検索結果
  let searching = $state(false); // 検索中フラグ
  let searched = $state(false); // 一度でも検索したかどうか
  // stage1・stage2の進捗データ（グレーアウト判定用）
  let stage1Statuses = $state({});
  let stage2Statuses = $state({});

  onMount(async () => {
    // stage1の進捗を全件取得
    const loaded1 = {};
    let from1 = 0;
    while (true) {
      const { data: s1 } = await supabase
        .from("word_status")
        .select("word_no, status")
        .eq("stage", 1)
        .range(from1, from1 + 999);
      for (const row of s1 ?? []) loaded1[row.word_no] = row.status;
      if ((s1?.length ?? 0) < 1000) break;
      from1 += 1000;
    }
    stage1Statuses = loaded1;

    // stage2の進捗を全件取得
    const loaded2 = {};
    let from2 = 0;
    while (true) {
      const { data: s2 } = await supabase
        .from("word_status")
        .select("word_no, status")
        .eq("stage", 2)
        .range(from2, from2 + 999);
      for (const row of s2 ?? []) loaded2[row.word_no] = row.status;
      if ((s2?.length ?? 0) < 1000) break;
      from2 += 1000;
    }
    stage2Statuses = loaded2;
  });

  // ============================================================
  // 検索実行
  // ============================================================
  async function search() {
    // 空文字のときは何もしない
    if (!query.trim()) return;

    searching = true;
    searched = true;
    results = [];

    // タイ語・日本語で部分一致検索（wordsテーブル）
    // ilike：大文字小文字を区別しない部分一致
    const { data: wordResults, error: wordError } = await supabase
      .from("words")
      .select("no, thai, reading, meaning, frequency, formality")
      .or(`thai.ilike.%${query}%,meaning.ilike.%${query}%`)
      .order("no", { ascending: true });

    if (wordError) {
      console.error("検索エラー:", wordError.message);
      searching = false;
      return;
    }

    results = wordResults;
    searching = false;
  }

  // Enterキーでも検索できるようにする
  function handleKeydown(e) {
    if (e.key === "Enter") search();
  }
</script>

<div class="card">
  <a href="/" class="back-link">← メニューに戻る</a>
  <h2 class="title">🔍 検索</h2>

  <!-- 検索フォーム -->
  <div class="search-box">
    <input class="search-input" type="text" placeholder="タイ語 or 日本語で検索..." bind:value={query} onkeydown={handleKeydown} />
    <button class="search-btn" onclick={search}>検索</button>
  </div>

  <!-- 検索中 -->
  {#if searching}
    <p class="message">検索中...</p>

    <!-- 結果なし -->
  {:else if searched && results.length === 0}
    <p class="message">「{query}」に一致する単語はありませんでした</p>

    <!-- 検索結果 -->
  {:else if results.length > 0}
    <p class="result-count">{results.length}件見つかりました</p>
    <ul class="result-list">
      <!-- 検索結果1件 -->
      {#each results as word}
        <li class="result-item">
          <span class="result-no">No.{word.no}</span>
          <span class="result-thai">{word.thai}</span>
          <span class="result-reading">{word.reading}</span>
          <span class="result-meaning">{word.meaning}</span>

          <!-- ジャンプボタン -->
          <div class="jump-buttons">
            <!-- studyは常に押せる -->
            <a href="/study?word={word.no}" class="jump-btn">🇹🇭 タイ→日</a>

            <!-- reverseはstage1がknownのときだけ押せる -->

            <a href={stage1Statuses[word.no] === "known" ? `/reverse?word=${word.no}` : undefined} class="jump-btn" class:disabled={stage1Statuses[word.no] !== "known"}>🇯🇵 日→タイ</a>

            <!-- writingはstage2がknownのときだけ押せる -->

            <a href={stage2Statuses[word.no] === "known" ? `/writing?word=${word.no}` : undefined} class="jump-btn" class:disabled={stage2Statuses[word.no] !== "known"}>✏️ 書き取り</a>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 90vw;
    max-width: 400px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

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

  .title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 16px;
    color: #333;
  }

  /* 検索ボックス */
  .search-box {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .search-input {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
  }

  .search-btn {
    background: #2a7ae2;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 16px;
    cursor: pointer;
  }

  .search-btn:hover {
    background: #1a5fbb;
  }

  .message {
    color: #999;
    text-align: center;
    margin-top: 24px;
  }

  .result-count {
    font-size: 13px;
    color: #999;
    margin-bottom: 12px;
  }

  /* 検索結果リスト */
  .result-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* 検索結果1件 */
  .result-item {
    display: flex;
    flex-direction: column;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
    gap: 2px;
  }

  .result-no {
    font-size: 11px;
    color: #aaa;
  }

  .result-thai {
    font-size: 20px;
    color: #333;
  }

  .result-reading {
    font-size: 13px;
    color: #888;
  }

  .result-meaning {
    font-size: 14px;
    color: #555;
    margin-top: 2px;
  }

  /* ジャンプボタンエリア */
  .jump-buttons {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }

  /* ジャンプボタン1つ */
  .jump-btn {
    flex: 1;
    text-align: center;
    padding: 6px 4px;
    background: #2a7ae2;
    color: white;
    border-radius: 6px;
    text-decoration: none;
    font-size: 12px;
  }

  .jump-btn:hover {
    background: #1a5fbb;
  }

  /* グレーアウトされたジャンプボタン */
  .jump-btn.disabled {
    background: #ccc;
    color: #999;
    cursor: default;
    pointer-events: none;
  }
</style>
