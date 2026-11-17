import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data } = await supabase
      .from('file_metadata')
      .select('drive_file_id, uploaded_by_name, created_at');

    return NextResponse.json({ metadata: data || [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
