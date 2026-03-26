// ============================================================
// 管理者用：招待メール送信のサーバーサイド処理
// Service Role Key はブラウザに露出させないためサーバーで処理する
// ============================================================
import { supabaseAdmin } from "$lib/supabaseAdmin.js";

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get("email");

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      // 招待後にパスワード設定ページへリダイレクトする
      redirectTo: "https://thai-flashcard.vercel.app/auth/callback",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, email };
  },
};
