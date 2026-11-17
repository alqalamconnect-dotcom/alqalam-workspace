import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';
import { Readable } from 'node:stream';
import {
  assertDriveItemAccess,
  getActiveDriveMembers,
  getAuthenticatedDriveUser,
  getErrorResponse,
  grantDriveItemAccess,
  upsertDriveItemControl,
} from '@/lib/drive-access';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const formData = await request.formData();
    const file = formData.get('file');
    const folderId = String(formData.get('folderId') || getRootFolderId());
    const description = String(formData.get('description') || '').trim();
    const memberIdsValue = formData.get('authorizedMemberIds');
    let authorizedMemberIds: string[] = [];
    if (typeof memberIdsValue === 'string') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(memberIdsValue) as unknown;
      } catch {
        return NextResponse.json({ error: 'Choose valid authorized members.' }, { status: 400 });
      }
      if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string')) {
        return NextResponse.json({ error: 'Choose valid authorized members.' }, { status: 400 });
      }
      authorizedMemberIds = parsed;
    } else if (memberIdsValue !== null) {
      return NextResponse.json({ error: 'Choose valid authorized members.' }, { status: 400 });
    }
    const authorizedAccessValue = formData.get('authorizedAccess');
    if (authorizedAccessValue !== null && authorizedAccessValue !== 'view' && authorizedAccessValue !== 'edit') {
      return NextResponse.json({ error: 'Choose view or edit access for authorized members.' }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: 'File descriptions must be 2000 characters or fewer.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }

    const members = await getActiveDriveMembers(user, authorizedMemberIds);
    const authorizedAccess = authorizedAccessValue === 'edit' ? 'edit' : 'view';
    const drive = getDrive();
    if (folderId) await assertDriveItemAccess(user, drive, folderId, 'edit');

    const buffer = Buffer.from(await file.arrayBuffer());
    const readable = new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      },
    });
    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        description,
        parents: folderId ? [folderId] : undefined,
      },
      media: { mimeType: file.type || 'application/octet-stream', body: readable },
      fields: 'id, name, description, mimeType, size, parents',
    });

    if (response.data.id) {
      await upsertDriveItemControl(user, {
        id: response.data.id,
        name: response.data.name || file.name,
        mimeType: response.data.mimeType || file.type || 'application/octet-stream',
        parentId: folderId || null,
      }, members.length > 0);
      await grantDriveItemAccess(user, response.data.id, members, authorizedAccess);

      const { error: metadataError } = await user.supabase.from('file_metadata').insert({
        drive_file_id: response.data.id,
        file_name: file.name,
        uploaded_by_id: user.id,
        uploaded_by_name: user.name,
        folder_id: folderId || null,
      });
      if (metadataError) throw metadataError;

      const { error: logError } = await user.supabase.from('activity_logs').insert({
        user_id: user.id,
        user_name: user.name,
        action_type: 'upload',
        target_name: file.name,
        target_id: response.data.id,
        details: `Uploaded ${file.name}`,
      });
      if (logError) throw logError;
    }

    return NextResponse.json({ file: response.data });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
