import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';
import {
  assertDriveItemAccess,
  getActiveDriveMembers,
  getAuthenticatedDriveUser,
  getErrorResponse,
  grantDriveItemAccess,
  upsertDriveItemControl,
} from '@/lib/drive-access';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    let body: {
      name?: string;
      parentId?: string;
      description?: string;
      authorizedMemberIds?: string[];
      authorizedAccess?: 'view' | 'edit';
    };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: 'A valid JSON request is required.' }, { status: 400 });
    }
    if (
      !body
      || typeof body !== 'object'
      || typeof body.name !== 'string'
      || (body.description !== undefined && typeof body.description !== 'string')
      || (body.parentId !== undefined && typeof body.parentId !== 'string')
    ) {
      return NextResponse.json({ error: 'Provide a folder name and valid folder details.' }, { status: 400 });
    }
    const name = body.name.trim();
    const description = body.description?.trim() || '';
    const parentId = body.parentId || getRootFolderId();
    if (!name) return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    if (description.length > 2000) {
      return NextResponse.json({ error: 'Folder descriptions must be 2000 characters or fewer.' }, { status: 400 });
    }
    if (
      body.authorizedMemberIds !== undefined
      && (!Array.isArray(body.authorizedMemberIds)
        || body.authorizedMemberIds.some((id) => typeof id !== 'string'))
    ) {
      return NextResponse.json({ error: 'Choose valid authorized members.' }, { status: 400 });
    }
    if (body.authorizedAccess !== undefined && !['view', 'edit'].includes(body.authorizedAccess)) {
      return NextResponse.json({ error: 'Choose view or edit access for authorized members.' }, { status: 400 });
    }
    const members = await getActiveDriveMembers(user, body.authorizedMemberIds || []);
    const authorizedAccess = body.authorizedAccess || 'view';

    const drive = getDrive();
    if (parentId) await assertDriveItemAccess(user, drive, parentId, 'edit');

    const response = await drive.files.create({
      requestBody: {
        name,
        description,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id, name, description, mimeType, parents',
    });

    if (response.data.id) {
      await upsertDriveItemControl(user, {
        id: response.data.id,
        name: response.data.name || name,
        mimeType: response.data.mimeType || 'application/vnd.google-apps.folder',
        parentId: parentId || null,
      }, members.length > 0);
      await grantDriveItemAccess(user, response.data.id, members, authorizedAccess);

      const { error: logError } = await user.supabase.from('activity_logs').insert({
        user_id: user.id,
        user_name: user.name,
        action_type: 'create_folder',
        target_name: name,
        target_id: response.data.id,
        details: `Created folder "${name}"`,
      });
      if (logError) throw logError;
    }

    return NextResponse.json({ folder: response.data });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
