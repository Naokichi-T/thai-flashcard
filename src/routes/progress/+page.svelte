<script>
  // ============================================================
  // 進捗確認ページ
  // 全体サマリーと頻出度別の学習進捗を表示する
  // ============================================================

  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  // --- 状態変数 ---
  let words = $state([]); // 全単語データ
  let statuses = $state({}); // stage1の進捗データ
  let loading = $state(true);
  let error = $state("");

  // ============================================================
  // データ読み込み
  // ============================================================
  onMount(async () => {
    try {
      // 全単語を取得（頻出度・フォーマル度も含む）
      const { data: wordData, error: wordError } = await supabase.from("words").select("no, frequency, formality").order("no", { ascending: true });

      if (wordError) throw new Error(wordError.message);
      words = wordData;

      // stage1の進捗を取得
      const { data: statusData, error: statusError } = await supabase.from("word_status").select("word_no, status, is_pending").eq("stage", 1);

      if (statusError) throw new Error(statusError.message);

      const loaded = {};
      for (const row of statusData) {
        loaded[row.word_no] = {
          status: row.status,
          isPending: row.is_pending ?? false,
        };
      }
      statuses = loaded;

      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  // ============================================================
  // 全体サマリーの計算
  // ============================================================
  let summary = $derived(
    (() => {
      const total = words.length;
      const pending = words.filter((w) => statuses[w.no]?.isPending).length;
      const target = total - pending; // 保留を除いた学習対象
      const known = words.filter((w) => statuses[w.no]?.status === "known" && !statuses[w.no]?.isPending).length;
      const unanswered = words.filter((w) => !statuses[w.no]?.status && !statuses[w.no]?.isPending).length;
      const rate = target > 0 ? Math.round((known / target) * 100) : 0;

      return { total, pending, target, known, unanswered, rate };
    })(),
  );

  // ============================================================
  // 頻出度別の集計
  // ============================================================
  let freqStats = $derived(
    (() => {
      const result = [];
      for (let freq = 10; freq >= 1; freq--) {
        // この頻出度の単語
        const freqWords = words.filter((w) => w.frequency === freq);
        const total = freqWords.length;
        if (total === 0) continue; // 件数0はスキップ

        const pending = freqWords.filter((w) => statuses[w.no]?.isPending).length;
        const target = total - pending;
        const known = freqWords.filter((w) => statuses[w.no]?.status === "known" && !statuses[w.no]?.isPending).length;
        const rate = target > 0 ? Math.round((known / target) * 100) : 0;

        result.push({ freq, total, pending, known, target, rate });
      }
      return result;
    })(),
  );
</script>

{#if loading}
  <p>読み込み中...</p>
{:else if error}
  <p style="color:red;">エラー: {error}</p>
{:else}
  <div class="container">
    <a href="/" class="back-link">← メニューに戻る</a>
    <h1 class="title">📊 進捗確認</h1>

    <!-- 全体サマリー -->
    <div class="summary">
      <div class="summary-row">
        <span class="label">総単語数</span>
        <span class="value">{summary.total}件</span>
      </div>
      <div class="summary-row">
        <span class="label">学習対象</span>
        <span class="value">{summary.target}件</span>
      </div>
      <div class="summary-row">
        <span class="label">既知</span>
        <span class="value known">{summary.known}件</span>
      </div>
      <div class="summary-row">
        <span class="label">未回答</span>
        <span class="value">{summary.unanswered}件</span>
      </div>
      <div class="summary-row">
        <span class="label">保留</span>
        <span class="value">{summary.pending}件</span>
      </div>
      <!-- 進捗バー -->
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width: {summary.rate}%"></div>
      </div>
      <p class="rate">{summary.rate}%</p>
    </div>

    <!-- 頻出度別テーブル -->
    <table class="freq-table">
      <thead>
        <tr>
          <th>頻出度</th>
          <th>件数</th>
          <th>既知</th>
          <th>進捗率</th>
        </tr>
      </thead>
      <tbody>
        {#each freqStats as row}
          <tr>
            <td>{row.freq}</td>
            <td>{row.total}</td>
            <td>{row.known}</td>
            <td>
              <div class="mini-bar-wrap">
                <div class="mini-bar" style="width: {row.rate}%"></div>
              </div>
              {row.rate}%
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .container {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 340px;
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
    font-size: 24px;
    color: #333;
    margin-bottom: 16px;
    text-align: center;
  }

  /* 全体サマリー */
  .summary {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    margin-bottom: 6px;
  }

  .label {
    color: #666;
  }

  .value {
    font-weight: bold;
    color: #333;
  }

  .value.known {
    color: #28a745;
  }

  /* 進捗バー */
  .progress-bar-wrap {
    background: #e2e8f0;
    border-radius: 8px;
    height: 10px;
    margin-top: 12px;
    overflow: hidden;
  }

  .progress-bar {
    background: #28a745;
    height: 100%;
    border-radius: 8px;
    transition: width 0.3s;
  }

  .rate {
    text-align: right;
    font-size: 13px;
    color: #28a745;
    margin-top: 4px;
  }

  /* 頻出度別テーブル */
  .freq-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .freq-table th {
    text-align: center;
    color: #999;
    font-weight: normal;
    padding: 6px 4px;
    border-bottom: 1px solid #e2e8f0;
  }

  .freq-table td {
    text-align: center;
    padding: 8px 4px;
    border-bottom: 1px solid #f0f0f0;
    color: #333;
  }

  /* ミニ進捗バー */
  .mini-bar-wrap {
    background: #e2e8f0;
    border-radius: 4px;
    height: 6px;
    overflow: hidden;
    margin-bottom: 2px;
  }

  .mini-bar {
    background: #28a745;
    height: 100%;
    border-radius: 4px;
  }

  .freq-table th:nth-child(1),
  .freq-table td:nth-child(1) {
    width: 25%; /* 頻出度：少し狭く */
  }

  .freq-table th:nth-child(2),
  .freq-table td:nth-child(2) {
    width: 20%; /* 件数 */
  }

  .freq-table th:nth-child(3),
  .freq-table td:nth-child(3) {
    width: 20%; /* 既知 */
  }

  .freq-table th:nth-child(4),
  .freq-table td:nth-child(4) {
    width: 35%; /* 進捗率：バーがあるので広め */
  }
</style>
