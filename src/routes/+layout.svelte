<script>
  import favicon from "$lib/assets/favicon.svg";
  import "../app.css"; // 全ページ共通のスタイル

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
