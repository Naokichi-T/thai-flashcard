<script>
  // ============================================================
  // CSVファイルを読み込んで単語カードを表示するページ
  // ============================================================

  // onMount：ページが表示されたタイミングで処理を実行するための関数
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

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
  // 「知ってる」「知らない」の管理
  // ============================================================

  // 各単語の状態を記録するオブジェクト
  // キー：word_no、値：'known' か 'unknown'
  let statuses = $state({});

  // ============================================================
  // Supabase から学習進捗を読み込む
  // ============================================================
  onMount(async () => {
    const { data, error } = await supabase
      .from("word_status") // テーブル名
      .select("word_no, status"); // 取得する列

    if (error) {
      console.error("進捗の読み込みに失敗:", error.message);
      return;
    }

    // 配列をオブジェクトに変換する
    // 例： [{ word_no: '1', status: 'known' }]
    //   → { '1': 'known' }
    const loaded = {};
    for (const row of data) {
      loaded[row.word_no] = row.status;
    }
    statuses = loaded;
  });

  // ============================================================
  // Supabase に学習進捗を保存する
  // ============================================================
  async function saveStatus(wordNo, status) {
    const { error } = await supabase.from("word_status").upsert(
      { word_no: wordNo, status: status, updated_at: new Date().toISOString() },
      { onConflict: "word_no" }, // 同じ word_no があれば上書き
    );

    if (error) {
      console.error("進捗の保存に失敗:", error.message);
    }
  }

  // 「知ってる」ボタンを押したとき
  async function markKnown() {
    statuses = { ...statuses, [currentWord.no]: "known" };
    await saveStatus(currentWord.no, "known");
    nextWord();
  }

  // 「知らない」ボタンを押したとき
  async function markUnknown() {
    statuses = { ...statuses, [currentWord.no]: "unknown" };
    await saveStatus(currentWord.no, "unknown");
    nextWord();
  }

  // 今の単語の状態（'known' / 'unknown' / undefined）
  let currentStatus = $derived(statuses[currentWord?.no]);

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

  // 表示対象の単語リスト（モードによって変わる）
  let filteredWords = $derived(mode === "unknown" ? words.filter((w) => statuses[w.no] === "unknown") : words);

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
    filteredIndex = (filteredIndex + 1) % filteredWords.length;
  }

  function prevWord() {
    showMeaning = false;
    filteredIndex = (filteredIndex - 1 + filteredWords.length) % filteredWords.length;
  }
</script>

{#if loading}
  <p>読み込み中...</p>
{:else if error}
  <p style="color: red;">エラー: {error}</p>
{:else if currentWord}
  <div class="card">
    <!-- モード切り替えボタン -->
    <div class="mode-switch">
      <button class:active={mode === "all"} onclick={() => (mode = "all")}>
        全部（{words.length}）
      </button>
      <button class:active={mode === "unknown"} onclick={() => (mode = "unknown")}>
        知らない（{Object.values(statuses).filter((s) => s === "unknown").length}）
      </button>
    </div>
    <!-- 番号と進捗 -->
    <p class="counter">{currentIndex + 1} / {words.length}</p>

    <!-- 今の単語の状態バッジ -->
    {#if currentStatus === "known"}
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
    gap: 8px;
    margin-bottom: 20px;
  }

  /* アクティブなボタンを強調 */
  .mode-switch button {
    background: #e2e8f0;
    color: #333;
  }
  .mode-switch button.active {
    background: #2a7ae2;
    color: white;
  }
</style>
