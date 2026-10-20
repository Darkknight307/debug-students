import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Сервер клиенті: service role кілті RLS-ті айналып өтеді.
 * ТЕК сервер кодында (route handler, server component) импорттаңыз —
 * бұл кілт браузерге ешқашан жетпеуі керек (NEXT_PUBLIC_ префиксі жоқ).
 */

let client: SupabaseClient | null = null;

export function isServerConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SESSION_SECRET);
}

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export type StudentRow = {
  id: string;
  auth_user_id: string;
  email: string;
  last_name: string;
  first_name: string;
  full_name: string; // «Тегі Аты» — рейтинг пен талдау осыны қолданады
  university: string;
  course: string | null;
  phone: string | null;
  first_login_at: string;
  last_login_at: string;
};
