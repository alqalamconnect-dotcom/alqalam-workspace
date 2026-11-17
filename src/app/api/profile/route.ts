import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PATCH(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: { fullName?: unknown };
  try {
    body = await request.json() as { fullName?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid JSON request is required.' }, { status: 400 });
  }
  if (typeof body.fullName !== 'string') {
    return NextResponse.json({ error: 'Enter a valid name.' }, { status: 400 });
  }

  const fullName = body.fullName.trim();
  if (fullName.length < 2 || fullName.length > 100) {
    return NextResponse.json({ error: 'Name must be between 2 and 100 characters.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server-side Supabase credentials are not configured.' }, { status: 500 });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await authClient
    .from('profiles')
    .select('status')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: 'Unable to verify your account.' }, { status: 500 });
  }
  if (profile?.status !== 'active') {
    return NextResponse.json({ error: 'An active account is required.' }, { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: updatedProfile, error: updateError } = await adminClient
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', userData.user.id)
    .select('full_name')
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: 'Could not update your name.' }, { status: 500 });
  }
  if (!updatedProfile) {
    return NextResponse.json({ error: 'Your profile could not be found.' }, { status: 404 });
  }

  return NextResponse.json({ fullName: updatedProfile.full_name });
}
