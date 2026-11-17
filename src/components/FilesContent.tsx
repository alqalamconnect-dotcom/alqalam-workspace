'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  Upload,
  Download,
  Trash2,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  File,
  FolderPlus,
  FolderOpen,
  ArrowLeft,
  Search,
  Grid2X2,
  List,
  Eye,
  X,
  Loader2,
  AlertCircle,
  LockKeyhole,
  LockKeyholeOpen,
  KeyRound,
  MoreVertical,
  Trash,
} from 'lucide-react';

interface DriveAccessInfo {
  isLocked?: boolean;
  canManage?: boolean;
  canAccess?: boolean;
  accessLevel?: 'none' | 'view' | 'edit';
  requestStatus?: 'pending' | 'approved' | 'denied' | null;
  requestAccess?: 'view' | 'edit' | null;
}

interface DriveFile {
  id: string;
  name: string;
  description?: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  uploadedBy?: string;
  isLocked?: boolean;
  canManage?: boolean;
  canAccess?: boolean;
  accessLevel?: 'none' | 'view' | 'edit';
  requestStatus?: 'pending' | 'approved' | 'denied' | null;
  requestAccess?: 'view' | 'edit' | null;
}

interface DriveFolder extends DriveAccessInfo {
  id: string;
  name: string;
  description?: string;
}

interface DriveMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

function AuthorizedMembersField({
  members,
  selectedIds,
  onChange,
  access,
  onAccessChange,
}: {
  members: DriveMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  access: 'view' | 'edit';
  onAccessChange: (access: 'view' | 'edit') => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <label style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
        Authorized members
      </label>
      <select
        value={access}
        onChange={(event) => onAccessChange(event.target.value as 'view' | 'edit')}
        aria-label="Access level for authorized members"
        style={{ padding: '9px 10px', border: '1px solid #e8ddd0', borderRadius: '8px', background: '#fffdf9', color: '#1a1a1a' }}
      >
        <option value="view">View access</option>
        <option value="edit">Edit access</option>
      </select>
      <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #e8ddd0', borderRadius: '8px', padding: '8px' }}>
        {members.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#8a7968' }}>No other active members found.</p>
        ) : members.map((member) => (
          <label key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 2px', fontSize: '12px', color: '#1a1a1a', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedIds.includes(member.id)}
              onChange={(event) => onChange(
                event.target.checked
                  ? [...selectedIds, member.id]
                  : selectedIds.filter((id) => id !== member.id)
              )}
            />
            <span>{member.full_name || member.email || 'Member'}{member.full_name && member.email ? ` (${member.email})` : ''}</span>
          </label>
        ))}
      </div>
      <p style={{ fontSize: '11px', color: '#8a7968' }}>
        Selecting members restricts this item to its creator, admins, and those members.
      </p>
    </div>
  );
}

interface AccessRequest {
  id: string;
  item_id: string;
  requester_id: string;
  requester_name: string;
  requested_access: 'view' | 'edit';
  status: 'pending' | 'approved';
  granted_access: 'view' | 'edit' | null;
  expires_at: string | null;
  target: { item_name: string; item_type: 'file' | 'folder' } | null;
}

interface TrashEntry {
  item_id: string;
  operation_id: string;
  item_name: string;
  item_type: 'file' | 'folder';
  deleted_at: string;
}

async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session has expired. Please sign in again.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers });
}

