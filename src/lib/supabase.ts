import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Falso quando o .env não foi preenchido: o app cai no modo local (somente navegador). */
export const supabaseAtivo = Boolean(url && key);
export const supabase = supabaseAtivo ? createClient(url!, key!) : null;
