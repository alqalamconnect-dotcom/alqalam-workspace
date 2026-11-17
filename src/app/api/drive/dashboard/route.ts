import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';
import {
  getAuthenticatedDriveUser,
  getErrorResponse,
} from '@/lib/drive-access';

interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  mimeType: string;
  parentId: string | null;
}

interface DashboardItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  relationship: 'Owned by you' | 'Shared with you' | 'In your workspace';
}

interface DashboardActivity {
  id: string;
  user_name: string;
  action_type: string;
  target_name: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

const itemBatches = <T>(items: T[], size = 500) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );

async function getCurrentWorkspaceFiles(
  drive: ReturnType<typeof getDrive>,
  rootFolderId: string
) {
  const pendingFolders = [rootFolderId];
  const queuedFolders = new Set<string>(pendingFolders);
  const currentFiles: DriveFile[] = [];
  let nextFolderIndex = 0;

  const readFolders = async () => {
    while (nextFolderIndex < pendingFolders.length) {
      const folderId = pendingFolders[nextFolderIndex++];
      let pageToken: string | undefined;
      do {
        const escapedFolderId = folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const { data } = await drive.files.list({
          q: `'${escapedFolderId}' in parents and trashed = false`,
          fields: 'nextPageToken,files(id,name,mimeType,createdTime,parents)',
          pageSize: 1000,
          pageToken,
        });

        for (const file of data.files || []) {
          if (!file.id) continue;
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            if (!queuedFolders.has(file.id)) {
              queuedFolders.add(file.id);
              pendingFolders.push(file.id);
            }
          }
          currentFiles.push({
            id: file.id,
            name: file.name || file.id,
            createdTime: file.createdTime || '',
            mimeType: file.mimeType || 'application/octet-stream',
            parentId: file.parents?.[0] || folderId,
          });
        }

        pageToken = data.nextPageToken || undefined;
      } while (pageToken);
    }
  };

  await Promise.all(Array.from({ length: 6 }, () => readFolders()));

  return currentFiles;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const rootFolderId = getRootFolderId();
    if (!rootFolderId) {
      return NextResponse.json(
        { error: 'The workspace Drive folder is not configured.' },
        { status: 500 }
      );
    }

    const files = await getCurrentWorkspaceFiles(getDrive(), rootFolderId);
    files.sort((a, b) => b.createdTime.localeCompare(a.createdTime));

    let scopedFiles = files;
    let scopedFolders = files.filter((item) =>
      item.mimeType === 'application/vnd.google-apps.folder'
    );
    let dashboardItems: DashboardItem[] = files.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
      relationship: 'In your workspace',
    }));
    let dashboardCollaborators: { id: string; name: string; email: string; items: string[] }[] = [];
    let activities = 0;
    let members = 0;
    let dashboardActivities: DashboardActivity[] = [];

    if (user.role !== 'admin') {
      const now = new Date().toISOString();
      const [ownedControls, ownedMetadata, authoredFolders, grants] = await Promise.all([
        user.supabase
          .from('drive_item_access_controls')
          .select('item_id')
          .eq('owner_id', user.id),
        user.supabase
          .from('file_metadata')
          .select('drive_file_id')
          .eq('uploaded_by_id', user.id),
        user.supabase
          .from('activity_logs')
          .select('target_id')
          .eq('user_id', user.id)
          .eq('action_type', 'create_folder'),
        user.supabase
          .from('drive_access_requests')
          .select('item_id')
          .eq('requester_id', user.id)
          .eq('status', 'approved')
          .or(`expires_at.is.null,expires_at.gt.${now}`),
      ]);
      if (ownedControls.error) throw ownedControls.error;
      if (ownedMetadata.error) throw ownedMetadata.error;
      if (authoredFolders.error) throw authoredFolders.error;
      if (grants.error) throw grants.error;

      const fileById = new Map(files.map((file) => [file.id, file]));
      const directlyAuthorizedIds = new Set([
        ...(ownedControls.data || []).map((item) => item.item_id),
        ...(ownedMetadata.data || []).map((item) => item.drive_file_id),
        ...(authoredFolders.data || []).flatMap((item) => item.target_id ? [item.target_id] : []),
        ...(grants.data || []).map((item) => item.item_id),
      ]);
      const ownedIds = new Set([
        ...(ownedControls.data || []).map((item) => item.item_id),
        ...(ownedMetadata.data || []).map((item) => item.drive_file_id),
        ...(authoredFolders.data || []).flatMap((item) => item.target_id ? [item.target_id] : []),
      ]);
      const authorizedFolderIds = new Set(
        [...directlyAuthorizedIds].filter((id) =>
          fileById.get(id)?.mimeType === 'application/vnd.google-apps.folder'
        )
      );
      const scopedItems = files.filter((item) => {
        let parentId = item.parentId;
        const visited = new Set<string>();
        while (parentId && !visited.has(parentId)) {
          if (authorizedFolderIds.has(parentId)) return true;
          visited.add(parentId);
          parentId = fileById.get(parentId)?.parentId || null;
        }
        return directlyAuthorizedIds.has(item.id);
      });
      const scopedIds = [...new Set(scopedItems.map((item) => item.id))];
      scopedFiles = scopedItems.filter((item) => item.mimeType !== 'application/vnd.google-apps.folder');
      scopedFolders = scopedItems.filter((item) =>
        item.mimeType === 'application/vnd.google-apps.folder'
      );
      dashboardItems = scopedItems.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
        relationship: ownedIds.has(item.id) ? 'Owned by you' : 'Shared with you',
      }));

      const accessRequestBatches = itemBatches(scopedIds);
      const [activityCounts, collaboratorRows, itemOwners] = await Promise.all([
        Promise.all(accessRequestBatches.map(async (ids) => {
          const { count, error } = await user.supabase
            .from('activity_logs')
            .select('target_id', { count: 'exact', head: true })
            .in('target_id', ids);
          if (error) throw error;
          return count || 0;
        })),
        Promise.all(accessRequestBatches.map(async (ids) => {
          const { data, error } = await user.supabase
            .from('drive_access_requests')
            .select('item_id,requester_id')
            .in('item_id', ids)
            .eq('status', 'approved')
            .or(`expires_at.is.null,expires_at.gt.${now}`);
          if (error) throw error;
          return data || [];
        })),
        Promise.all(accessRequestBatches.map(async (ids) => {
          const { data, error } = await user.supabase
            .from('drive_item_access_controls')
            .select('item_id,owner_id')
            .in('item_id', ids);
          if (error) throw error;
          return data || [];
        })),
      ]);
      activities = activityCounts.reduce((total, count) => total + count, 0);

      members = new Set(
        [
          ...collaboratorRows.flatMap((rows) => rows.map((row) => row.requester_id)),
          ...itemOwners.flatMap((rows) => rows.map((row) => row.owner_id)),
        ]
          .filter((memberId) => memberId !== user.id)
      ).size;

      const collaboratorIds = [...new Set([
        ...collaboratorRows.flatMap((rows) => rows.map((row) => row.requester_id)),
        ...itemOwners.flatMap((rows) => rows.map((row) => row.owner_id)),
      ])].filter((memberId) => memberId !== user.id);
      if (collaboratorIds.length > 0) {
        const [profilesResult, controlsResult, metadataResult] = await Promise.all([
          user.supabase
            .from('profiles')
            .select('id,full_name,email')
            .eq('status', 'active')
            .in('id', collaboratorIds),
          user.supabase
            .from('drive_item_access_controls')
            .select('item_id,owner_id')
            .in('item_id', scopedIds),
          user.supabase
            .from('file_metadata')
            .select('drive_file_id,uploaded_by_id')
            .in('drive_file_id', scopedIds),
        ]);
        if (profilesResult.error) throw profilesResult.error;
        if (controlsResult.error) throw controlsResult.error;
        if (metadataResult.error) throw metadataResult.error;

        const itemNames = new Map(scopedItems.map((item) => [item.id, item.name]));
        const namesByMember = new Map<string, Set<string>>();
        const addMemberItem = (memberId: string, itemId: string) => {
          if (memberId === user.id) return;
          const names = namesByMember.get(memberId) || new Set<string>();
          const itemName = itemNames.get(itemId);
          if (itemName) names.add(itemName);
          namesByMember.set(memberId, names);
        };
        for (const grant of collaboratorRows.flat()) {
          addMemberItem(grant.requester_id, grant.item_id);
        }
        for (const control of controlsResult.data || []) {
          addMemberItem(control.owner_id, control.item_id);
        }
        for (const metadata of metadataResult.data || []) {
          if (metadata.uploaded_by_id) addMemberItem(metadata.uploaded_by_id, metadata.drive_file_id);
        }
        dashboardCollaborators = (profilesResult.data || []).map((member) => ({
          id: member.id,
          name: member.full_name || member.email || 'Member',
          email: member.email || '',
          items: [...(namesByMember.get(member.id) || [])],
        }));
      }
    }

    const uploaderNames = new Map<string, string>();
    for (const ids of itemBatches(scopedFiles.map((file) => file.id))) {
      const { data: metadata, error: metadataError } = await user.supabase
        .from('file_metadata')
        .select('drive_file_id,uploaded_by_name')
        .in('drive_file_id', ids);
      if (metadataError) throw metadataError;
      for (const entry of metadata || []) {
        uploaderNames.set(entry.drive_file_id, entry.uploaded_by_name);
      }
    }

    if (user.role === 'admin') {
      const [{ count: activityCount, error: activityError }, { count: memberCount, error: memberError }] =
        await Promise.all([
          user.supabase.from('activity_logs').select('target_id', { count: 'exact', head: true }),
          user.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        ]);
      if (activityError) throw activityError;
      if (memberError) throw memberError;
      activities = activityCount || 0;
      members = memberCount || 0;
    }

    const activityItemIds = user.role === 'admin'
      ? files.map((item) => item.id)
      : dashboardItems.map((item) => item.id);
    const activityRows = await Promise.all(itemBatches(activityItemIds).map(async (ids) => {
      const { data, error } = await user.supabase
        .from('activity_logs')
        .select('id,user_name,action_type,target_name,target_id,details,created_at')
        .in('target_id', ids)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as DashboardActivity[];
    }));
    dashboardActivities = activityRows.flat()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50);

    return NextResponse.json({
      fileCount: scopedFiles.length,
      folderCount: scopedFolders.length,
      activities,
      members,
      isAdmin: user.role === 'admin',
      items: dashboardItems,
      collaborators: dashboardCollaborators,
      activityDetails: dashboardActivities,
      recentFiles: scopedFiles.slice(0, 5).map((file) => ({
        id: file.id,
        file_name: file.name,
        created_at: file.createdTime,
        uploaded_by_name: uploaderNames.get(file.id),
      })),
    });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
