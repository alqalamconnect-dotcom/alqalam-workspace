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
      drive.files.get({ fileId, fields: 'mimeType,name' }),
      drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }),
    ]);

    const data = response.data as ArrayBuffer | Uint8Array | string | null;
    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : data instanceof Uint8Array
        ? data
        : Buffer.from(data ?? '');
    const filename = metadata.name || 'preview';
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
