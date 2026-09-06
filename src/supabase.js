import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

async function createAnonymousSession() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data?.user) throw new Error('anonymous session creation failed');
  return { user: data.user, configured: true };
}

export async function ensureAnonymousSession() {
  if (!supabase) return { user: null, configured: false };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  if (sessionData.session?.user) {
    // getSession() reads the browser's stored token. If a test anonymous user was
    // deleted from Supabase while that token remained in localStorage, the token
    // can look present locally but no longer represents a valid Auth user.
    // Validate it against the Auth server before using it for survey ownership.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError && userData?.user) {
      return { user: userData.user, configured: true };
    }

    // Clear only this browser's stale session, then create a fresh anonymous user.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Even if remote sign-out fails, continue and overwrite the local session
      // with a fresh anonymous sign-in below.
    }
  }

  return createAnonymousSession();
}
