import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type RegistrationStatus = 'pending' | 'active' | 'rejected' | 'blocked';

export async function PATCH(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json() as { id?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid JSON request is required.' }, { status: 400 });
  }

  const { id, status } = body;
  if (
    typeof id !== 'string'
    || !id
    || !['pending', 'active', 'rejected', 'blocked'].includes(status as string)
  ) {
    return NextResponse.json({ error: 'A profile ID and valid status are required.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server-side Supabase credentials are not configured.' },
      { status: 500 }
    );
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: adminProfile, error: profileError } = await authClient
    .from('profiles')
    .select('role,status')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 });
  }
  if (adminProfile?.role !== 'admin' || adminProfile.status !== 'active') {
    return NextResponse.json({ error: 'Active administrator access required.' }, { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (status !== 'active') {
    if (id === userData.user.id) {
      return NextResponse.json({ error: 'You cannot disable your own administrator account.' }, { status: 400 });
    }

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role,status')
      .eq('id', id)
      .maybeSingle();
    if (targetError) {
      return NextResponse.json({ error: 'Unable to find the account to update.' }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
    }

    if (target.role === 'admin' && target.status === 'active') {
      const { count, error: countError } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('status', 'active');
      if (countError) {
        return NextResponse.json({ error: 'Unable to verify active administrator accounts.' }, { status: 500 });
      }
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: 'The last active administrator account cannot be disabled.' }, { status: 400 });
      }
    }
  }

  const { data: updatedProfile, error: updateError } = await adminClient
    .from('profiles')
    .update({ status: status as RegistrationStatus })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: 'Could not update the registration status.' }, { status: 500 });
  }
  if (!updatedProfile) {
    return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = await request.json() as { id?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid JSON request is required.' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'A user ID is required.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server-side Supabase credentials are not configured.' },
      { status: 500 }
    );
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: adminProfile, error: profileError } = await authClient
    .from('profiles')
    .select('role,status')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 });
  }
  if (adminProfile?.role !== 'admin' || adminProfile.status !== 'active') {
    return NextResponse.json({ error: 'Active administrator access required.' }, { status: 403 });
  }
  if (body.id === userData.user.id) {
    return NextResponse.json({ error: 'You cannot delete your own administrator account.' }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: target, error: targetError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', body.id)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: 'Unable to find the account to delete.' }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  if (target.role === 'admin') {
    const { count, error: countError } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (countError) {
      return NextResponse.json({ error: 'Unable to verify administrator accounts.' }, { status: 500 });
    }
    if ((count || 0) <= 1) {
      return NextResponse.json({ error: 'The last administrator account cannot be deleted.' }, { status: 400 });
    }
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(body.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, driveFilesKept: true });
}
