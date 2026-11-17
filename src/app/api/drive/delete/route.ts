import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDrive, getRootFolderId } from '@/lib/google-drive';
import {
  assertDriveItemAccess,
  getAuthenticatedDriveUser,
  getDirectDriveAccess,
  getErrorResponse,
} from '@/lib/drive-access';

interface DriveDescendant {
  id: string;
  name: string;
  mimeType: string;
  parentId: string;
}

async function getDescendants(
  drive: ReturnType<typeof getDrive>,
  folderId: string
): Promise<DriveDescendant[]> {
  const pendingFolders = [folderId];
  const visitedFolders = new Set<string>();
  const descendants: DriveDescendant[] = [];

  while (pendingFolders.length > 0) {
    const parentId = pendingFolders.pop()!;
    if (visitedFolders.has(parentId)) continue;
    visitedFolders.add(parentId);

    let pageToken: string | undefined;
    do {
      const { data } = await drive.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,parents)',
        pageSize: 1000,
        pageToken,
      });

      for (const item of data.files || []) {
        if (!item.id) continue;
        descendants.push({
          id: item.id,
          name: item.name || item.id,
          mimeType: item.mimeType || 'application/octet-stream',
          parentId: item.parents?.[0] || parentId,
        });
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          pendingFolders.push(item.id);
        }
      }

      pageToken = data.nextPageToken || undefined;
    } while (pageToken);
  }

  return descendants;
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const fileId = request.nextUrl.searchParams.get('fileId');
    if (!fileId) return NextResponse.json({ error: 'No fileId' }, { status: 400 });
    if (fileId === getRootFolderId()) {
      return NextResponse.json({ error: 'The workspace root folder cannot be deleted.' }, { status: 400 });
    }

    const drive = getDrive();
    await assertDriveItemAccess(user, drive, fileId, 'edit');
    const { data: file } = await drive.files.get({
      fileId,
      fields: 'name,mimeType,parents',
    });
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    if (isFolder) {
      const [access] = await getDirectDriveAccess(user, [{
        id: fileId,
        name: file.name || fileId,
        mimeType: file.mimeType || 'application/octet-stream',
        parentId: file.parents?.[0] || null,
      }]);
      if (!access.canManage) {
        return NextResponse.json(
          { error: 'Only the folder creator or an admin can delete this folder.' },
          { status: 403 }
        );
      }
    }

    const descendants = isFolder
      ? await getDescendants(drive, fileId)
      : [];

    const operationId = randomUUID();
    const itemsToTrash = new Map<string, {
      item_id: string;
      operation_id: string;
      item_name: string;
      item_type: 'folder' | 'file';
      parent_id: string | null;
      is_root: boolean;
      deleted_by: string;
    }>();
    itemsToTrash.set(fileId, {
      item_id: fileId,
      operation_id: operationId,
      item_name: file.name || fileId,
      item_type: isFolder ? 'folder' as const : 'file' as const,
      parent_id: file.parents?.[0] || null,
      is_root: true,
      deleted_by: user.id,
    });

    if (isFolder) {
      for (const descendant of descendants) {
        itemsToTrash.set(descendant.id, {
          item_id: descendant.id,
          operation_id: operationId,
          item_name: descendant.name,
          item_type: descendant.mimeType === 'application/vnd.google-apps.folder'
            ? 'folder'
            : 'file',
          parent_id: descendant.parentId,
          is_root: false,
          deleted_by: user.id,
        });
      }
    }

    const { error: manifestError } = await user.supabase
      .from('drive_trash_items')
      .insert([...itemsToTrash.values()]);
    if (manifestError) throw manifestError;

    try {
      for (const item of itemsToTrash.values()) {
        await drive.files.update({
          fileId: item.item_id,
          requestBody: { trashed: true },
          fields: 'id,trashed',
        });
      }
    } catch (error) {
      const restoreResults = await Promise.allSettled([...itemsToTrash.values()].map((item) =>
        drive.files.update({
          fileId: item.item_id,
          requestBody: { trashed: false },
          fields: 'id,trashed',
        })
      ));
      if (restoreResults.every((result) => result.status === 'fulfilled')) {
        const { error: cleanupError } = await user.supabase
          .from('drive_trash_items')
          .delete()
          .eq('operation_id', operationId);
        if (cleanupError) throw cleanupError;
      }
      throw error;
    }

    const { error: logError } = await user.supabase.from('activity_logs').insert({
      user_id: user.id,
      user_name: user.name,
      action_type: isFolder ? 'folder_delete' : 'delete',
      target_name: file.name || fileId,
      target_id: fileId,
      details: `Deleted ${isFolder ? 'folder' : 'file'} "${file.name || fileId}"`,
    });
    if (logError) throw logError;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
