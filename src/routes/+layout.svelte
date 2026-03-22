<script>
  import favicon from "$lib/assets/favicon.ico";
  import "../app.css"; // 全ページ共通のスタイル
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase.js";

  let { children } = $props();

  // ============================================================
  // ログインチェック
  // ログインしていない場合はログインページにリダイレクト
  // ============================================================
  onMount(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // セッションがなく、ログインページ以外にいる場合はリダイレクト
    if (!session && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
