import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRootFolderId, type getDrive } from '@/lib/google-drive';

type Drive = ReturnType<typeof getDrive>;
type AppSupabase = SupabaseClient;

interface DriveItemMetadata {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  parents?: string[] | null;
}

export interface AuthenticatedDriveUser {
  id: string;
  role: string;
  name: string;
  supabase: AppSupabase;
}

export interface DriveAccessControl {
  item_id: string;
  item_name: string;
  item_type: 'file' | 'folder';
  owner_id: string;
  parent_id: string | null;
  is_locked: boolean;
}

export interface DriveAccessRequest {
  id: string;
  item_id: string;
  requester_id: string;
  requester_name: string;
  requested_access: 'view' | 'edit';
  status: 'pending' | 'approved' | 'denied' | 'revoked';
  granted_access: 'view' | 'edit' | null;
  expires_at: string | null;
}

export class DriveAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'DriveAccessError';
  }
}

function isGoogleDriveNotFoundError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === 404) return true;
  if ('status' in error && error.status === 404) return true;
  return 'response' in error
    && typeof error.response === 'object'
    && error.response !== null
    && 'status' in error.response
    && error.response.status === 404;
}

export function getErrorResponse(error: unknown) {
  const status = error instanceof DriveAccessError ? error.status : 500;
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object'
      && error !== null
      && 'message' in error
      && typeof error.message === 'string'
      ? error.message
      : 'An unexpected error occurred';
  const code = error instanceof DriveAccessError ? error.code : undefined;
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export async function getAuthenticatedDriveUser(
  request: Request
): Promise<AuthenticatedDriveUser> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new DriveAccessError('Authentication required', 401);

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) {
    throw new DriveAccessError('Authentication required', 401);
  }

  const { data: profile, error: profileError } = await authClient
    .from('profiles')
    .select('role, status, full_name')
    .eq('id', userData.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile || profile.status !== 'active') {
    throw new DriveAccessError('An active account is required', 403);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new DriveAccessError('Server-side Supabase service role key is not configured.', 500);
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  return {
    id: userData.user.id,
    role: profile.role,
    name: profile.full_name || userData.user.email || 'Unknown',
    supabase,
  };
}

export async function getDriveItemPath(drive: Drive, itemId: string) {
  const path: { id: string; name: string; mimeType: string; parentId: string | null }[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined = itemId;

  while (currentId && path.length < 50) {
    if (seen.has(currentId)) throw new Error('Invalid folder hierarchy');
    seen.add(currentId);
    let response;
    try {
      response = await drive.files.get({
        fileId: currentId,
        fields: 'id,name,mimeType,parents',
      });
    } catch (error) {
      if (isGoogleDriveNotFoundError(error)) {
        throw new DriveAccessError(
          'This Drive item was deleted or is no longer available.',
          404,
          'DRIVE_ITEM_NOT_FOUND'
        );
      }
      throw error;
    }
    const data: DriveItemMetadata = response.data;
    path.push({
      id: data.id || currentId,
      name: data.name || currentId,
      mimeType: data.mimeType || 'application/octet-stream',
      parentId: data.parents?.[0] || null,
    });
    currentId = data.parents?.[0];
  }

  if (currentId) throw new Error('Folder hierarchy is too deep');
  const workspaceRootId = getRootFolderId();
  if (!workspaceRootId || !path.some((item) => item.id === workspaceRootId)) {
    throw new DriveAccessError('This Drive item is outside the configured workspace.', 403);
  }
  return path;
}

async function loadAccessRecords(
  supabase: AppSupabase,
  userId: string,
  itemIds: string[]
) {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) {
    return {
      controls: new Map<string, DriveAccessControl>(),
      owners: new Map<string, string>(),
      requests: new Map<string, DriveAccessRequest[]>(),
    };
  }

  const [controlResult, metadataResult, activityResult, requestResult] = await Promise.all([
    supabase
      .from('drive_item_access_controls')
      .select('item_id,item_name,item_type,owner_id,parent_id,is_locked')
      .in('item_id', ids),
    supabase
      .from('file_metadata')
      .select('drive_file_id,uploaded_by_id')
      .in('drive_file_id', ids),
    supabase
      .from('activity_logs')
      .select('target_id,user_id')
      .eq('action_type', 'create_folder')
      .in('target_id', ids)
      .order('created_at', { ascending: true }),
    supabase
      .from('drive_access_requests')
      .select('id,item_id,requester_id,requester_name,requested_access,status,granted_access,expires_at')
      .eq('requester_id', userId)
      .in('item_id', ids)
      .order('created_at', { ascending: false }),
  ]);
  if (controlResult.error) throw controlResult.error;
  if (metadataResult.error) throw metadataResult.error;
  if (activityResult.error) throw activityResult.error;
  if (requestResult.error) throw requestResult.error;

  const owners = new Map<string, string>();
  for (const record of metadataResult.data) {
    if (record.uploaded_by_id) {
      owners.set(record.drive_file_id, record.uploaded_by_id);
    }
  }
  for (const record of activityResult.data) {
    if (record.target_id && record.user_id && !owners.has(record.target_id)) {
      owners.set(record.target_id, record.user_id);
    }
  }

  return {
    controls: new Map(
      (controlResult.data as DriveAccessControl[]).map((record) => [record.item_id, record])
    ),
    owners,
    requests: requestResult.data.reduce((records, accessRequest) => {
      const requestRecord = accessRequest as DriveAccessRequest;
      const itemRequests = records.get(requestRecord.item_id) || [];
      itemRequests.push(requestRecord);
      records.set(requestRecord.item_id, itemRequests);
      return records;
    }, new Map<string, DriveAccessRequest[]>()),
  };
}

