<script>
  // ============================================================
  // 暗記済み一覧ページ
  // 暗記済みの単語をstageごとに表示・解除できる
  // ============================================================

  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let words = $state([]);
  let statuses = $state({});
  let loading = $state(true);
  let error = $state("");
  let activeStage = $state(1); // 表示中のstage（1/2/3）

  // ============================================================
  // データ読み込み
  // ============================================================
  // 全件取得する関数（1000件ずつ分割して取得）
  async function fetchAllWords() {
    let allWords = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("words")
        .select("no, url, url_no, thai, reading, meaning, frequency, formality")
        .order("frequency", { ascending: false })
        .order("url_no", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) throw new Error(error.message);
      allWords = [...allWords, ...data];

      if (data.length < batchSize) break;
      from += batchSize;
    }

    return allWords;
  }

  onMount(async () => {
    try {
      // 全単語を取得（1000件ずつ分割）
      words = await fetchAllWords();

      // stage1〜3の暗記済みデータをページネーションで全件取得
      const loaded = { 1: {}, 2: {}, 3: {} };
      let statusFrom = 0;
      const statusBatchSize = 1000;

      while (true) {
        const { data: statusData, error: statusError } = await supabase
          .from("word_status")
          .select("word_no, stage, is_memorized")
          .in("stage", [1, 2, 3])
          .range(statusFrom, statusFrom + statusBatchSize - 1);

        if (statusError) throw new Error(statusError.message);

        // stageごとに分けて格納する
        // ✅ word_no を数値に変換してキーにする
        for (const row of statusData) {
          loaded[row.stage][Number(row.word_no)] = {
            isMemorized: row.is_memorized ?? false,
          };
        }

        if (statusData.length < statusBatchSize) break;
        statusFrom += statusBatchSize;
      }
      statuses = loaded;

      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  // ============================================================
  // 表示中のstageの暗記済み単語リスト
  // ============================================================
  let memorizedWords = $derived(words.filter((w) => statuses[activeStage]?.[w.no]?.isMemorized === true));

  // stageごとの暗記済み件数（タブに表示）
  let countByStage = $derived({
    1: words.filter((w) => statuses[1]?.[w.no]?.isMemorized === true).length,
    2: words.filter((w) => statuses[2]?.[w.no]?.isMemorized === true).length,
    3: words.filter((w) => statuses[3]?.[w.no]?.isMemorized === true).length,
  });

  // ============================================================
  // 暗記済みを解除する
  // ============================================================
  async function releaseMemorized(wordNo) {
    // 画面から即座に反映する（stage1〜3 すべての isMemorized を false に）
    statuses = {
      ...statuses,
      1: { ...statuses[1], [wordNo]: { ...statuses[1]?.[wordNo], isMemorized: false } },
      2: { ...statuses[2], [wordNo]: { ...statuses[2]?.[wordNo], isMemorized: false } },
      3: { ...statuses[3], [wordNo]: { ...statuses[3]?.[wordNo], isMemorized: false } },
    };

    // Supabaseを更新（stage1〜3 すべてまとめて）
    // - is_memorized: false（暗記済み解除）
    // - status: "unknown"（知らないに戻す）
    // - review_count: 0（正解回数リセット）
    // - next_review_at: 今日（すぐ復習対象に）
    const today = new Date().toISOString();
    const { error: sbError } = await supabase
      .from("word_status")
      .update({
        is_memorized: false,
        status: "unknown",
        review_count: 0,
        next_review_at: today,
      })
      .eq("word_no", wordNo)
      .in("stage", [1, 2, 3]);

    if (sbError) console.error("解除失敗:", sbError.message);
  }
</script>

<!-- ============================================================
  HTML
============================================================ -->

{#if loading}
  <p>読み込み中...</p>
{:else if error}
  <p style="color:red;">エラー: {error}</p>
{:else}
  <div class="container">
    <a href="/" class="back-link">← メニューに戻る</a>
    <h1 class="title">🎓 暗記済み一覧</h1>

    <!-- stageタブ -->
    <div class="tabs">
      <button class:active={activeStage === 1} onclick={() => (activeStage = 1)}>
        タイ語→日本語<span class="count">{countByStage[1]}</span>
      </button>
      <button class:active={activeStage === 2} onclick={() => (activeStage = 2)}>
        日本語→タイ語<span class="count">{countByStage[2]}</span>
      </button>
      <button class:active={activeStage === 3} onclick={() => (activeStage = 3)}>
        書き取り<span class="count">{countByStage[3]}</span>
      </button>
    </div>

    {#if memorizedWords.length === 0}
      <p class="empty">暗記済みの単語はありません</p>
    {:else}
      <ul class="word-list">
        {#each memorizedWords as word}
          <li class="word-item">
            <div class="word-info">
              <span class="thai">{word.thai}</span>
              <span class="meaning">{word.meaning}</span>
              <span class="meta">頻出 {word.frequency ?? "-"} 格式 {word.formality ?? "-"}</span>
            </div>
            <!-- 解除ボタン -->
            <button class="release-btn" onclick={() => releaseMemorized(word.no)}> 解除 </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .meaning {
    font-size: 13px;
    color: #666;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
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

  .container {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 340px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }
</style>
