#!/bin/bash

echo "Creating Phase 3 files..."
mkdir -p src/lib
mkdir -p "src/app/(dashboard)/activity"

# 1. Activity logger utility
cat > src/lib/activity.ts << 'ENDOFFILE'
import { supabase } from './supabase';

export async function logActivity(data: {
    userId: string;
    userName: string;
    actionType: string;
    targetName?: string;
    targetId?: string;
    details?: string;
}) {
    try {
        await supabase.from('activity_logs').insert({
            user_id: data.userId,
            user_name: data.userName,
            action_type: data.actionType,
            target_name: data.targetName || null,
            target_id: data.targetId || null,
            details: data.details || null,
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}
ENDOFFILE

# 2. Updated upload API with logging
cat > src/app/api/drive/upload/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const folderId = (formData.get('folderId') as string) || getRootFolderId();
        const userId = formData.get('userId') as string;
        const userName = formData.get('userName') as string;

        if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const readable = new Readable({
            read() { this.push(buffer); this.push(null); },
        });

        const drive = getDrive();
        const response = await drive.files.create({
            requestBody: { name: file.name, parents: [folderId] },
            media: { mimeType: file.type || 'application/octet-stream', body: readable },
            fields: 'id, name, mimeType, size',
        });

        // Log activity
        if (userId) {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            await supabase.from('activity_logs').insert({
                user_id: userId,
                user_name: userName || 'Unknown',
                action_type: 'upload',
                target_name: file.name,
                target_id: response.data.id,
                details: `Uploaded ${file.name} (${file.size} bytes)`,
            });
        }

        return NextResponse.json({ file: response.data });
    } catch (error: any) {
        console.error('UPLOAD ERROR:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 3. Updated download API with logging
cat > src/app/api/drive/download/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive } from '@/lib/google-drive';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
    try {
        const fileId = request.nextUrl.searchParams.get('fileId');
        const fileName = request.nextUrl.searchParams.get('fileName') || 'download';
        const userId = request.nextUrl.searchParams.get('userId');
        const userName = request.nextUrl.searchParams.get('userName');

        if (!fileId) return NextResponse.json({ error: 'No fileId' }, { status: 400 });

        const drive = getDrive();
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        // Log activity
        if (userId) {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            await supabase.from('activity_logs').insert({
                user_id: userId,
                user_name: userName || 'Unknown',
                action_type: 'download',
                target_name: fileName,
                target_id: fileId,
                details: `Downloaded ${fileName}`,
            });
        }

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

# 4. Updated delete API with logging
cat > src/app/api/drive/delete/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive } from '@/lib/google-drive';
import { createClient } from '@supabase/supabase-js';

export async function DELETE(request: NextRequest) {
    try {
        const fileId = request.nextUrl.searchParams.get('fileId');
        const fileName = request.nextUrl.searchParams.get('fileName');
        const userId = request.nextUrl.searchParams.get('userId');
        const userName = request.nextUrl.searchParams.get('userName');

        if (!fileId) return NextResponse.json({ error: 'No fileId' }, { status: 400 });

        const drive = getDrive();
        await drive.files.delete({ fileId });

        // Log activity
        if (userId) {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            await supabase.from('activity_logs').insert({
                user_id: userId,
                user_name: userName || 'Unknown',
                action_type: 'delete',
                target_name: fileName || fileId,
                target_id: fileId,
                details: `Deleted ${fileName || fileId}`,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 5. Updated folder creation API with logging
cat > src/app/api/drive/folder/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { getDrive, getRootFolderId } from '@/lib/google-drive';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const { name, parentId, userId, userName } = await request.json();
        const drive = getDrive();

        const response = await drive.files.create({
            requestBody: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId || getRootFolderId()],
            },
            fields: 'id, name',
        });

        // Log activity
        if (userId) {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            await supabase.from('activity_logs').insert({
                user_id: userId,
                user_name: userName || 'Unknown',
                action_type: 'create_folder',
                target_name: name,
                target_id: response.data.id,
                details: `Created folder "${name}"`,
            });
        }

        return NextResponse.json({ folder: response.data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 6. Activity logs API
cat > src/app/api/activity/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const userId = request.nextUrl.searchParams.get('userId');
        const actionType = request.nextUrl.searchParams.get('actionType');
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

        let query = supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (userId) query = query.eq('user_id', userId);
        if (actionType) query = query.eq('action_type', actionType);

        const { data, error } = await query;

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ logs: data || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
ENDOFFILE

# 7. Activity page (server wrapper)
cat > "src/app/(dashboard)/activity/page.tsx" << 'ENDOFFILE'
export const instant = false;
import ActivityContent from '@/components/ActivityContent';
export default function Page() { return <ActivityContent />; }
ENDOFFILE

# 8. Activity content (client component)
cat > src/components/ActivityContent.tsx << 'ENDOFFILE'
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, Download, Trash2, FolderPlus, LogIn, LogOut, FileEdit, Filter } from 'lucide-react';

interface Log {
    id: string;
    user_id: string;
    user_name: string;
    action_type: string;
    target_name: string | null;
    target_id: string | null;
    details: string | null;
    created_at: string;
}

const actionConfig: Record<string, { icon: any; color: string; label: string }> = {
    upload: { icon: Upload, color: 'bg-green-100 text-green-600', label: 'Uploaded' },
    download: { icon: Download, color: 'bg-blue-100 text-blue-600', label: 'Downloaded' },
    delete: { icon: Trash2, color: 'bg-red-100 text-red-600', label: 'Deleted' },
    create_folder: { icon: FolderPlus, color: 'bg-yellow-100 text-yellow-600', label: 'Created Folder' },
    login: { icon: LogIn, color: 'bg-purple-100 text-purple-600', label: 'Logged In' },
    logout: { icon: LogOut, color: 'bg-gray-100 text-gray-600', label: 'Logged Out' },
};

export default function ActivityContent() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setUserId(session.user.id);
        });
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        const params = new URLSearchParams({ limit: '100' });
        if (filter !== 'all') params.set('actionType', filter);
        const res = await fetch(`/api/activity?${params}`);
        const data = await res.json();
        setLogs(data.logs || []);
        setLoading(false);
    };

    useEffect(() => { loadLogs(); }, [filter]);

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
                    <p className="text-gray-500 mt-1">Recent file operations and events</p>
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="all">All Actions</option>
                        <option value="upload">Uploads</option>
                        <option value="download">Downloads</option>
                        <option value="delete">Deletions</option>
                        <option value="create_folder">Folders Created</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading activity...</div>
                ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No activity recorded yet</div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {logs.map((log) => {
                            const config = actionConfig[log.action_type] || {
                                icon: FileEdit,
                                color: 'bg-gray-100 text-gray-600',
                                label: log.action_type,
                            };
                            const Icon = config.icon;

                            return (
                                <div key={log.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50">
                                    <div className={`p-2 rounded-lg ${config.color}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-900">
                                            <span className="font-medium">{log.user_name}</span>{' '}
                                            <span className="text-gray-500">{config.label.toLowerCase()}</span>{' '}
                                            {log.target_name && (
                                                <span className="font-medium">{log.target_name}</span>
                                            )}
                                        </p>
                                        {log.details && (
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">{log.details}</p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs text-gray-400">{timeAgo(log.created_at)}</p>
                                        <p className="text-xs text-gray-300">
                                            {new Date(log.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
ENDOFFILE

echo ""
echo "Phase 3 files created!"
