import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';
import {
  getAuthenticatedDriveUser,
  getDirectDriveAccess,
  getDriveItemPath,
  getDrivePathAccess,
  getErrorResponse,
} from '@/lib/drive-access';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const folderId = request.nextUrl.searchParams.get('folderId') || getRootFolderId();
    const drive = getDrive();
    const folderPath = await getDriveItemPath(drive, folderId);
    const [pathAccess, response] = await Promise.all([
      getDrivePathAccess(user, folderPath),
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, description, mimeType, size, createdTime, modifiedTime, webViewLink, parents)',
        orderBy: 'folder,name',
      }),
    ]);
    const folderAccess = pathAccess.effective;
    const folderControl = pathAccess.direct;
    if (folderAccess.level === 'none') {
      return NextResponse.json({
        error: 'Access to this folder is locked. Request access from its creator or an admin.',
        blockedBy: folderAccess.blockedBy,
        requestStatus: folderAccess.request?.status || null,
      }, { status: 403 });
    }

    const files = response.data.files || [];
    const items = files.flatMap((file) => file.id ? [{
      id: file.id,
      name: file.name || file.id,
      mimeType: file.mimeType || 'application/octet-stream',
      parentId: file.parents?.[0] || folderId,
    }] : []);
    const fileIds = files
      .filter((file) => file.id && file.mimeType !== 'application/vnd.google-apps.folder')
      .map((file) => file.id!);
    const [access, metadataResult] = await Promise.all([
      getDirectDriveAccess(user, items),
      fileIds.length
        ? user.supabase
          .from('file_metadata')
          .select('drive_file_id,uploaded_by_name')
          .in('drive_file_id', fileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (metadataResult.error) throw metadataResult.error;
    const uploaderNames = new Map(
      (metadataResult.data || []).map((metadata) => [
        metadata.drive_file_id,
        metadata.uploaded_by_name,
      ])
    );
    const accessById = new Map(items.map((item, index) => [item.id, access[index]]));

    return NextResponse.json({
      files: files.map((file) => ({
        ...file,
        ...(file.id ? accessById.get(file.id) : {}),
        ...(file.id && file.mimeType !== 'application/vnd.google-apps.folder'
          ? { uploadedBy: uploaderNames.get(file.id) || 'Unknown' }
          : {}),
      })),
      folderAccess: folderAccess.level,
      folderLocked: folderControl.isLocked,
      folderCanManage: folderControl.canManage,
    });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
