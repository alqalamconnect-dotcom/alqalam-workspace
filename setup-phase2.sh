#!/bin/bash

echo "Creating Phase 2 folders..."
mkdir -p src/lib
mkdir -p src/app/api/drive/list
mkdir -p src/app/api/drive/upload
mkdir -p src/app/api/drive/download
mkdir -p src/app/api/drive/delete
mkdir -p src/app/api/drive/folder
mkdir -p "src/app/(dashboard)/files"

echo "Creating files..."

# 1. Google Drive utility
cat > src/lib/google-drive.ts << 'ENDOFFILE'
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

let driveInstance: any = null;

export function getDrive() {
    if (driveInstance) return driveInstance;

    const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './google-service-account.json');
    const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));

    const auth = new google.auth.GoogleAuth({
        credentials: keyData,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });

    driveInstance = google.drive({ version: 'v3', auth });
    return driveInstance;
}

export function getRootFolderId() {
    return process.env.GOOGLE_DRIVE_FOLDER_ID || '';
}
ENDOFFILE

# 2. List files API
cat > src/app/api/drive/list/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';

export async function GET(request: NextRequest) {
    try {
        const folderId = request.nextUrl.searchParams.get('folderId') || getRootFolderId();
        const drive = getDrive();

        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
            orderBy: 'folder,name',
        });

        return NextResponse.json({ files: response.data.files || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 3. Upload file API
cat > src/app/api/drive/upload/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const folderId = formData.get('folderId') as string || getRootFolderId();

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const drive = getDrive();

        const response = await drive.files.create({
            requestBody: {
                name: file.name,
                parents: [folderId],
            },
            media: {
                mimeType: file.type || 'application/octet-stream',
                body: buffer,
            },
            fields: 'id, name, mimeType, size, webViewLink',
        });

        return NextResponse.json({ file: response.data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 4. Download file API
cat > src/app/api/drive/download/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive } from '@/lib/google-drive';

export async function GET(request: NextRequest) {
    try {
        const fileId = request.nextUrl.searchParams.get('fileId');
        const fileName = request.nextUrl.searchParams.get('fileName') || 'download';

        if (!fileId) {
            return NextResponse.json({ error: 'No fileId' }, { status: 400 });
        }

        const drive = getDrive();

        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        const buffer = Buffer.from(response.data as any);

        return new NextResponse(buffer, {
            headers: {
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Type': 'application/octet-stream',
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 5. Delete file API
cat > src/app/api/drive/delete/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive } from '@/lib/google-drive';

export async function DELETE(request: NextRequest) {
    try {
        const fileId = request.nextUrl.searchParams.get('fileId');

        if (!fileId) {
            return NextResponse.json({ error: 'No fileId' }, { status: 400 });
        }

        const drive = getDrive();
        await drive.files.delete({ fileId });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 6. Create folder API
cat > src/app/api/drive/folder/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';

export async function POST(request: NextRequest) {
    try {
        const { name, parentId } = await request.json();
        const drive = getDrive();

        const response = await drive.files.create({
            requestBody: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId || getRootFolderId()],
            },
            fields: 'id, name',
        });

        return NextResponse.json({ folder: response.data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 7. Files page (server wrapper)
cat > "src/app/(dashboard)/files/page.tsx" << 'ENDOFFILE'
export const instant = false;
import FilesContent from '@/components/FilesContent';
export default function Page() { return <FilesContent />; }
ENDOFFILE

# 8. Files content (client component)
cat > src/components/FilesContent.tsx << 'ENDOFFILE'
'use client';
import { useEffect, useState, useRef } from 'react';
import { Folder, FileText, Image, Film, File, Upload, FolderPlus, Download, Trash2, ChevronRight, Home } from 'lucide-react';

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    createdTime?: string;
    webViewLink?: string;
}

export default function FilesContent() {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
    const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([]);
    const [uploading, setUploading] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadFiles = async (folderId?: string) => {
        setLoading(true);
        const url = folderId ? `/api/drive/list?folderId=${folderId}` : '/api/drive/list';
        const res = await fetch(url);
        const data = await res.json();
        setFiles(data.files || []);
        setLoading(false);
    };

    useEffect(() => { loadFiles(); }, []);

    const openFolder = (folder: DriveFile) => {
        const newEntry = { id: folder.id, name: folder.name };
        setFolderHistory((prev) => [...prev, ...(currentFolder ? [currentFolder] : [])]);
        setCurrentFolder(newEntry);
        loadFiles(folder.id);
    };

    const goBack = () => {
        const prev = [...folderHistory];
        const parent = prev.pop();
        setFolderHistory(prev);
        setCurrentFolder(parent || null);
        loadFiles(parent?.id);
    };

    const goHome = () => {
        setFolderHistory([]);
        setCurrentFolder(null);
        loadFiles();
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        setUploading(true);
        for (const file of Array.from(selectedFiles)) {
            const formData = new FormData();
            formData.append('file', file);
            if (currentFolder) formData.append('folderId', currentFolder.id);

            await fetch('/api/drive/upload', { method: 'POST', body: formData });
        }
        setUploading(false);
        loadFiles(currentFolder?.id);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownload = (file: DriveFile) => {
        window.open(`/api/drive/download?fileId=${file.id}&fileName=${encodeURIComponent(file.name)}`, '_blank');
    };

    const handleDelete = async (file: DriveFile) => {
        if (!confirm(`Delete "${file.name}"?`)) return;
        await fetch(`/api/drive/delete?fileId=${file.id}`, { method: 'DELETE' });
        loadFiles(currentFolder?.id);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        await fetch('/api/drive/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newFolderName, parentId: currentFolder?.id }),
        });
        setNewFolderName('');
        setShowNewFolder(false);
        loadFiles(currentFolder?.id);
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType.includes('folder')) return <Folder className="w-5 h-5 text-yellow-500" />;
        if (mimeType.includes('image')) return <Image className="w-5 h-5 text-green-500" />;
        if (mimeType.includes('video')) return <Film className="w-5 h-5 text-purple-500" />;
        if (mimeType.includes('pdf') || mimeType.includes('document')) return <FileText className="w-5 h-5 text-blue-500" />;
        return <File className="w-5 h-5 text-gray-400" />;
    };

    const formatSize = (bytes?: string) => {
        if (!bytes) return '—';
        const b = parseInt(bytes);
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    };

    const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder';

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Files</h1>
                    <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                        <button onClick={goHome} className="hover:text-blue-600 flex items-center gap-1">
                            <Home className="w-3.5 h-3.5" /> Root
                        </button>
                        {currentFolder && (
                            <>
                                <ChevronRight className="w-3.5 h-3.5" />
                                <span className="text-gray-900 font-medium">{currentFolder.name}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowNewFolder(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
                        <FolderPlus className="w-4 h-4" /> New Folder
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        <Upload className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
                </div>
            </div>

            {showNewFolder && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex gap-2">
                    <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder name" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} />
                    <button onClick={handleCreateFolder} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Create</button>
                    <button onClick={() => setShowNewFolder(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">Cancel</button>
                </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200">
                {currentFolder && (
                    <button onClick={goBack}
                        className="w-full px-4 py-3 flex items-center gap-3 text-sm text-blue-600 hover:bg-blue-50 border-b border-gray-100">
                        ← Back
                    </button>
                )}

                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading files...</div>
                ) : files.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">This folder is empty</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 text-left text-gray-500">
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3 w-24">Size</th>
                                <th className="px-4 py-3 w-32">Modified</th>
                                <th className="px-4 py-3 w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {files.map((f) => (
                                <tr key={f.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        {isFolder(f) ? (
                                            <button onClick={() => openFolder(f)} className="flex items-center gap-3 font-medium text-gray-900 hover:text-blue-600">
                                                {getFileIcon(f.mimeType)} {f.name}
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-3 text-gray-900">
                                                {getFileIcon(f.mimeType)} {f.name}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{isFolder(f) ? '—' : formatSize(f.size)}</td>
                                    <td className="px-4 py-3 text-gray-500">
                                        {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1">
                                            {!isFolder(f) && (
                                                <button onClick={() => handleDownload(f)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Download">
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button onClick={() => handleDelete(f)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
ENDOFFILE

echo ""
echo "Phase 2 files created!"
echo "Restart your dev server to test."
