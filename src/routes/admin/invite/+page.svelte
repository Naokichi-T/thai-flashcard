<script>
  // ============================================================
  // 管理者用：招待メール送信ページ
  // フォームの送信はサーバーサイド（+page.server.js）で処理される
  // ============================================================
  import { enhance } from "$app/forms";

  // サーバーから返ってくる結果（success, error, emailなど）
  let { form } = $props();
</script>

<div class="card">
  <h2>ユーザーを招待する</h2>

  <!-- enhance をつけるとページ全体をリロードせずに送信できる -->
  <form method="POST" use:enhance>
    <div class="field">
      <label for="email">メールアドレス</label>
      <input id="email" name="email" type="email" placeholder="招待するメールアドレス" required />
    </div>

    {#if form?.error}
      <p class="error">{form.error}</p>
    {/if}
    {#if form?.success}
      <p class="success">✅ {form.email} に招待メールを送りました！</p>
    {/if}

    <button type="submit">招待メールを送る</button>
  </form>
</div>

<style>
  .card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 90vw;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  h2 {
    font-size: 20px;
    margin-bottom: 24px;
    color: #333;
  }

  .field {
    text-align: left;
    margin-bottom: 16px;
  }

  label {
    display: block;
    font-size: 13px;
    color: #666;
    margin-bottom: 4px;
  }

  input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: #2a7ae2;
  }

  button {
    width: 100%;
    background: #2a7ae2;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px;
    font-size: 16px;
    cursor: pointer;
    margin-top: 8px;
  }

  button:hover {
    background: #1a5fbb;
  }

  .error {
    color: #dc3545;
    font-size: 14px;
  }

  .success {
    color: #28a745;
    font-size: 16px;
  }
</style>