export default function FilesContent() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInProgressRef = useRef(false);
  const folderCreationInProgressRef = useRef(false);
  const deleteInProgressRef = useRef(false);
  const loadFilesRequestId = useRef(0);
  const hasLoadedFolderRef = useRef(false);
  const deletedFolderNoticeRef = useRef(false);
  const membersLoadedRef = useRef(false);
  const membersLoadRequestRef = useRef<Promise<void> | null>(null);

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'tiles' | 'rows'>('rows');
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [role, setRole] = useState('member');
  const [currentFolderAccess, setCurrentFolderAccess] = useState<'view' | 'edit'>('edit');
  const [currentFolderLocked, setCurrentFolderLocked] = useState(false);
  const [currentFolderCanManage, setCurrentFolderCanManage] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [search, setSearch] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [newFolderAuthorizedMembers, setNewFolderAuthorizedMembers] = useState<string[]>([]);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadAuthorizedMembers, setUploadAuthorizedMembers] = useState<string[]>([]);
  const [authorizedAccess, setAuthorizedAccess] = useState<'view' | 'edit'>('view');
  const [members, setMembers] = useState<DriveMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [openItemMenuId, setOpenItemMenuId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState('');
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<TrashEntry | null>(null);
  const [lockProcessingId, setLockProcessingId] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [accessProcessingKey, setAccessProcessingKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
    isFolder: boolean;
  } | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [showAccessRequests, setShowAccessRequests] = useState(false);
  const [grantDuration, setGrantDuration] = useState<'permanent' | '15' | '30' | 'custom'>('permanent');
  const [customGrantExpiry, setCustomGrantExpiry] = useState('');
  const [requestTarget, setRequestTarget] = useState<{
    id: string;
    name: string;
    requestedAccess: 'view' | 'edit';
  } | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.push('/login');
        return;
      }
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (profileData) setRole(profileData.role);
    };
    init();
  }, [router]);

  useEffect(() => {
    if (!openItemMenuId) return;

    const closeMenuOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Element
        && !event.target.closest('[data-item-menu]')
      ) {
        setOpenItemMenuId(null);
      }
    };

    document.addEventListener('click', closeMenuOnOutsideClick);
    return () => document.removeEventListener('click', closeMenuOnOutsideClick);
  }, [openItemMenuId]);

  const beginFolderNavigation = () => {
    loadFilesRequestId.current += 1;
    hasLoadedFolderRef.current = false;
    setLoading(true);
  };

  const recoverFromMissingFolder = useCallback(() => {
    if (!currentFolder) return false;
    beginFolderNavigation();
    deletedFolderNoticeRef.current = true;
    const availableParents = folderStack.slice(0, -1);
    setFolderStack(availableParents);
    setCurrentFolder(availableParents.at(-1)?.id || null);
    return true;
  }, [currentFolder, folderStack]);

  const loadFiles = useCallback(async () => {
    const requestId = ++loadFilesRequestId.current;
    if (!hasLoadedFolderRef.current) setLoading(true);
    setFilesError('');
    try {
      const folderId = currentFolder || '';
      const res = await authenticatedFetch(
        `/api/drive/list?folderId=${encodeURIComponent(folderId)}`
      );
      const data = await res.json() as {
        files?: DriveFile[];
        folderAccess?: string;
        folderLocked?: boolean;
        folderCanManage?: boolean;
        error?: string;
        code?: string;
      };
      if (data.code === 'DRIVE_ITEM_NOT_FOUND' && currentFolder) {
        if (requestId !== loadFilesRequestId.current) return;
        recoverFromMissingFolder();
        return;
      }
      if (data.code === 'DRIVE_ITEM_NOT_FOUND') {
        throw new Error(
          'The configured workspace folder is missing from Google Drive. Restore it or update GOOGLE_DRIVE_FOLDER_ID before continuing.'
        );
      }
      if (!res.ok) throw new Error(data.error || 'Unable to load files.');
      if (requestId !== loadFilesRequestId.current) return;
      if (data.files) {
        const folderItems = data.files.filter(
          (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder'
        ) as DriveFolder[];
        const fileItems = data.files.filter(
          (f: DriveFile) => f.mimeType !== 'application/vnd.google-apps.folder'
        ) as DriveFile[];

        setFolders(folderItems);
        setFiles(fileItems);
      }
      setCurrentFolderAccess(data.folderAccess === 'view' ? 'view' : 'edit');
      setCurrentFolderLocked(Boolean(data.folderLocked));
      setCurrentFolderCanManage(Boolean(data.folderCanManage));
      hasLoadedFolderRef.current = true;
      if (deletedFolderNoticeRef.current) {
        setFilesError('This folder is no longer available in Google Drive. Showing its parent folder.');
        deletedFolderNoticeRef.current = false;
      }
    } catch (e) {
      if (requestId === loadFilesRequestId.current) {
        setFilesError(e instanceof Error ? e.message : 'Unable to load files.');
      }
    } finally {
      if (requestId === loadFilesRequestId.current) setLoading(false);
    }
  }, [currentFolder, recoverFromMissingFolder]);

  const loadAccessRequests = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/drive/access');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load access requests.');
      setAccessRequests(data.requests || []);
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Unable to load access requests.');
    }
  }, []);

  const loadMembers = useCallback(async () => {
    if (membersLoadedRef.current) return;
    if (membersLoadRequestRef.current) return membersLoadRequestRef.current;

    const request = (async () => {
      setMembersLoading(true);
      try {
        const response = await authenticatedFetch('/api/drive/members');
        const data = await response.json() as { members?: DriveMember[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load active members.');
        setMembers(data.members || []);
        membersLoadedRef.current = true;
      } catch (error) {
        setFilesError(error instanceof Error ? error.message : 'Unable to load active members.');
      } finally {
        setMembersLoading(false);
      }
    })();
    membersLoadRequestRef.current = request;
    try {
      await request;
    } finally {
      membersLoadRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccessRequests();
  }, [loadAccessRequests]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFiles();
  }, [loadFiles]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadDescription('');
    setUploadAuthorizedMembers([]);
    setAuthorizedAccess('view');
    setSelectedUploadFile(file);
    void loadMembers();
  };

  const submitUpload = async () => {
    const file = selectedUploadFile;
    if (!file || uploadInProgressRef.current) return;
    uploadInProgressRef.current = true;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (currentFolder) formData.append('folderId', currentFolder);
      formData.append('description', uploadDescription);
      formData.append('authorizedMemberIds', JSON.stringify(uploadAuthorizedMembers));
      formData.append('authorizedAccess', authorizedAccess);
      const response = await authenticatedFetch('/api/drive/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      setSelectedUploadFile(null);
      await Promise.all([loadFiles(), loadAccessRequests()]);
    } catch (e) {
      setFilesError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      uploadInProgressRef.current = false;
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (
    fileId: string,
    fileName: string
  ) => {
    if (downloadingFileId) return;
    setDownloadingFileId(fileId);
    try {
      const res = await authenticatedFetch(
        `/api/drive/download?fileId=${encodeURIComponent(fileId)}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Download failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Download failed.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (deleteInProgressRef.current) return;
    deleteInProgressRef.current = true;
    setDeletingItemId(fileId);
    try {
      const response = await authenticatedFetch(
        `/api/drive/delete?fileId=${encodeURIComponent(fileId)}`,
        { method: 'DELETE' }
      );
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not move item to Trash.');
      setDeleteConfirm(null);
      await Promise.all([loadFiles(), loadAccessRequests()]);
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Could not move item to Trash.');
    } finally {
      deleteInProgressRef.current = false;
      setDeletingItemId(null);
    }
  };

  const loadTrash = async () => {
    setTrashLoading(true);
    setTrashError('');
    try {
      const response = await authenticatedFetch('/api/drive/trash');
      const data = await response.json() as { items?: TrashEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load Trash.');
      setTrashItems(data.items || []);
    } catch (error) {
      setTrashError(error instanceof Error ? error.message : 'Unable to load Trash.');
    } finally {
      setTrashLoading(false);
    }
  };

  const restoreTrashItem = async (item: TrashEntry) => {
    setRestoringItemId(item.item_id);
    setTrashError('');
    try {
      const response = await authenticatedFetch('/api/drive/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.item_id, operationId: item.operation_id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to restore this item.');
      setTrashItems((current) => current.filter((entry) => entry.item_id !== item.item_id));
      await Promise.all([loadFiles(), loadAccessRequests()]);
    } catch (error) {
      setTrashError(error instanceof Error ? error.message : 'Unable to restore this item.');
    } finally {
      setRestoringItemId(null);
    }
  };

  const permanentlyDeleteTrashItem = async (item: TrashEntry) => {
    setRestoringItemId(item.item_id);
    setTrashError('');
    try {
      const response = await authenticatedFetch('/api/drive/trash', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.item_id, operationId: item.operation_id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to permanently delete this item.');
      setPermanentDeleteConfirm(null);
      setTrashItems((current) => current.filter((entry) => entry.operation_id !== item.operation_id));
      await loadAccessRequests();
    } catch (error) {
      setTrashError(error instanceof Error
        ? error.message
        : 'Unable to permanently delete this item.');
    } finally {
      setRestoringItemId(null);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || folderCreationInProgressRef.current) return;
    folderCreationInProgressRef.current = true;
    setCreatingFolder(true);
    setFilesError('');
    try {
      const response = await authenticatedFetch('/api/drive/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: newFolderDescription,
          parentId: currentFolder || undefined,
          authorizedMemberIds: newFolderAuthorizedMembers,
          authorizedAccess,
        }),
      });
      const data = await response.json() as { error?: string; code?: string };
      if (data.code === 'DRIVE_ITEM_NOT_FOUND') {
        if (recoverFromMissingFolder()) return;
        setFilesError(
          'The configured workspace folder is missing from Google Drive. Restore it or update GOOGLE_DRIVE_FOLDER_ID before creating folders.'
        );
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Could not create folder.');

      setNewFolderName('');
      setNewFolderDescription('');
      setNewFolderAuthorizedMembers([]);
      setShowNewFolder(false);
      await Promise.all([loadFiles(), loadAccessRequests()]);
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Could not create folder.');
    } finally {
      folderCreationInProgressRef.current = false;
      setCreatingFolder(false);
    }
  };

  const openFolder = (folder: DriveFolder) => {
    beginFolderNavigation();
    setFolderStack((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.id === folder.id);
      return existingIndex === -1
        ? [...prev, { id: folder.id, name: folder.name }]
        : prev.slice(0, existingIndex + 1);
    });
    setCurrentFolder(folder.id);
  };

  const goBack = () => {
    beginFolderNavigation();
    setFolderStack((prev) => {
      const newStack = [...prev];
      newStack.pop();
      const parent =
        newStack.length > 0
          ? newStack[newStack.length - 1].id
          : null;
      setCurrentFolder(parent);
      return newStack;
    });
  };

  const handlePreview = async (file: DriveFile) => {
    setPreviewLoading(true);
    setPreviewError('');
    setPreview({ url: '', name: file.name, type: file.mimeType });
    try {
      const response = await authenticatedFetch(
        `/api/drive/preview?fileId=${encodeURIComponent(file.id)}`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Unable to preview this file.');
      }
      const url = URL.createObjectURL(await response.blob());
      setPreview({ url, name: file.name, type: file.mimeType });
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : 'Unable to preview this file.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (preview?.url.startsWith('blob:')) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPreviewError('');
  };

  const handleAccessAction = async (body: Record<string, string | number | null>) => {
    const response = await authenticatedFetch('/api/drive/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Access request failed.');
    await Promise.all([loadFiles(), loadAccessRequests()]);
    return data;
  };

  const toggleLock = async (itemId: string, isLocked: boolean) => {
    if (lockProcessingId) return;
    setLockProcessingId(itemId);
    try {
      await handleAccessAction({ action: isLocked ? 'unlock' : 'lock', itemId });
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Could not update the lock.');
    } finally {
      setLockProcessingId(null);
      setOpenItemMenuId(null);
    }
  };

  const submitAccessRequest = async () => {
    if (!requestTarget || accessProcessingKey) return;
    setAccessProcessingKey(`request:${requestTarget.id}`);
    try {
      await handleAccessAction({
        action: 'request',
        itemId: requestTarget.id,
        requestedAccess: requestTarget.requestedAccess,
      });
      setRequestTarget(null);
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Could not submit the request.');
    } finally {
      setAccessProcessingKey(null);
    }
  };

  const reviewAccessRequest = async (
    requestId: string,
    decision: 'approve' | 'deny',
    grantedAccess?: 'view' | 'edit',
    duration: 'permanent' | '15' | '30' | 'custom' = 'permanent'
  ) => {
    if (accessProcessingKey) return;
    setAccessProcessingKey(`${decision}:${requestId}`);
    try {
      if (decision === 'approve' && duration === 'custom') {
        const expiryDate = new Date(customGrantExpiry);
        if (!customGrantExpiry || !Number.isFinite(expiryDate.getTime()) || expiryDate <= new Date()) {
          setFilesError('Choose a future expiration date and time.');
          return;
        }
      }

      await handleAccessAction({
        action: 'decide',
        requestId,
        decision,
        ...(grantedAccess ? { grantedAccess } : {}),
        ...(decision === 'approve' && duration === '15' ? { expiresInDays: 15 } : {}),
        ...(decision === 'approve' && duration === '30' ? { expiresInDays: 30 } : {}),
        ...(decision === 'approve' && duration === 'custom'
          ? { expiresAt: new Date(customGrantExpiry).toISOString() }
          : {}),
      });
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Could not review the request.');
    } finally {
      setAccessProcessingKey(null);
    }
  };

  const revokeAccessRequest = async (requestId: string) => {
    if (accessProcessingKey) return;
    setAccessProcessingKey(`revoke:${requestId}`);
    try {
      await handleAccessAction({ action: 'revoke', requestId });
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Could not revoke access.');
    } finally {
      setAccessProcessingKey(null);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/'))
      return <ImageIcon size={18} style={{ color: '#16a34a' }} />;
    if (mimeType.startsWith('video/'))
      return <Film size={18} style={{ color: '#7c3aed' }} />;
    if (mimeType.startsWith('audio/'))
      return <Music size={18} style={{ color: '#db2777' }} />;
    if (mimeType.includes('pdf'))
      return <FileText size={18} style={{ color: '#dc2626' }} />;
    return <File size={18} style={{ color: '#e8740c' }} />;
  };

  const canPreview = (mimeType: string) => {
    return (
      mimeType.startsWith('image/') ||
      mimeType.startsWith('video/') ||
      mimeType.startsWith('audio/') ||
      mimeType === 'application/pdf' ||
      mimeType.startsWith('text/')
    );
  };

  const formatSize = (bytes?: string) => {
    if (!bytes) return '-';
    const b = parseInt(bytes);
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const changeViewMode = (mode: 'tiles' | 'rows') => {
    setViewMode(mode);
  };

  const btnBase = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  return (
    <div className="animate-fade-in files-page">
      {/* Header */}
      <div className="files-header" style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
      }}>
        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#1a1a1a',
          }}>
            Files
          </h1>
          <div className="files-breadcrumb" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '4px',
            fontSize: '13px',
            color: '#8a7968',
          }}>
            <span
              style={{ cursor: 'pointer', color: '#e8740c' }}
              onClick={() => {
                beginFolderNavigation();
                setCurrentFolder(null);
                setFolderStack([]);
              }}
            >
              Root
            </span>
            {folderStack.map((f, i) => (
              <span
                key={`${f.id}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ color: '#d4c5b5' }}>/</span>
                <span
                  style={{
                    cursor: 'pointer',
                    color: '#e8740c',
                  }}
                  onClick={() => {
                    beginFolderNavigation();
                    setFolderStack((prev) =>
                      prev.slice(0, i + 1)
                    );
                    setCurrentFolder(f.id);
                  }}
                >
                  {f.name}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="files-toolbar-actions" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {currentFolder && currentFolderCanManage && (
            <div data-item-menu style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setOpenItemMenuId(
                  openItemMenuId === currentFolder ? null : currentFolder
                )}
                aria-label="More folder options"
                aria-expanded={openItemMenuId === currentFolder}
                title="More options"
                style={{
                  ...btnBase,
                  padding: '10px',
                  border: '1px solid #e8ddd0',
                  background: '#fffdf9',
                  color: '#6b5c4c',
                }}
              >
                <MoreVertical size={17} />
              </button>
              {openItemMenuId === currentFolder && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  zIndex: 30,
                  minWidth: '170px',
                  padding: '5px',
                  border: '1px solid #e8ddd0',
                  borderRadius: '10px',
                  background: '#fffdf9',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenItemMenuId(null);
                      void toggleLock(currentFolder, currentFolderLocked);
                    }}
                    style={{
                      ...btnBase,
                      width: '100%',
                      padding: '9px 10px',
                      border: 0,
                      background: 'transparent',
                      color: '#1a1a1a',
                      textAlign: 'left',
                      cursor: lockProcessingId ? 'wait' : 'pointer',
                    }}
                  >
                    {currentFolderLocked
                      ? <LockKeyholeOpen size={16} />
                      : <LockKeyhole size={16} />}
                    {currentFolderLocked ? 'Unlock folder' : 'Lock folder'}
                  </button>
                </div>
              )}
            </div>
          )}
          <div
            role="group"
            aria-label="File display mode"
            style={{
              display: 'flex',
              gap: '2px',
              padding: '3px',
              border: '1px solid #e8ddd0',
              borderRadius: '12px',
              background: '#fffdf9',
            }}
          >
            <button
              type="button"
              onClick={() => changeViewMode('tiles')}
              aria-label="Show files as tiles"
              aria-pressed={viewMode === 'tiles'}
              title="Tiles"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '7px 9px',
                border: 0,
                borderRadius: '8px',
                background: viewMode === 'tiles' ? '#fff1e5' : 'transparent',
                color: viewMode === 'tiles' ? '#c4620a' : '#6b5c4c',
                cursor: 'pointer',
              }}
            >
              <Grid2X2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => changeViewMode('rows')}
              aria-label="Show files as rows"
              aria-pressed={viewMode === 'rows'}
              title="Rows"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '7px 9px',
                border: 0,
                borderRadius: '8px',
                background: viewMode === 'rows' ? '#fff1e5' : 'transparent',
                color: viewMode === 'rows' ? '#c4620a' : '#6b5c4c',
                cursor: 'pointer',
              }}
            >
              <List size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowTrash(true);
              void loadTrash();
            }}
            style={{
              ...btnBase,
              border: '1px solid #e8ddd0',
              background: '#fffdf9',
              color: '#6b5c4c',
            }}
          >
            <Trash size={16} /> Trash
          </button>
          {(role === 'admin' || accessRequests.length > 0) && (
            <button
              onClick={() => setShowAccessRequests(true)}
              style={{
                ...btnBase,
                border: '1px solid #e8ddd0',
                background: '#fffdf9',
                color: '#1a1a1a',
              }}
            >
              <KeyRound size={16} /> Access Requests
              {accessRequests.length > 0 && ` (${accessRequests.length})`}
            </button>
          )}
          {currentFolderAccess === 'edit' && (
            <button
              type="button"
              disabled={creatingFolder}
              onClick={() => {
                setNewFolderName('');
                setNewFolderDescription('');
                setNewFolderAuthorizedMembers([]);
                setAuthorizedAccess('view');
                setShowNewFolder(!showNewFolder);
                if (!showNewFolder) void loadMembers();
              }}
              style={{
                ...btnBase,
                border: '1px solid #e8ddd0',
                background: '#fffdf9',
                color: '#1a1a1a',
              }}
            >
              <FolderPlus size={16} /> New Folder
            </button>
          )}
          {currentFolderAccess === 'edit' && <label
            style={{
              ...btnBase,
              border: 'none',
              background: uploading ? '#c4620a' : '#e8740c',
              color: '#ffffff',
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {uploading ? 'Uploading...' : 'Upload File'}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>}
        </div>
      </div>

      {filesError && (
        <div role="alert" style={{
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid #fecaca',
          background: '#fef2f2',
          color: '#b91c1c',
          fontSize: '13px',
        }}>
          {filesError}
          <button
            onClick={() => setFilesError('')}
            aria-label="Dismiss error"
            style={{ float: 'right', border: 0, background: 'transparent', cursor: 'pointer' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {currentFolderAccess === 'view' && currentFolder && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#fff7f0',
          color: '#6b5c4c',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          You have view-only access to this folder.
          <button
            onClick={() => setRequestTarget({
              id: currentFolder,
              name: folderStack.at(-1)?.name || 'this folder',
              requestedAccess: 'edit',
            })}
            style={{ ...btnBase, padding: '6px 10px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#1a1a1a' }}
          >
            Request edit access
          </button>
        </div>
      )}
      {/* New Folder */}
      {showNewFolder && (
        <div
          className="animate-scale-in"
          style={{ marginBottom: '20px' }}
        >
          <div style={{
            background: '#fffdf9',
            borderRadius: '12px',
            border: '1px solid #e8ddd0',
            padding: '16px',
            display: 'grid',
            gap: '12px',
            maxWidth: '560px',
          }}>
            <input
              type="text"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateFolder();
                }
              }}
              autoFocus
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '13px',
                border: '1px solid #e8ddd0',
                borderRadius: '8px',
                background: '#f5efe6',
                color: '#1a1a1a',
                outline: 'none',
              }}
            />
            <textarea
              placeholder="Description (optional)"
              value={newFolderDescription}
              onChange={(event) => setNewFolderDescription(event.target.value)}
              maxLength={2000}
              rows={3}
              aria-label="Folder description"
              style={{ width: '100%', padding: '9px 12px', fontSize: '13px', border: '1px solid #e8ddd0', borderRadius: '8px', background: '#f5efe6', color: '#1a1a1a', resize: 'vertical' }}
            />
            <AuthorizedMembersField
              members={members}
              selectedIds={newFolderAuthorizedMembers}
              onChange={setNewFolderAuthorizedMembers}
              access={authorizedAccess}
              onAccessChange={setAuthorizedAccess}
            />
            {membersLoading && (
              <p style={{ fontSize: '12px', color: '#8a7968', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={13} className="animate-spin" /> Loading members...
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              disabled={creatingFolder || !newFolderName.trim()}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: 'none',
                background: creatingFolder ? '#c4620a' : '#e8740c',
                color: '#fff',
                cursor: creatingFolder || !newFolderName.trim() ? 'not-allowed' : 'pointer',
                opacity: creatingFolder || !newFolderName.trim() ? 0.7 : 1,
              }}
            >
              {creatingFolder ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Creating...
                </>
              ) : 'Create'}
            </button>
            <button
              type="button"
              disabled={creatingFolder}
              onClick={() => {
                setShowNewFolder(false);
                setNewFolderName('');
              }}
              style={{
                padding: '8px',
                background: 'none',
                border: 'none',
                color: '#8a7968',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{
        position: 'relative',
        marginBottom: '20px',
        maxWidth: '320px',
      }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#8a7968',
          }}
        />
        <input
          type="text"
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            paddingLeft: '36px',
            paddingRight: '16px',
            paddingTop: '10px',
            paddingBottom: '10px',
            fontSize: '13px',
            border: '1px solid #e8ddd0',
            borderRadius: '12px',
            background: '#fffdf9',
            color: '#1a1a1a',
            outline: 'none',
          }}
        />
      </div>

      {/* Back */}
      {folderStack.length > 0 && (
        <button
          onClick={goBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#8a7968',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {loading ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '80px 0',
        }}>
          <Loader2
            size={28}
            className="animate-spin"
            style={{ color: '#e8740c' }}
          />
        </div>
      ) : (
        <div style={{
          display: viewMode === 'tiles' ? 'grid' : 'block',
          gridTemplateColumns: viewMode === 'tiles'
            ? 'repeat(auto-fill, minmax(230px, 1fr))'
            : undefined,
          gap: viewMode === 'tiles' ? '12px' : undefined,
          background: viewMode === 'rows' ? '#fffdf9' : 'transparent',
          borderRadius: viewMode === 'rows' ? '16px' : undefined,
          border: viewMode === 'rows' ? '1px solid #e8ddd0' : undefined,
          overflow: 'visible',
          boxShadow: viewMode === 'rows' ? '0 1px 3px rgba(0,0,0,0.04)' : undefined,
        }}>
          {/* Folders */}
          {filteredFolders.length > 0 && (
            <div style={{
              gridColumn: viewMode === 'tiles' ? '1 / -1' : undefined,
              padding: viewMode === 'tiles' ? '8px 0' : '12px 24px',
              background: '#f5efe6',
              borderBottom: viewMode === 'rows' ? '1px solid #e8ddd0' : 'none',
              borderRadius: viewMode === 'tiles' ? '10px' : undefined,
            }}>
              <p style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#8a7968',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}>
                Folders
              </p>
            </div>
          )}
          {filteredFolders.map((folder) => (
            <div
              key={folder.id}
              className={`folder-entry-row${viewMode === 'tiles' ? ' file-entry-tile' : ''}`}
              onClick={() => folder.canAccess !== false && openFolder(folder)}
              style={{
                display: 'flex',
                flexDirection: viewMode === 'tiles' ? 'column' : 'row',
                alignItems: viewMode === 'tiles' ? 'flex-start' : 'center',
                gap: '12px',
                padding: viewMode === 'tiles' ? '16px' : '14px 24px',
                background: viewMode === 'tiles' ? '#fffdf9' : 'transparent',
                border: viewMode === 'tiles' ? '1px solid #e8ddd0' : 'none',
                borderBottom: viewMode === 'rows' ? '1px solid #f0e6da' : 'none',
                borderRadius: viewMode === 'tiles' ? '14px' : undefined,
                boxShadow: viewMode === 'tiles' ? '0 1px 3px rgba(0,0,0,0.04)' : undefined,
                position: 'relative',
                zIndex: openItemMenuId === folder.id ? 20 : undefined,
                cursor: folder.canAccess === false ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fdf6ee';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = viewMode === 'tiles' ? '#fffdf9' : 'transparent';
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: '#fffbeb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <FolderOpen
                  size={18}
                  style={{ color: '#d97706' }}
                />
              </div>
              <div style={{ minWidth: 0, flex: 1, width: viewMode === 'tiles' ? '100%' : undefined }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1a1a1a',
                  overflowWrap: 'anywhere',
                }}>
                  {folder.name}
                </span>
                {folder.description && (
                  <p style={{ fontSize: '12px', color: '#8a7968', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '3px' }}>
                    {folder.description}
                  </p>
                )}
              </div>
              {folder.isLocked && (
                <LockKeyhole size={15} style={{ color: '#d97706', flexShrink: 0 }} />
              )}
              {folder.canManage ? (
                <div
                  data-item-menu
                  onClick={(event) => event.stopPropagation()}
                  style={{ position: 'relative', alignSelf: viewMode === 'tiles' ? 'flex-end' : undefined }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenItemMenuId(
                      openItemMenuId === folder.id ? null : folder.id
                    )}
                    aria-label={`More options for ${folder.name}`}
                    aria-expanded={openItemMenuId === folder.id}
                    title="More options"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      padding: 0,
                      border: '1px solid #e8ddd0',
                      borderRadius: '9px',
                      background: '#fffdf9',
                      color: '#6b5c4c',
                      cursor: 'pointer',
                    }}
                  >
                    <MoreVertical size={17} />
                  </button>
                  {openItemMenuId === folder.id && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      zIndex: 30,
                      minWidth: '160px',
                      padding: '5px',
                      border: '1px solid #e8ddd0',
                      borderRadius: '10px',
                      background: '#fffdf9',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    }}>
                      <button
                        type="button"
                        onClick={() => {
                          void toggleLock(folder.id, !!folder.isLocked);
                        }}
                        disabled={lockProcessingId !== null}
                        aria-busy={lockProcessingId === folder.id}
                        style={{
                          ...btnBase,
                          width: '100%',
                          padding: '9px 10px',
                          border: 0,
                          background: 'transparent',
                          color: '#1a1a1a',
                          textAlign: 'left',
                          cursor: lockProcessingId ? 'wait' : 'pointer',
                        }}
                      >
                        {lockProcessingId === folder.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : folder.isLocked
                            ? <LockKeyholeOpen size={16} />
                            : <LockKeyhole size={16} />}
                        {lockProcessingId === folder.id
                          ? (folder.isLocked ? 'Unlocking...' : 'Locking...')
                          : folder.isLocked ? 'Unlock' : 'Lock'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenItemMenuId(null);
                          setDeleteConfirm({ id: folder.id, name: folder.name, isFolder: true });
                        }}
                        style={{
                          ...btnBase,
                          width: '100%',
                          padding: '9px 10px',
                          border: 0,
                          background: 'transparent',
                          color: '#b91c1c',
                          textAlign: 'left',
                        }}
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              ) : folder.isLocked && folder.canAccess === false ? (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    if (folder.requestStatus !== 'pending') {
                      setRequestTarget({ id: folder.id, name: folder.name, requestedAccess: 'view' });
                    }
                  }}
                  disabled={folder.requestStatus === 'pending'}
                  style={{ ...btnBase, padding: '7px 10px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#6b5c4c' }}
                >
                  <KeyRound size={14} />
                  {folder.requestStatus === 'pending' ? 'Requested' : 'Request access'}
                </button>
              ) : folder.isLocked && folder.accessLevel === 'view' && folder.requestStatus !== 'pending' ? (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setRequestTarget({ id: folder.id, name: folder.name, requestedAccess: 'edit' });
                  }}
                  style={{ ...btnBase, padding: '7px 10px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#6b5c4c' }}
                >
                  Request edit
                </button>
              ) : null}
            </div>
          ))}

          {/* Files header */}
          {filteredFiles.length > 0 && (
            <div style={{
              gridColumn: viewMode === 'tiles' ? '1 / -1' : undefined,
              padding: viewMode === 'tiles' ? '8px 0' : '12px 24px',
              background: '#f5efe6',
              borderBottom: viewMode === 'rows' ? '1px solid #e8ddd0' : 'none',
              borderRadius: viewMode === 'tiles' ? '10px' : undefined,
            }}>
              <p style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#8a7968',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}>
                Files
              </p>
            </div>
          )}

          {/* Files */}
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className={`file-entry-row${viewMode === 'tiles' ? ' file-entry-tile' : ''}`}
              style={{
                display: 'flex',
                flexDirection: viewMode === 'tiles' ? 'column' : 'row',
                alignItems: viewMode === 'tiles' ? 'stretch' : 'center',
                justifyContent: viewMode === 'tiles' ? 'flex-start' : 'space-between',
                gap: viewMode === 'tiles' ? '14px' : undefined,
                padding: viewMode === 'tiles' ? '16px' : '14px 24px',
                background: viewMode === 'tiles' ? '#fffdf9' : 'transparent',
                border: viewMode === 'tiles' ? '1px solid #e8ddd0' : 'none',
                borderBottom: viewMode === 'rows' ? '1px solid #f0e6da' : 'none',
                borderRadius: viewMode === 'tiles' ? '14px' : undefined,
                boxShadow: viewMode === 'tiles' ? '0 1px 3px rgba(0,0,0,0.04)' : undefined,
                position: 'relative',
                zIndex: openItemMenuId === file.id ? 20 : undefined,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fdf6ee';
                const actions =
                  e.currentTarget.querySelector(
                    '[data-actions]'
                  ) as HTMLElement;
                if (actions) actions.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = viewMode === 'tiles' ? '#fffdf9' : 'transparent';
                const actions =
                  e.currentTarget.querySelector(
                    '[data-actions]'
                  ) as HTMLElement;
                if (actions) {
                  actions.style.opacity = viewMode === 'tiles' || (file.isLocked && !file.canAccess)
                    ? '1'
                    : '0';
                }
              }}
            >
              <div style={{
                display: 'flex',
                flexDirection: viewMode === 'tiles' ? 'column' : 'row',
                alignItems: viewMode === 'tiles' ? 'flex-start' : 'center',
                gap: '12px',
                minWidth: 0,
                flex: viewMode === 'rows' ? 1 : undefined,
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: '#f5efe6',
                  border: '1px solid #e8ddd0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {getFileIcon(file.mimeType)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#1a1a1a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {file.name}
                  </p>
                  {file.description && (
                    <p style={{ fontSize: '12px', color: '#8a7968', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '3px' }}>
                      {file.description}
                    </p>
                  )}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#8a7968',
                    marginTop: '2px',
                    flexWrap: 'wrap',
                  }}>
                    <span>{formatSize(file.size)}</span>
                    <span style={{ color: '#d4c5b5' }}>•</span>
                    <span>
                      by {file.uploadedBy || 'Unknown'}
                    </span>
                    {file.createdTime && (
                      <>
                        <span style={{ color: '#d4c5b5' }}>
                          •
                        </span>
                        <span>
                          {new Date(
                            file.createdTime
                          ).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div
                data-actions
                className="file-entry-actions"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  opacity: viewMode === 'tiles' || (file.isLocked && !file.canAccess) ? 1 : 0,
                  transition: 'opacity 0.15s',
                  flexShrink: 0,
                  justifyContent: 'flex-end',
                }}
              >
                {file.canAccess !== false && canPreview(file.mimeType) && (
                  <button
                    onClick={() => handlePreview(file)}
                    title="Preview"
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'transparent',
                      color: '#8a7968',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        '#fff7f0';
                      e.currentTarget.style.color = '#e8740c';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        'transparent';
                      e.currentTarget.style.color = '#8a7968';
                    }}
                  >
                    <Eye size={16} />
                  </button>
                )}
                {file.canAccess !== false && (
                  <>
                    <button
                      onClick={() => handleDownload(file.id, file.name)}
                      disabled={downloadingFileId !== null}
                      title="Download"
                      aria-label={downloadingFileId === file.id ? `Downloading ${file.name}` : `Download ${file.name}`}
                      style={{
                        padding: '8px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: '#8a7968',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f0fdf4';
                        e.currentTarget.style.color = '#16a34a';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#8a7968';
                      }}
                    >
                      {downloadingFileId === file.id
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Download size={16} />}
                    </button>
                  </>
                )}
                {(file.canManage
                  || (file.canAccess !== false
                    && currentFolderAccess === 'edit'
                    && file.accessLevel !== 'view')) && (
                  <div
                    data-item-menu
                    style={{ position: 'relative', zIndex: 30 }}
                    onClick={(event) => event.stopPropagation()}
                  >
                  <button
                    type="button"
                    onClick={() => setOpenItemMenuId(
                      openItemMenuId === file.id ? null : file.id
                    )}
                    title="More options"
                    aria-label={`More options for ${file.name}`}
                    aria-expanded={openItemMenuId === file.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      padding: 0,
                      border: '1px solid #e8ddd0',
                      borderRadius: '9px',
                      background: '#fffdf9',
                      color: '#6b5c4c',
                      cursor: 'pointer',
                    }}
                  >
                    <MoreVertical size={17} />
                  </button>
                  {openItemMenuId === file.id && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      zIndex: 30,
                      minWidth: '160px',
                      padding: '5px',
                      border: '1px solid #e8ddd0',
                      borderRadius: '10px',
                      background: '#fffdf9',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    }}>
                      {file.canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            void toggleLock(file.id, !!file.isLocked);
                          }}
                          disabled={lockProcessingId !== null}
                          aria-busy={lockProcessingId === file.id}
                          style={{
                            ...btnBase,
                            width: '100%',
                            padding: '9px 10px',
                            border: 0,
                            background: 'transparent',
                            color: '#1a1a1a',
                            textAlign: 'left',
                          }}
                        >
                          {lockProcessingId === file.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : file.isLocked
                              ? <LockKeyholeOpen size={16} />
                              : <LockKeyhole size={16} />}
                          {lockProcessingId === file.id
                            ? (file.isLocked ? 'Unlocking...' : 'Locking...')
                            : file.isLocked ? 'Unlock' : 'Lock'}
                        </button>
                      )}
                      {file.canAccess !== false
                        && currentFolderAccess === 'edit'
                        && file.accessLevel !== 'view' && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenItemMenuId(null);
                              setDeleteConfirm({ id: file.id, name: file.name, isFolder: false });
                            }}
                            style={{
                              ...btnBase,
                              width: '100%',
                              padding: '9px 10px',
                              border: 0,
                              background: 'transparent',
                              color: '#b91c1c',
                              textAlign: 'left',
                            }}
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        )}
                    </div>
                  )}
                  </div>
                )}
                {file.isLocked && !file.canAccess && (
                  <button
                    onClick={() => {
                      if (file.requestStatus !== 'pending') {
                        setRequestTarget({ id: file.id, name: file.name, requestedAccess: 'view' });
                      }
                    }}
                    disabled={file.requestStatus === 'pending'}
                    style={{ ...btnBase, padding: '7px 10px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#6b5c4c' }}
                  >
                    <KeyRound size={14} />
                    {file.requestStatus === 'pending' ? 'Requested' : 'Request access'}
                  </button>
                )}
                {file.isLocked && file.canAccess && file.accessLevel === 'view' && (
                  file.requestStatus === 'pending' ? (
                    <span style={{ fontSize: '11px', color: '#8a7968' }}>Edit request pending</span>
                  ) : (
                    <button
                      onClick={() => setRequestTarget({ id: file.id, name: file.name, requestedAccess: 'edit' })}
                      style={{ ...btnBase, padding: '7px 10px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#6b5c4c' }}
                    >
                      Request edit
                    </button>
                  )
                )}
              </div>
            </div>
          ))}

          {filteredFolders.length === 0 &&
            filteredFiles.length === 0 && (
              <div style={{
                padding: '64px 24px',
                textAlign: 'center',
              }}>
                <FolderOpen
                  size={44}
                  style={{
                    margin: '0 auto 12px',
                    display: 'block',
                    color: '#d4c5b5',
                  }}
                />
                <p style={{
                  color: '#8a7968',
                  fontSize: '14px',
                }}>
                  This folder is empty
                </p>
                <p style={{
                  color: '#d4c5b5',
                  fontSize: '12px',
                  marginTop: '4px',
                }}>
                  Upload a file or create a folder
                </p>
              </div>
            )}
        </div>
      )}

      {showTrash && (
        <div className="modal-overlay" onClick={() => setShowTrash(false)}>
          <div
            className="animate-scale-in"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fffdf9',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '18px',
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
                  Trash
                </h2>
                <p style={{ fontSize: '12px', color: '#8a7968', marginTop: '3px' }}>
                  Restore deleted files or folders. Restoring a folder restores its contents.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTrash(false)}
                aria-label="Close Trash"
                style={{ padding: '6px', border: 0, background: 'transparent', color: '#8a7968', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            {trashError && (
              <div role="alert" style={{
                marginBottom: '14px',
                padding: '10px 12px',
                borderRadius: '9px',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: '12px',
              }}>
                {trashError}
              </div>
            )}
            {trashLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: '#e8740c' }} />
              </div>
            ) : trashItems.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#8a7968', fontSize: '14px' }}>
                Trash is empty
              </div>
            ) : (
              <div style={{ border: '1px solid #e8ddd0', borderRadius: '12px', overflow: 'hidden' }}>
                {trashItems.map((item, index) => (
                  <div
                    key={item.item_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '13px 16px',
                      borderBottom: index < trashItems.length - 1 ? '1px solid #f0e6da' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      {item.item_type === 'folder'
                        ? <FolderOpen size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                        : <File size={18} style={{ color: '#8a7968', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', overflowWrap: 'anywhere' }}>
                          {item.item_name}
                        </p>
                        <p style={{ fontSize: '11px', color: '#8a7968', marginTop: '2px' }}>
                          {item.item_type} · {new Date(item.deleted_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => void restoreTrashItem(item)}
                        disabled={restoringItemId !== null}
                        style={{
                          ...btnBase,
                          padding: '8px 12px',
                          border: '1px solid #e8ddd0',
                          background: '#fffdf9',
                          color: '#1a1a1a',
                          opacity: restoringItemId !== null ? 0.6 : 1,
                          cursor: restoringItemId !== null ? 'wait' : 'pointer',
                        }}
                      >
                        {restoringItemId === item.item_id
                          ? <Loader2 size={15} className="animate-spin" />
                          : <ArrowLeft size={15} />}
                        {restoringItemId === item.item_id ? 'Restoring...' : 'Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPermanentDeleteConfirm(item)}
                        disabled={restoringItemId !== null}
                        style={{
                          ...btnBase,
                          padding: '8px 12px',
                          border: '1px solid #fecaca',
                          background: '#fffdf9',
                          color: '#b91c1c',
                          opacity: restoringItemId !== null ? 0.6 : 1,
                          cursor: restoringItemId !== null ? 'wait' : 'pointer',
                        }}
                      >
                        <Trash size={15} /> Delete forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {permanentDeleteConfirm && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!restoringItemId) setPermanentDeleteConfirm(null);
          }}
        >
          <div
            className="animate-scale-in"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fffdf9',
              borderRadius: '20px',
              padding: '28px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '10px' }}>
              Delete forever?
            </h2>
            <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#6b5c4c', marginBottom: '22px' }}>
              “{permanentDeleteConfirm.item_name}” will be permanently deleted from Drive and cannot be restored.
              {permanentDeleteConfirm.item_type === 'folder' && ' Its contents will also be permanently deleted.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  if (!restoringItemId) setPermanentDeleteConfirm(null);
                }}
                disabled={restoringItemId !== null}
                style={{
                  ...btnBase,
                  border: '1px solid #e8ddd0',
                  background: '#fffdf9',
                  color: '#6b5c4c',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void permanentlyDeleteTrashItem(permanentDeleteConfirm);
                }}
                disabled={restoringItemId !== null}
                style={{
                  ...btnBase,
                  border: 0,
                  background: '#dc2626',
                  color: '#fff',
                  cursor: restoringItemId !== null ? 'wait' : 'pointer',
                  opacity: restoringItemId !== null ? 0.7 : 1,
                }}
              >
                {restoringItemId === permanentDeleteConfirm.item_id
                  ? <><Loader2 size={15} className="animate-spin" /> Deleting...</>
                  : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteConfirm && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!deletingItemId) setDeleteConfirm(null);
          }}
        >
          <div
            className="animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fffdf9',
              borderRadius: '20px',
              padding: '28px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <AlertCircle
                  size={20}
                  style={{ color: '#dc2626' }}
                />
              </div>
              <div>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#1a1a1a',
                }}>
                  Delete {deleteConfirm.isFolder ? 'Folder' : 'File'}
                </h3>
                <p style={{
                  fontSize: '12px',
                  color: '#8a7968',
                }}>
                  You can restore this from Trash
                </p>
              </div>
            </div>
            <p style={{
              fontSize: '14px',
              color: '#6b5c4c',
              marginBottom: '24px',
            }}>
              Move “{deleteConfirm.name}” to Trash?
              {deleteConfirm.isFolder && ' Its contents will be moved to Trash too.'}
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={Boolean(deletingItemId)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: '1px solid #e8ddd0',
                  background: '#fffdf9',
                  color: '#6b5c4c',
                  cursor: deletingItemId ? 'not-allowed' : 'pointer',
                  opacity: deletingItemId ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deleteConfirm.id)}
                disabled={Boolean(deletingItemId)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  cursor: deletingItemId ? 'wait' : 'pointer',
                  opacity: deletingItemId ? 0.8 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {deletingItemId === deleteConfirm.id ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Moving to Trash...
                  </>
                ) : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUploadFile && (
        <div className="modal-overlay" onClick={() => !uploading && setSelectedUploadFile(null)}>
          <div
            className="animate-scale-in"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fffdf9',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Upload file</h2>
              <button
                type="button"
                onClick={() => setSelectedUploadFile(null)}
                disabled={uploading}
                aria-label="Cancel upload"
                style={{ border: 0, background: 'transparent', cursor: uploading ? 'wait' : 'pointer', color: '#8a7968' }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#6b5c4c', marginBottom: '14px', overflowWrap: 'anywhere' }}>
              {selectedUploadFile.name}
            </p>
            <label style={{ display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '14px' }}>
              Description
              <textarea
                value={uploadDescription}
                onChange={(event) => setUploadDescription(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Description (optional)"
                style={{ width: '100%', padding: '9px 12px', fontSize: '13px', fontWeight: 400, border: '1px solid #e8ddd0', borderRadius: '8px', background: '#f5efe6', color: '#1a1a1a', resize: 'vertical' }}
              />
            </label>
            <AuthorizedMembersField
              members={members}
              selectedIds={uploadAuthorizedMembers}
              onChange={setUploadAuthorizedMembers}
              access={authorizedAccess}
              onAccessChange={setAuthorizedAccess}
            />
            {membersLoading && (
              <p style={{ fontSize: '12px', color: '#8a7968', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={13} className="animate-spin" /> Loading members...
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={() => setSelectedUploadFile(null)}
                disabled={uploading}
                style={{ ...btnBase, border: '1px solid #e8ddd0', background: '#fffdf9', color: '#6b5c4c', opacity: uploading ? 0.6 : 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitUpload()}
                disabled={uploading}
                style={{ ...btnBase, border: 0, background: uploading ? '#c4620a' : '#e8740c', color: '#fff', cursor: uploading ? 'wait' : 'pointer' }}
              >
                {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading...</> : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestTarget && (
        <div className="modal-overlay" onClick={() => setRequestTarget(null)}>
          <div
            className="animate-scale-in"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fffdf9',
              borderRadius: '20px',
              padding: '28px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>
              Request access
            </h2>
            <p style={{ fontSize: '13px', color: '#8a7968', marginBottom: '20px' }}>
              Choose the access level you need for “{requestTarget.name}”.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
              {(['view', 'edit'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setRequestTarget({ ...requestTarget, requestedAccess: level })}
                  aria-pressed={requestTarget.requestedAccess === level}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: requestTarget.requestedAccess === level ? '2px solid #e8740c' : '1px solid #e8ddd0',
                    background: requestTarget.requestedAccess === level ? '#fff7f0' : '#fffdf9',
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {level} access
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setRequestTarget(null)}
                style={{ ...btnBase, border: '1px solid #e8ddd0', background: '#fffdf9', color: '#6b5c4c' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void submitAccessRequest()}
                disabled={accessProcessingKey !== null}
                style={{ ...btnBase, border: 0, background: '#e8740c', color: '#fff' }}
              >
                {accessProcessingKey === `request:${requestTarget.id}`
                  ? <><Loader2 size={15} className="animate-spin" /> Sending...</>
                  : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAccessRequests && (
        <div className="modal-overlay" onClick={() => setShowAccessRequests(false)}>
          <div
            className="animate-scale-in"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fffdf9',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Access requests</h2>
              <button onClick={() => setShowAccessRequests(false)} aria-label="Close access requests" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#8a7968' }}>
                <X size={18} />
              </button>
            </div>
            {accessRequests.length === 0 ? (
              <p style={{ padding: '24px 0', textAlign: 'center', color: '#8a7968', fontSize: '14px' }}>
                No pending requests or active grants.
              </p>
            ) : accessRequests.map((accessRequest) => (
              <div key={accessRequest.id} style={{ padding: '14px 0', borderTop: '1px solid #f0e6da' }}>
                <p style={{ fontSize: '14px', color: '#1a1a1a', marginBottom: '4px' }}>
                  <strong>{accessRequest.requester_name}</strong>{' '}
                  {accessRequest.status === 'pending' ? 'requested' : 'has'}{' '}
                  <strong>{accessRequest.status === 'approved' ? accessRequest.granted_access : accessRequest.requested_access}</strong> access to{' '}
                  <strong>{accessRequest.target?.item_name || 'an item'}</strong>
                </p>
                {accessRequest.status === 'pending' ? (
                  <>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                      <label style={{ fontSize: '12px', color: '#6b5c4c' }} htmlFor={`grant-duration-${accessRequest.id}`}>
                        Access duration
                      </label>
                      <select
                        id={`grant-duration-${accessRequest.id}`}
                        value={grantDuration}
                        onChange={(event) => setGrantDuration(event.target.value as typeof grantDuration)}
                        style={{ padding: '8px 10px', borderRadius: '9px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#1a1a1a' }}
                      >
                        <option value="permanent">No expiry</option>
                        <option value="15">15 days</option>
                        <option value="30">30 days</option>
                        <option value="custom">Choose date and time</option>
                      </select>
                      {grantDuration === 'custom' && (
                        <input
                          type="datetime-local"
                          value={customGrantExpiry}
                          onChange={(event) => setCustomGrantExpiry(event.target.value)}
                          aria-label="Custom access expiration date and time"
                          style={{ padding: '8px 10px', borderRadius: '9px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#1a1a1a' }}
                        />
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                      <button
                        onClick={() => void reviewAccessRequest(accessRequest.id, 'approve', 'view', grantDuration)}
                        disabled={accessProcessingKey !== null}
                        style={{ ...btnBase, padding: '7px 10px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', opacity: accessProcessingKey ? 0.65 : 1, cursor: accessProcessingKey ? 'wait' : 'pointer' }}
                      >
                        {accessProcessingKey === `approve:${accessRequest.id}`
                          ? <><Loader2 size={14} className="animate-spin" /> Approving...</>
                          : 'Approve view'}
                      </button>
                      <button
                        onClick={() => void reviewAccessRequest(accessRequest.id, 'approve', 'edit', grantDuration)}
                        disabled={accessProcessingKey !== null}
                        style={{ ...btnBase, padding: '7px 10px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', opacity: accessProcessingKey ? 0.65 : 1, cursor: accessProcessingKey ? 'wait' : 'pointer' }}
                      >
                        {accessProcessingKey === `approve:${accessRequest.id}`
                          ? <><Loader2 size={14} className="animate-spin" /> Approving...</>
                          : 'Approve edit'}
                      </button>
                      <button
                        onClick={() => void reviewAccessRequest(accessRequest.id, 'deny')}
                        disabled={accessProcessingKey !== null}
                        style={{ ...btnBase, padding: '7px 10px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', opacity: accessProcessingKey ? 0.65 : 1, cursor: accessProcessingKey ? 'wait' : 'pointer' }}
                      >
                        {accessProcessingKey === `deny:${accessRequest.id}`
                          ? <><Loader2 size={14} className="animate-spin" /> Denying...</>
                          : 'Deny'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#8a7968' }}>
                      {accessRequest.expires_at
                        ? `Expires ${new Date(accessRequest.expires_at).toLocaleString()}`
                        : 'No expiration'}
                    </span>
                    <button
                      onClick={() => void revokeAccessRequest(accessRequest.id)}
                      disabled={accessProcessingKey !== null}
                      style={{ ...btnBase, padding: '7px 10px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', opacity: accessProcessingKey ? 0.65 : 1, cursor: accessProcessingKey ? 'wait' : 'pointer' }}
                    >
                      {accessProcessingKey === `revoke:${accessRequest.id}`
                        ? <><Loader2 size={14} className="animate-spin" /> Revoking...</>
                        : 'Revoke access'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div
          className="modal-overlay"
          onClick={closePreview}
        >
          <div
            className="animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fffdf9',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            {/* Preview header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid #e8ddd0',
              background: '#f5efe6',
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#1a1a1a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                paddingRight: '16px',
              }}>
                {preview.name}
              </h3>
              <button
                onClick={closePreview}
                style={{
                  padding: '6px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: '#8a7968',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Preview body */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f5efe6',
              minHeight: '300px',
            }}>
              {previewLoading ? (
                <Loader2 size={30} className="animate-spin" style={{ color: '#e8740c' }} />
              ) : previewError ? (
                <p style={{ color: '#8a7968', fontSize: '14px' }}>
                  {previewError}
                </p>
              ) : preview.type.startsWith('image/') ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.url}
                    alt={preview.name}
                    onError={() => setPreviewError('Unable to load this preview. Try downloading the file instead.')}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      objectFit: 'contain',
                      borderRadius: '8px',
                    }}
                  />
                </>
              ) : preview.type.startsWith('video/') ? (
                <video
                  src={preview.url}
                  controls
                  onError={() => setPreviewError('Unable to load this preview. Try downloading the file instead.')}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    borderRadius: '8px',
                  }}
                />
              ) : preview.type.startsWith('audio/') ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '32px 0',
                }}>
                  <Music
                    size={48}
                    style={{ color: '#db2777' }}
                  />
                  <audio
                    src={preview.url}
                    controls
                    onError={() => setPreviewError('Unable to load this preview. Try downloading the file instead.')}
                    style={{ width: '100%', maxWidth: '400px' }}
                  />
                </div>
              ) : preview.type === 'application/pdf' ? (
                <iframe
                  src={preview.url}
                  onError={() => setPreviewError('Unable to load this preview. Try downloading the file instead.')}
                  style={{
                    width: '100%',
                    height: '70vh',
                    borderRadius: '8px',
                    border: '1px solid #e8ddd0',
                  }}
                />
              ) : preview.type.startsWith('text/') ? (
                <iframe
                  src={preview.url}
                  onError={() => setPreviewError('Unable to load this preview. Try downloading the file instead.')}
                  style={{
                    width: '100%',
                    height: '70vh',
                    borderRadius: '8px',
                    border: '1px solid #e8ddd0',
                    background: '#fff',
                  }}
                />
              ) : (
                <p style={{
                  color: '#8a7968',
                  fontSize: '14px',
                }}>
                  Cannot preview this file type
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}