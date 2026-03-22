<script>
  // ============================================================
  // 保留一覧ページ
  // 保留中の単語をstageごとに表示・解除できる
  // ============================================================

  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let words = $state([]); // 全単語データ
  let statuses = $state({}); // stageごとの進捗データ
  let loading = $state(true);
  let error = $state("");
  let activeStage = $state(1); // 表示中のstage（1/2/3）

  // ============================================================
  // データ読み込み
  // ============================================================
  onMount(async () => {
    try {
      // 全単語を取得
      const { data: wordData, error: wordError } = await supabase.from("words").select("no, thai, reading, meaning, frequency, formality").order("no", { ascending: true });

      if (wordError) throw new Error(wordError.message);
      words = wordData;

      // 全stageの保留データを取得
      const { data: statusData, error: statusError } = await supabase.from("word_status").select("word_no, stage, is_pending").eq("is_pending", true);

      if (statusError) throw new Error(statusError.message);

      // statuses[stage][word_no] = true の形で格納
      const loaded = { 1: {}, 2: {}, 3: {} };
      for (const row of statusData) {
        loaded[row.stage][row.word_no] = true;
      }
      statuses = loaded;

      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  // ============================================================
  // 表示中のstageの保留単語リスト
  // ============================================================
  let pendingWords = $derived(words.filter((w) => statuses[activeStage]?.[w.no]));

  // ============================================================
  // 保留を解除する
  // ============================================================
  async function releasePending(wordNo) {
    // 画面から即座に消す
    statuses = {
      ...statuses,
      [activeStage]: {
        ...statuses[activeStage],
        [wordNo]: false,
      },
    };

    // Supabaseを更新
    const { error: sbError } = await supabase.from("word_status").update({ is_pending: false }).eq("word_no", wordNo).eq("stage", activeStage);

    if (sbError) console.error("解除失敗:", sbError.message);
  }

  // stageごとの保留件数（タブに表示）
  let countByStage = $derived({
    1: words.filter((w) => statuses[1]?.[w.no]).length,
    2: words.filter((w) => statuses[2]?.[w.no]).length,
    3: words.filter((w) => statuses[3]?.[w.no]).length,
  });
</script>

<!-- ============================================================
  HTML
============================================================ -->

<div class="container">
  <!-- メニューに戻る -->
  <a href="/" class="back-link">← メニューに戻る</a>

  <h1 class="title">💤 保留一覧</h1>

  {#if loading}
    <p>読み込み中...</p>
  {:else if error}
    <p style="color:red;">エラー: {error}</p>
  {:else}
    <!-- stageタブ -->
    <div class="tabs">
      <button class:active={activeStage === 1} onclick={() => (activeStage = 1)}>
        Stage 1<span class="count">{countByStage[1]}</span>
      </button>
      <button class:active={activeStage === 2} onclick={() => (activeStage = 2)}>
        Stage 2<span class="count">{countByStage[2]}</span>
      </button>
      <button class:active={activeStage === 3} onclick={() => (activeStage = 3)}>
        Stage 3<span class="count">{countByStage[3]}</span>
      </button>
    </div>

    {#if pendingWords.length === 0}
      <p class="empty">保留中の単語はありません</p>
    {:else}
      <ul class="word-list">
        {#each pendingWords as word}
          <li class="word-item">
            <div class="word-info">
              <span class="thai">{word.thai}</span>
              <span class="meaning">{word.meaning}</span>
              <span class="meta">頻出 {word.frequency ?? "-"} 格式 {word.formality ?? "-"}</span>
            </div>
            <!-- 解除ボタン -->
            <button class="release-btn" onclick={() => releasePending(word.no)}> 解除 </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .container {
    width: 340px;
    margin: 0 auto;
    padding: 24px 0;
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
    font-size: 24px;
    color: #333;
    margin-bottom: 16px;
    text-align: center;
  }

  /* stageタブ */
  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .tabs button {
    flex: 1;
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

  .tabs button.active {
    background: #2a7ae2;
    color: white;
  }

  .count {
    font-size: 11px;
    color: #666;
  }

  .tabs button.active .count {
    color: #cce0ff;
  }

  .empty {
    text-align: center;
    color: #999;
    margin-top: 32px;
  }

  /* 単語リスト */
  .word-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .word-item {
    background: white;
    border-radius: 12px;
    padding: 12px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .word-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
  }

  .thai {
    font-size: 20px;
    color: #333;
    white-space: nowrap; /* 改行しない */
    overflow: hidden; /* はみ出した部分を隠す */
    text-overflow: ellipsis; /* はみ出したところを...にする */
    max-width: 200px; /* これがないと効かないので必要 */
  }

  .meaning {
    font-size: 13px;
    color: #666;
    white-space: nowrap; /* 改行しない */
    overflow: hidden; /* はみ出した部分を隠す */
    text-overflow: ellipsis; /* はみ出したところを...にする */
    max-width: 200px; /* これがないと効かないので必要 */
  }

  .meta {
    font-size: 11px;
    color: #aaa;
  }

  /* 解除ボタン */
  .release-btn {
    background: #e2e8f0;
    color: #555;
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .release-btn:hover {
    background: #cbd5e0;
  }
</style>
