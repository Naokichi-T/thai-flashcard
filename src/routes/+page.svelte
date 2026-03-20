<script>
  // ============================================================
  // CSVファイルを読み込んで単語カードを表示するページ
  // ============================================================

  // onMount：ページが表示されたタイミングで処理を実行するための関数
  import { onMount } from "svelte";

  // --- 状態変数 ---
  let words = $state([]);
  let currentIndex = $state(0);
  let showMeaning = $state(false);
  let loading = $state(true);
  let error = $state("");

  // ============================================================
  // CSV を正しくパース（解析）する関数
  // ダブルクォートで囲まれたカンマを「列の区切り」と間違えないようにする
  // ============================================================
  function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false; // 今ダブルクォートの中にいるかどうか

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // ダブルクォートが出たら「中にいる/出た」を切り替える
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        // ダブルクォートの外のカンマ → 列の区切り
        result.push(current.trim());
        current = "";
      } else {
        // それ以外の文字はそのまま追加
        current += char;
      }
    }

    // 最後の列を追加
    result.push(current.trim());
    return result;
  }

  // ============================================================
  // CSVを読み込む処理
  // ============================================================
  onMount(async () => {
    try {
      const response = await fetch("/単語帳.csv");
      if (!response.ok) throw new Error("CSVファイルが見つかりません");

      const text = await response.text();

      // 改行で分割（\r\n と \n 両方に対応）
      const lines = text.trim().split(/\r?\n/);

      // 1行目はヘッダーなので2行目以降を使う
      const dataLines = lines.slice(1);

      words = dataLines
        .map((line) => {
          // 自作パース関数で列に分割する
          const cols = parseCSVLine(line);

          // 列数が足りない行はスキップ
          if (cols.length < 5) return null;

          return {
            no: cols[0], // No.
            thai: cols[2], // タイ語
            reading: cols[3], // 読み
            meaning: cols[4], // 意味（複数のときはカンマ区切りのまま）
          };
        })
        .filter((w) => w !== null && w.thai !== "");

      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  // ============================================================
  // ボタンの処理
  // ============================================================

  function toggleMeaning() {
    showMeaning = !showMeaning;
  }

  function nextWord() {
    showMeaning = false;
    currentIndex = (currentIndex + 1) % words.length;
  }

  function prevWord() {
    showMeaning = false;
    currentIndex = (currentIndex - 1 + words.length) % words.length;
  }

  // 今表示している単語
  let currentWord = $derived(words[currentIndex]);
</script>

{#if loading}
  <p>読み込み中...</p>
{:else if error}
  <p style="color: red;">エラー: {error}</p>
{:else if currentWord}
  <div class="card">
    <p class="counter">{currentIndex + 1} / {words.length}</p>

    <!-- タイ語 -->
    <h1 class="thai">{currentWord.thai}</h1>

    <!-- 読み -->
    <p class="reading">{currentWord.reading}</p>

    <!-- 意味を見るボタン or 意味 -->
    {#if !showMeaning}
      <button onclick={toggleMeaning}>意味を見る</button>
    {:else}
      <p class="meaning">{currentWord.meaning}</p>
    {/if}

    <!-- 前へ・次へ -->
    <div class="nav">
      <button onclick={prevWord}>← 前へ</button>
      <button onclick={nextWord}>次へ →</button>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    background: #f0f4f8;
    font-family: sans-serif;
  }

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
</style>
