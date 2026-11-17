import { NextRequest, NextResponse } from 'next/server';
import { getDrive } from '@/lib/google-drive';
import {
  DriveAccessError,
  getAuthenticatedDriveUser,
  getErrorResponse,
} from '@/lib/drive-access';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const trashQuery = user.role === 'admin'
      ? user.supabase
        .from('drive_trash_items')
        .select('item_id,operation_id,item_name,item_type,parent_id,is_root,deleted_by,deleted_at')
        .eq('is_root', true)
        .order('deleted_at', { ascending: false })
      : user.supabase
        .from('drive_trash_items')
        .select('item_id,operation_id,item_name,item_type,parent_id,is_root,deleted_by,deleted_at')
        .eq('is_root', true)
        .eq('deleted_by', user.id)
        .order('deleted_at', { ascending: false });
    const { data, error } = await trashQuery;
    if (error) throw error;

    return NextResponse.json({ items: data || [] });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    const body = await request.json() as { itemId?: unknown; operationId?: unknown };
    if (
      typeof body.itemId !== 'string'
      || !body.itemId
      || typeof body.operationId !== 'string'
      || !body.operationId
    ) {
      throw new DriveAccessError('A trash item is required.', 400);
    }

    const { data: root, error: rootError } = await user.supabase
      .from('drive_trash_items')
      .select('operation_id,deleted_by')
      .eq('item_id', body.itemId)
      .eq('operation_id', body.operationId)
      .eq('is_root', true)
      .maybeSingle();
    if (rootError) throw rootError;
    if (!root) throw new DriveAccessError('This trash item was not found.', 404);
    if (user.role !== 'admin' && root.deleted_by !== user.id) {
      throw new DriveAccessError('Only the user who deleted this item or an admin can restore it.', 403);
    }

    const { data: items, error: itemsError } = await user.supabase
      .from('drive_trash_items')
      .select('item_id')
      .eq('operation_id', root.operation_id);
    if (itemsError) throw itemsError;

    const drive = getDrive();
    for (const item of items || []) {
      await drive.files.update({
        fileId: item.item_id,
        requestBody: { trashed: false },
        fields: 'id,trashed',
      });
    }

    const { error: deleteError } = await user.supabase
      .from('drive_trash_items')
      .delete()
      .eq('operation_id', root.operation_id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedDriveUser(request);
    let body: { itemId?: unknown; operationId?: unknown };
    try {
      body = await request.json() as { itemId?: unknown; operationId?: unknown };
    } catch {
      throw new DriveAccessError('A valid Trash item is required.', 400);
    }

    if (
      typeof body.itemId !== 'string'
      || !body.itemId
      || typeof body.operationId !== 'string'
      || !body.operationId
    ) {
      throw new DriveAccessError('A Trash item is required.', 400);
    }

    const { data: root, error: rootError } = await user.supabase
      .from('drive_trash_items')
      .select('operation_id,deleted_by')
      .eq('item_id', body.itemId)
      .eq('operation_id', body.operationId)
      .eq('is_root', true)
      .maybeSingle();
    if (rootError) throw rootError;
    if (!root) throw new DriveAccessError('This Trash item was not found.', 404);
    if (user.role !== 'admin' && root.deleted_by !== user.id) {
      throw new DriveAccessError('Only the user who deleted this item or an admin can permanently delete it.', 403);
    }

    const { data: items, error: itemsError } = await user.supabase
      .from('drive_trash_items')
      .select('item_id,item_type,parent_id')
      .eq('operation_id', root.operation_id);
    if (itemsError) throw itemsError;

    const itemById = new Map((items || []).map((item) => [item.item_id, item]));
    const getDepth = (itemId: string) => {
      let depth = 0;
      let current = itemById.get(itemId);
      const visited = new Set<string>();
      while (current?.parent_id && itemById.has(current.parent_id) && !visited.has(current.parent_id)) {
        visited.add(current.parent_id);
        current = itemById.get(current.parent_id);
        depth++;
      }
      return depth;
    };
    const orderedItems = [...(items || [])].sort((a, b) => getDepth(b.item_id) - getDepth(a.item_id));
    const drive = getDrive();

    for (const item of orderedItems) {
      try {
        await drive.files.delete({ fileId: item.item_id });
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : null;
        if (status !== 404) throw error;
      }
    }

    const itemIds = orderedItems.map((item) => item.item_id);
    for (let index = 0; index < itemIds.length; index += 500) {
      const batch = itemIds.slice(index, index + 500);
      const { error: metadataError } = await user.supabase
        .from('file_metadata')
        .delete()
        .in('drive_file_id', batch);
      if (metadataError) throw metadataError;

      const { error: controlsError } = await user.supabase
        .from('drive_item_access_controls')
        .delete()
        .in('item_id', batch);
      if (controlsError) throw controlsError;
    }

    const { error: manifestError } = await user.supabase
      .from('drive_trash_items')
      .delete()
      .eq('operation_id', root.operation_id);
    if (manifestError) throw manifestError;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return getErrorResponse(error);
  }
}
