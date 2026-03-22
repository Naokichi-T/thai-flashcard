<script>
  // ============================================================
  // ログインページ
  // ============================================================

  import { supabase } from "$lib/supabase.js";

  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let error = $state("");

  async function login() {
    loading = true;
    error = "";

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      error = "メールアドレスまたはパスワードが違います";
      loading = false;
      return;
    }

    // ログイン成功したらメニューへ
    window.location.href = "/";
  }
</script>

{#if loading}
  <p>ログイン中...</p>
{:else}
  <div class="card">
    <h1 class="title">🇹🇭 タイ語単語帳</h1>
    <p class="subtitle">ログインしてください</p>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <input class="input" type="email" placeholder="メールアドレス" bind:value={email} />
    <input class="input" type="password" placeholder="パスワード" bind:value={password} />

    <button onclick={login} disabled={!email || !password}> ログイン </button>
  </div>
{/if}

<style>
  .card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 340px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .title {
    font-size: 28px;
    color: #333;
    margin-bottom: 8px;
  }

  .subtitle {
    color: #999;
    font-size: 14px;
    margin-bottom: 24px;
  }

  .input {
    width: 100%;
    font-size: 16px;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 12px;
    box-sizing: border-box;
    outline: none;
  }

  .input:focus {
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
    font-size: 13px;
    margin-bottom: 12px;
  }
</style>
