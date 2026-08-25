/* Public browser client. The publishable key is intended for frontend use. */
(function () {
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase client library is not loaded.');
    return;
  }

  window.eacSupabase = window.supabase.createClient(
    'https://wyeuvlcfdgwvzynlktyh.supabase.co',
    'sb_publishable_m4oCLeboGoYRG_0vAD9VMQ_Ck0ov3R2'
  );
})();
