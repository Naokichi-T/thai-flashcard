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
            <a href="/study?word={word.no}" class="jump-btn">🇹🇭 タイ語→日本語</a>
            <a href="/reverse?word={word.no}" class="jump-btn">🇯🇵 日本語→タイ語</a>
            <a href="/writing?word={word.no}" class="jump-btn">✏️ 書き取り</a>
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
</style>