function getEffectiveAccessFromRecords(
  user: AuthenticatedDriveUser,
  path: { id: string }[],
  records: Awaited<ReturnType<typeof loadAccessRecords>>
) {
  if (user.role === 'admin') {
    return { level: 'edit' as const, blockedBy: null, limitedBy: null, isLocked: false };
  }

  let level: 'view' | 'edit' = 'edit';
  let limitedBy: DriveAccessControl | null = null;
  let isLocked = false;

  for (const item of path) {
    const control = records.controls.get(item.id);
    if (!control?.is_locked) continue;
    isLocked = true;
    if (control.owner_id === user.id || records.owners.get(item.id) === user.id) continue;

    const itemRequests = records.requests.get(item.id) || [];
    const approved = itemRequests.find((accessRequest) =>
      accessRequest.status === 'approved'
      && (!accessRequest.expires_at || Date.parse(accessRequest.expires_at) > Date.now())
    );
    if (!approved?.granted_access) {
      return {
        level: 'none' as const,
        blockedBy: control,
        limitedBy: null,
        isLocked: true,
        request: itemRequests.find((accessRequest) => accessRequest.status === 'pending') || null,
      };
    }
    if (approved.granted_access === 'view') {
      level = 'view';
      limitedBy = control;
    }
  }

  return { level, blockedBy: null, limitedBy, isLocked, request: null };
}

function getDirectAccessFromRecords(
  user: AuthenticatedDriveUser,
  items: { id: string; name: string; mimeType: string; parentId: string | null }[],
  records: Awaited<ReturnType<typeof loadAccessRecords>>
) {
  return items.map((item) => {
    const control = records.controls.get(item.id);
    const ownerId = control?.owner_id || records.owners.get(item.id);
    const itemRequests = records.requests.get(item.id) || [];
    const accessRequest = itemRequests[0] || null;
    const approvedRequest = itemRequests.find((entry) =>
      entry.status === 'approved'
      && (!entry.expires_at || Date.parse(entry.expires_at) > Date.now())
    );
    const isLocked = control?.is_locked || false;
    const isOwner = ownerId === user.id;
    return {
      isLocked,
      canManage: user.role === 'admin' || isOwner,
      canAccess: !isLocked || user.role === 'admin' || isOwner || !!approvedRequest,
      accessLevel: isLocked
        ? (user.role === 'admin' || isOwner ? 'edit' : approvedRequest?.granted_access || 'none')
        : 'edit',
      requestStatus: accessRequest?.status || null,
      requestAccess: accessRequest?.requested_access || null,
      itemType: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    };
  });
}

