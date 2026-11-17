import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedDriveUser,
  getErrorResponse,
} from '@/lib/drive-access';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const { data: members, error } = await user.supabase
      .from('profiles')
      .select('id,full_name,email')
      .eq('status', 'active')
      .neq('id', user.id)
      .order('full_name', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ members: members || [] });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
