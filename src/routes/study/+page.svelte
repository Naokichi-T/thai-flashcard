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
            url: cols[1], // URL
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
      // status と is_favorite を両方保存する
      loaded[row.word_no] = {
        status: row.status,
        isFavorite: row.is_favorite ?? false,
      };
    }
    statuses = loaded;
  });

  // ============================================================
  // Supabase に学習進捗を保存する
  // ============================================================
  async function saveStatus(wordNo, fields) {
    // fields には { status: '...' } や { is_favorite: true } などを渡す
    const { error } = await supabase.from("word_status").upsert({ word_no: wordNo, updated_at: new Date().toISOString(), ...fields }, { onConflict: "word_no" });

    if (error) {
      console.error("保存に失敗:", error.message);
    }
  }

  // 「知ってる」ボタンを押したとき
  async function markKnown() {
    const wordNo = currentWord.no; // 先に no を保存しておく
    // 既存のデータを保ちつつ status だけ更新する
    statuses = {
      ...statuses,
      [wordNo]: { ...statuses[wordNo], status: "known" },
    };
    await saveStatus(wordNo, { status: "known" });

    // 次の単語がある場合だけ進む
    if (filteredWords.length > 1) {
      nextWord();
    }
  }

  // 「知らない」ボタンを押したとき
  async function markUnknown() {
    const wordNo = currentWord.no;
    statuses = {
      ...statuses,
      [wordNo]: { ...statuses[wordNo], status: "unknown" },
    };
    await saveStatus(wordNo, { status: "unknown" });
    if (filteredWords.length > 1) nextWord();
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
        return words.filter((w) => statuses[w.no]?.status === "unknown");
      } else if (mode === "today") {
        // 知らない単語からランダムでx個の単語を選ぶ
        const unknowns = words.filter((w) => statuses[w.no] === "unknown");

        // 今日の日付をシード値（数字）に変換する
        // 例：'2026-03-20' → 20260320
        const seed = parseInt(todayKey.replace(/-/g, ""));

        // シャッフルして最初のx個の単語を取る
        return seededShuffle(unknowns, seed).slice(0, todayLimit);
      } else if (mode === "favorite") {
        // お気に入りの単語だけ
        return words.filter((w) => statuses[w.no]?.isFavorite);
      } else if (mode === "unanswered") {
        // 未回答の単語だけ（statusがない単語）
        return words.filter((w) => !statuses[w.no]?.status);
      } else {
        // 全部
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
  <!-- 知らない単語が0件のとき -->
{:else if filteredWords.length === 0}
  <div class="card">
    <p style="font-size: 48px;">🎉</p>
    <p>知らない単語がなくなりました！</p>
    <button onclick={() => (mode = "all")}>全部を見る</button>
  </div>
{:else if currentWord}
  <div class="card">
    <!-- メニューに戻るリンク -->
    <a href="/" class="back-link">← メニューに戻る</a>
    <!-- モード切り替えボタン -->
    <!-- モード切り替えボタン -->
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
    <!-- 番号・進捗・お気に入りボタン -->
    <div class="top-row">
      <p class="counter">{filteredIndex + 1} / {filteredWords.length}</p>
      <!-- ★お気に入りボタン -->
      <button class="fav-btn" onclick={toggleFavorite}>
        {isFavorite ? "★" : "☆"}
      </button>
    </div>

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

    <!-- gotthaiリンク -->
    <a class="gotthai-link" href={currentWord.url} target="_blank" rel="noreferrer"> 🔗 ごったいで見る </a>

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

  /* モード切り替えエリア：2列グリッド */
  .mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
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
  }

  .back-link:hover {
    color: #2a7ae2;
  }
</style>
