<script>
  // ============================================================
  // 招待メールからのパスワード設定ページ
  // ============================================================
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  let password = $state("");
  let confirmPassword = $state("");
  let loading = $state(false);
  let message = $state("");
  let error = $state("");
  let ready = $state(false); // セッションが確認できたら表示する

  onMount(async () => {
    // URLのハッシュ（#以降）のパラメータを取得する
    // パスワードリセットメールのリンクには #access_token=... が含まれている
    const hashParams = new URLSearchParams(window.location.hash.slice(1));

    // エラーが含まれている場合はエラーメッセージを表示して終了
    if (hashParams.get("error")) {
      error = "リンクが無効か期限切れです。もう一度パスワードリセットを行ってください。";
      return;
    }

    // access_tokenが含まれている場合はセッションを確立する
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        error = "リンクが無効か期限切れです。もう一度お試しください。";
        return;
      }
    }

    // セッションが有効かどうか確認する
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      ready = true;
    } else {
      error = "無効なリンクです。再度招待してもらってください。";
    }
  });

  async function handleSubmit() {
    // パスワードの一致チェック
    if (password !== confirmPassword) {
      error = "パスワードが一致しません";
      return;
    }
    if (password.length < 6) {
      error = "パスワードは6文字以上にしてください";
      return;
    }

    loading = true;
    error = "";

    // パスワードを更新する
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      error = updateError.message;
    } else {
      message = "パスワードを設定しました！このままログインできます。";
      // 3秒後にトップページへ移動する
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    }

    loading = false;
  }
</script>

{#if error && !ready}
  <div class="card">
    <p class="error">{error}</p>
  </div>
{:else if !ready}
  <p>確認中...</p>
{:else if message}
  <div class="card">
    <p class="success">✅ {message}</p>
    <p style="font-size: 13px; color: #999;">3秒後にトップページへ移動します...</p>
  </div>
{:else}
  <div class="card">
    <h2>パスワードを設定してください</h2>

    <div class="field">
      <label for="password">パスワード</label>
      <input id="password" type="password" placeholder="6文字以上" bind:value={password} />
    </div>

    <div class="field">
      <label for="confirmPassword">パスワード（確認）</label>
      <input id="confirmPassword" type="password" placeholder="もう一度入力" bind:value={confirmPassword} />
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <button onclick={handleSubmit} disabled={loading}>
      {loading ? "設定中..." : "パスワードを設定する"}
    </button>
  </div>
{/if}

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

  button:disabled {
    background: #aaa;
    cursor: not-allowed;
  }

  .error {
    color: #dc3545;
    font-size: 14px;
    margin-bottom: 12px;
  }

  .success {
    color: #28a745;
    font-size: 16px;
    margin-bottom: 8px;
  }
</style>