export async function getDrivePathAccess(
  user: AuthenticatedDriveUser,
  path: { id: string; name: string; mimeType: string; parentId: string | null }[]
) {
  const records = await loadAccessRecords(user.supabase, user.id, path.map((item) => item.id));
  return {
    effective: getEffectiveAccessFromRecords(user, path, records),
    direct: getDirectAccessFromRecords(user, path.slice(0, 1), records)[0],
  };
}

export async function getEffectiveDriveAccess(
  user: AuthenticatedDriveUser,
  path: { id: string }[]
) {
  const records = await loadAccessRecords(
    user.supabase,
    user.id,
    path.map((item) => item.id)
  );
  return getEffectiveAccessFromRecords(user, path, records);
}

export async function getDirectDriveAccess(
  user: AuthenticatedDriveUser,
  items: { id: string; name: string; mimeType: string; parentId: string | null }[]
) {
  const records = await loadAccessRecords(
    user.supabase,
    user.id,
    items.map((item) => item.id)
  );
  return getDirectAccessFromRecords(user, items, records);
}

export async function assertDriveItemAccess(
  user: AuthenticatedDriveUser,
  drive: Drive,
  itemId: string,
  required: 'view' | 'edit'
) {
  const path = await getDriveItemPath(drive, itemId);
  const access = await getEffectiveDriveAccess(user, path);
  if (access.level === 'none' || (required === 'edit' && access.level !== 'edit')) {
    throw new DriveAccessError(
      access.level === 'none'
        ? 'Access to this item is locked. Request access from its creator or an admin.'
        : 'This item is available for viewing only.',
      403
    );
  }
  return { path, access };
}

export async function upsertDriveItemControl(
  user: AuthenticatedDriveUser,
  item: { id: string; name: string; mimeType: string; parentId: string | null },
  isLocked: boolean
) {
  const itemType = item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file';
  const { data: existing, error: existingError } = await user.supabase
    .from('drive_item_access_controls')
    .select('owner_id')
    .eq('item_id', item.id)
    .maybeSingle();
  if (existingError) throw existingError;

  const { data: fileMetadata, error: metadataError } = existing
    ? { data: null, error: null }
    : await user.supabase
      .from('file_metadata')
      .select('uploaded_by_id')
      .eq('drive_file_id', item.id)
      .maybeSingle();
  if (metadataError) throw metadataError;

  const { error } = await user.supabase
    .from('drive_item_access_controls')
    .upsert({
      item_id: item.id,
      item_name: item.name,
      item_type: itemType,
      owner_id: existing?.owner_id || fileMetadata?.uploaded_by_id || user.id,
      parent_id: item.parentId,
      is_locked: isLocked,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function getActiveDriveMembers(
  user: AuthenticatedDriveUser,
  memberIds: string[]
) {
  const uniqueIds = [...new Set(memberIds)].filter((id) => id !== user.id);
  if (uniqueIds.length === 0) return [];

  const { data: members, error } = await user.supabase
    .from('profiles')
    .select('id,full_name,email')
    .eq('status', 'active')
    .in('id', uniqueIds);
  if (error) throw error;
  if ((members || []).length !== uniqueIds.length) {
    throw new DriveAccessError('One or more selected members are not active accounts.', 400);
  }
  return members || [];
}

export async function grantDriveItemAccess(
  user: AuthenticatedDriveUser,
  itemId: string,
  members: { id: string; full_name: string | null; email: string | null }[],
  access: 'view' | 'edit'
) {
  if (members.length === 0) return;
  const { error } = await user.supabase
    .from('drive_access_requests')
    .insert(members.map((member) => ({
      item_id: itemId,
      requester_id: member.id,
      requester_name: member.full_name || member.email || 'Member',
      requested_access: access,
      status: 'approved',
      granted_access: access,
      reviewed_by: user.id,
    })));
  if (error) throw error;
}
