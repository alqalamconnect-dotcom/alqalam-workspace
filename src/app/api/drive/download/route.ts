import { NextRequest, NextResponse } from 'next/server';
import { getDrive } from '@/lib/google-drive';
import {
  assertDriveItemAccess,
  getAuthenticatedDriveUser,
  getErrorResponse,
} from '@/lib/drive-access';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const fileId = request.nextUrl.searchParams.get('fileId');
    if (!fileId) return NextResponse.json({ error: 'No fileId' }, { status: 400 });

    const drive = getDrive();
    await assertDriveItemAccess(user, drive, fileId, 'view');
    const [{ data: metadata }, response] = await Promise.all([
      drive.files.get({ fileId, fields: 'name,mimeType' }),
      drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }),
    ]);

    const { error: logError } = await user.supabase.from('activity_logs').insert({
      user_id: user.id,
      user_name: user.name,
      action_type: 'download',
      target_name: metadata.name || fileId,
      target_id: fileId,
      details: `Downloaded ${metadata.name || fileId}`,
    });
    if (logError) throw logError;

    const data = response.data as ArrayBuffer | Uint8Array | string | null;
    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : data instanceof Uint8Array
        ? data
        : Buffer.from(data ?? '');
    const filename = (metadata.name || 'download').replace(/["\r\n]/g, '_');
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
