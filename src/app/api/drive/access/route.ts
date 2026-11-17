import { NextRequest, NextResponse } from 'next/server';
import { getDrive } from '@/lib/google-drive';
import {
  DriveAccessError,
  getAuthenticatedDriveUser,
  getDirectDriveAccess,
  getDriveItemPath,
  getEffectiveDriveAccess,
  getErrorResponse,
  upsertDriveItemControl,
} from '@/lib/drive-access';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    let itemIds: string[] = [];

    if (user.role !== 'admin') {
      const { data: ownedItems, error: ownedItemsError } = await user.supabase
        .from('drive_item_access_controls')
        .select('item_id')
        .eq('owner_id', user.id);
      if (ownedItemsError) throw ownedItemsError;
      itemIds = (ownedItems || []).map((item) => item.item_id);
      if (itemIds.length === 0) return NextResponse.json({ requests: [] });
    }

    let query = user.supabase
      .from('drive_access_requests')
      .select('id,item_id,requester_id,requester_name,requested_access,status,granted_access,expires_at,created_at')
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true });

    if (user.role !== 'admin') query = query.in('item_id', itemIds);
    const { data: allRequests, error } = await query;
    if (error) throw error;
    const requestItemIds = [...new Set((allRequests || []).map((entry) => entry.item_id))];
    const { data: trashedItems, error: trashError } = requestItemIds.length
      ? await user.supabase
        .from('drive_trash_items')
        .select('item_id')
        .in('item_id', requestItemIds)
      : { data: [], error: null };
    if (trashError) throw trashError;
    const trashedItemIds = new Set((trashedItems || []).map((item) => item.item_id));
    const now = Date.now();
    const requests = (allRequests || []).filter((entry) =>
      !trashedItemIds.has(entry.item_id)
      && (
        entry.status === 'pending'
        || !entry.expires_at
        || Date.parse(entry.expires_at) > now
      )
    );

    const targetIds = [...new Set((requests || []).map((entry) => entry.item_id))];
    const { data: targets, error: targetsError } = targetIds.length
      ? await user.supabase
        .from('drive_item_access_controls')
        .select('item_id,item_name,item_type')
        .in('item_id', targetIds)
      : { data: [], error: null };
    if (targetsError) throw targetsError;

    const targetNames = new Map((targets || []).map((target) => [target.item_id, target]));
    return NextResponse.json({
      requests: (requests || []).map((entry) => ({
        ...entry,
        target: targetNames.get(entry.item_id) || null,
      })),
    });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const body = await request.json() as {
      action?: string;
      itemId?: string;
      requestedAccess?: string;
      requestId?: string;
      decision?: string;
      grantedAccess?: string;
      expiresInDays?: number;
      expiresAt?: string | null;
    };
    const drive = getDrive();

    if (body.action === 'lock' || body.action === 'unlock') {
      if (!body.itemId) throw new DriveAccessError('Item ID is required', 400);
      const path = await getDriveItemPath(drive, body.itemId);
      const item = path[0];
      const [access] = await getDirectDriveAccess(user, [{
        ...item,
        parentId: item.parentId,
      }]);
      if (!access.canManage) {
        throw new DriveAccessError('Only the item creator or an admin can change its lock.', 403);
      }

      if (body.action === 'lock' && item.parentId) {
        await (async () => {
          const parentAccess = await getEffectiveDriveAccess(
            user,
            await getDriveItemPath(drive, item.parentId!)
          );
          if (parentAccess.level !== 'edit') {
            throw new DriveAccessError('Edit access to the parent folder is required to lock this item.', 403);
          }
        })();
      }
      await upsertDriveItemControl(user, item, body.action === 'lock');
      return NextResponse.json({ success: true, isLocked: body.action === 'lock' });
    }

    if (body.action === 'request') {
      if (!body.itemId || (body.requestedAccess !== 'view' && body.requestedAccess !== 'edit')) {
        throw new DriveAccessError('Choose an item and request either view or edit access.', 400);
      }
      const path = await getDriveItemPath(drive, body.itemId);
      const currentAccess = await getEffectiveDriveAccess(user, path);
      const requestedAccess = body.requestedAccess;
      const target = currentAccess.blockedBy
        || (requestedAccess === 'edit' && currentAccess.level === 'view'
          ? currentAccess.limitedBy
          : null);

      if (!target) {
        throw new DriveAccessError('This item does not require an access request.', 409);
      }
      if (target.owner_id === user.id || user.role === 'admin') {
        throw new DriveAccessError('You already own or administer this item.', 409);
      }

      const { data: existingPending, error: pendingError } = await user.supabase
        .from('drive_access_requests')
        .select('id')
        .eq('item_id', target.item_id)
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (pendingError) throw pendingError;
      if (existingPending) {
        return NextResponse.json({ success: true, status: 'pending' });
      }

      const { error } = await user.supabase
        .from('drive_access_requests')
        .insert({
          item_id: target.item_id,
          requester_id: user.id,
          requester_name: user.name,
          requested_access: requestedAccess,
          status: 'pending',
        });
      if (error) throw error;
      return NextResponse.json({ success: true, status: 'pending' });
    }

    if (body.action === 'decide') {
      if (!body.requestId || !['approve', 'deny'].includes(body.decision || '')) {
        throw new DriveAccessError('A request and decision are required.', 400);
      }
      if (body.decision === 'approve' && !['view', 'edit'].includes(body.grantedAccess || '')) {
        throw new DriveAccessError('Choose view or edit access to approve.', 400);
      }

      const { data: accessRequest, error: requestError } = await user.supabase
        .from('drive_access_requests')
        .select('id,item_id,status')
        .eq('id', body.requestId)
        .single();
      if (requestError || !accessRequest) {
        throw new DriveAccessError('Access request not found or you cannot manage it.', 404);
      }
      if (accessRequest.status !== 'pending') {
        throw new DriveAccessError('This access request has already been reviewed.', 409);
      }

      const { data: control, error: controlError } = await user.supabase
        .from('drive_item_access_controls')
        .select('owner_id')
        .eq('item_id', accessRequest.item_id)
        .single();
      if (controlError) throw controlError;
      if (user.role !== 'admin' && control.owner_id !== user.id) {
        throw new DriveAccessError('Only the item creator or an admin can review requests.', 403);
      }

      const approved = body.decision === 'approve';
      let expiresAt: string | null = null;
      if (approved && body.expiresInDays !== undefined) {
        if (body.expiresInDays !== 15 && body.expiresInDays !== 30) {
          throw new DriveAccessError('Choose a valid access duration.', 400);
        }
        expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
      } else if (approved && body.expiresAt !== undefined && body.expiresAt !== null) {
        const parsedExpiry = Date.parse(body.expiresAt);
        if (!Number.isFinite(parsedExpiry) || parsedExpiry <= Date.now()) {
          throw new DriveAccessError('Choose a future access expiration date and time.', 400);
        }
        expiresAt = new Date(parsedExpiry).toISOString();
      }
      const { error } = await user.supabase
        .from('drive_access_requests')
        .update({
          status: approved ? 'approved' : 'denied',
          granted_access: approved ? body.grantedAccess : null,
          expires_at: approved ? expiresAt : null,
          reviewed_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accessRequest.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.action === 'revoke') {
      if (!body.requestId) {
        throw new DriveAccessError('An access grant is required.', 400);
      }

      const { data: accessRequest, error: requestError } = await user.supabase
        .from('drive_access_requests')
        .select('id,item_id,status')
        .eq('id', body.requestId)
        .single();
      if (requestError || !accessRequest) {
        throw new DriveAccessError('Access grant not found.', 404);
      }
      if (accessRequest.status !== 'approved') {
        throw new DriveAccessError('This access grant is no longer active.', 409);
      }

      const { data: control, error: controlError } = await user.supabase
        .from('drive_item_access_controls')
        .select('owner_id')
        .eq('item_id', accessRequest.item_id)
        .single();
      if (controlError) throw controlError;
      if (user.role !== 'admin' && control.owner_id !== user.id) {
        throw new DriveAccessError('Only the item creator or an admin can revoke access.', 403);
      }

      const { error } = await user.supabase
        .from('drive_access_requests')
        .update({
          status: 'revoked',
          granted_access: null,
          expires_at: null,
          reviewed_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accessRequest.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    throw new DriveAccessError('Unknown access action.', 400);
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
