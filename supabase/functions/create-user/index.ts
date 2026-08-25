import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const token = authHeader.replace('Bearer ', '');
  const { data: caller, error: callerError } = await adminClient.auth.getUser(token);
  if (callerError || !caller.user) return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { data: callerProfile } = await adminClient.from('profiles').select('role').eq('id', caller.user.id).maybeSingle();
  if (!callerProfile || callerProfile.role !== 'admin') return new Response(JSON.stringify({ error: 'Administrator access is required.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const body = await request.json();
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'collector';
  if (!email || !name || password.length < 8) return new Response(JSON.stringify({ error: 'Email, name, and a password of at least 8 characters are required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) return new Response(JSON.stringify({ error: createError?.message || 'Auth user could not be created.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { error: profileError } = await adminClient.from('profiles').insert({ id: created.user.id, display_name: name, role });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true, id: created.user.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
