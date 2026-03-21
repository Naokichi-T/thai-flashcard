<script>
  // ============================================================
  // メニューページ
  // 学習モードを選んで各ページに遷移する
  // ============================================================
</script>

<div class="menu">
  <h1 class="title">🇹🇭 タイ語単語帳</h1>
  <p class="subtitle">学習モードを選んでください</p>

  <div class="modes">
    <!-- タイ語→日本語モード -->
    <a href="/study" class="mode-card">
      <span class="icon">🃏</span>
      <span class="name">タイ語 → 日本語</span>
      <span class="desc">タイ語を見て意味を答える</span>
    </a>

    <!-- 日本語→タイ語モード -->
    <a href="/reverse" class="mode-card">
      <span class="icon">🔄</span>
      <span class="name">日本語 → タイ語</span>
      <span class="desc">日本語を見てタイ語を答える</span>
    </a>

    <!-- 書き取りモード（後で実装） -->
    <a class="mode-card disabled">
      <span class="icon">✏️</span>
      <span class="name">書き取り</span>
      <span class="desc">近日公開予定</span>
    </a>
  </div>
</div>

<style>
  .menu {
    text-align: center;
  }

  .title {
    font-size: 32px;
    margin-bottom: 8px;
    color: #333;
  }

  .subtitle {
    color: #999;
    margin-bottom: 32px;
  }

  .modes {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 300px;
  }

  /* モードカード */
  .mode-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    text-decoration: none;
    color: #333;
    transition: transform 0.1s;
  }

  .mode-card:hover {
    transform: translateY(-2px);
  }

  .icon {
    font-size: 36px;
    margin-bottom: 8px;
  }

  .name {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 4px;
  }

  .desc {
    font-size: 13px;
    color: #999;
  }

  /* 未実装のモード */
  .disabled {
    opacity: 0.4;
    pointer-events: none;
  }
</style>
