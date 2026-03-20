// ============================================================
// Supabase クライアントの初期化
// このファイルを import するだけで Supabase に接続できる
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";

// Supabase クライアントを作成してエクスポート
// 他のファイルから import { supabase } from '$lib/supabase.js' で使える
export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
