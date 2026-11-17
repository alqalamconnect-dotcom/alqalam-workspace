#!/bin/bash

echo "Creating folders..."
mkdir -p src/lib
mkdir -p src/components
mkdir -p "src/app/(auth)/login"
mkdir -p "src/app/(auth)/register"
mkdir -p "src/app/(dashboard)/dashboard"
mkdir -p "src/app/(dashboard)/profile"
mkdir -p "src/app/(dashboard)/admin/registrations"

echo "Creating files..."

# 1. src/lib/supabase.ts
cat > src/lib/supabase.ts << 'ENDOFFILE'
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
ENDOFFILE

# 2. src/middleware.ts
cat > src/middleware.ts << 'ENDOFFILE'
import { NextResponse } from 'next/server';

export function middleware() {
    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
ENDOFFILE

# 3. src/app/layout.tsx
cat > src/app/layout.tsx << 'ENDOFFILE'
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Al Qalam Workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-gray-50 antialiased">{children}</body>
        </html>
    );
}
ENDOFFILE

# 4. src/app/page.tsx
cat > src/app/page.tsx << 'ENDOFFILE'
export const instant = false;
import HomeRedirect from '@/components/HomeRedirect';
export default function Page() { return <HomeRedirect />; }
ENDOFFILE

# 5. src/components/HomeRedirect.tsx
cat > src/components/HomeRedirect.tsx << 'ENDOFFILE'
'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function HomeRedirect() {
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            window.location.href = user ? '/dashboard' : '/login';
        });
    }, []);
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
}
ENDOFFILE

# 6. src/app/(auth)/login/page.tsx
cat > "src/app/(auth)/login/page.tsx" << 'ENDOFFILE'
export const instant = false;
import LoginForm from '@/components/LoginForm';
export default function Page() { return <LoginForm />; }
ENDOFFILE

# 7. src/components/LoginForm.tsx
cat > src/components/LoginForm.tsx << 'ENDOFFILE'
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        window.location.href = '/dashboard';
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Al Qalam Workspace</h1>
                    <p className="text-gray-500 mt-2">Sign in to your account</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <form onSubmit={handleLogin} className="space-y-5">
                        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="you@example.com" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••" />
                        </div>
                        <button type="submit" disabled={loading}
                            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                    <p className="text-center text-sm text-gray-500 mt-6">
                        No account? <Link href="/register" className="text-blue-600 hover:underline">Request Access</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
ENDOFFILE

# 8. src/app/(auth)/register/page.tsx
cat > "src/app/(auth)/register/page.tsx" << 'ENDOFFILE'
export const instant = false;
import RegisterForm from '@/components/RegisterForm';
export default function Page() { return <RegisterForm />; }
ENDOFFILE

# 9. src/components/RegisterForm.tsx
cat > src/components/RegisterForm.tsx << 'ENDOFFILE'
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function RegisterForm() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password !== confirm) { setError('Passwords do not match.'); return; }
        if (password.length < 6) { setError('Min 6 characters.'); return; }
        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email, password, options: { data: { full_name: name } },
        });
        if (error) { setError(error.message); setLoading(false); return; }
        setSuccess(true); setLoading(false);
    };

    if (success) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
                <h2 className="text-xl font-bold mb-2">Registration Submitted</h2>
                <p className="text-gray-500 mb-4">Waiting for admin approval.</p>
                <Link href="/login" className="text-blue-600 hover:underline">Go to Login</Link>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Al Qalam Workspace</h1>
                    <p className="text-gray-500 mt-2">Request access</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <form onSubmit={handleRegister} className="space-y-4">
                        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Full Name"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Password (min 6)"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="Confirm Password"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        <button type="submit" disabled={loading}
                            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                            {loading ? 'Submitting...' : 'Request Access'}
                        </button>
                    </form>
                    <p className="text-center text-sm text-gray-500 mt-6">
                        Have an account? <Link href="/login" className="text-blue-600 hover:underline">Sign In</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
ENDOFFILE

# 10. src/app/(dashboard)/layout.tsx
cat > "src/app/(dashboard)/layout.tsx" << 'ENDOFFILE'
export const instant = false;
import DashboardShell from '@/components/DashboardShell';
export default function Layout({ children }: { children: React.ReactNode }) {
    return <DashboardShell>{children}</DashboardShell>;
}
ENDOFFILE

# 11. src/components/DashboardShell.tsx
cat > src/components/DashboardShell.tsx << 'ENDOFFILE'
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Sidebar from './Sidebar';
import Header from './Header';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user) { window.location.href = '/login'; return; }
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (!data || data.status !== 'active') { window.location.href = '/login'; return; }
            setProfile(data);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
    if (!profile) return null;

    return (
        <div className="min-h-screen bg-gray-50">
            <Sidebar isAdmin={profile.role === 'admin'} />
            <div className="ml-64">
                <Header name={profile.full_name} uid={profile.unique_user_id} role={profile.role} />
                <main className="p-6">{children}</main>
            </div>
        </div>
    );
}
ENDOFFILE

# 12. src/components/Sidebar.tsx
cat > src/components/Sidebar.tsx << 'ENDOFFILE'
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Activity, Bot, User, Shield } from 'lucide-react';

const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/files', label: 'Files', icon: FolderOpen },
    { href: '/activity', label: 'Activity', icon: Activity },
    { href: '/qalam-ai', label: 'Qalam AI', icon: Bot },
    { href: '/profile', label: 'Profile', icon: User },
];

export default function Sidebar({ isAdmin }: { isAdmin: boolean }) {
    const path = usePathname();
    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-6 border-b border-gray-100">
                <h1 className="text-xl font-bold">Al Qalam</h1>
                <p className="text-xs text-gray-400">Workspace</p>
            </div>
            <nav className="flex-1 p-4 space-y-1">
                {links.map((l) => (
                    <Link key={l.href} href={l.href}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                            path === l.href || (l.href !== '/dashboard' && path.startsWith(l.href))
                                ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                        <l.icon className="w-5 h-5" />{l.label}
                    </Link>
                ))}
                {isAdmin && (
                    <>
                        <p className="px-3 pt-6 pb-2 text-xs font-semibold text-gray-400 uppercase">Admin</p>
                        <Link href="/admin/registrations"
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                                path.startsWith('/admin') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                            }`}>
                            <Shield className="w-5 h-5" />Registrations
                        </Link>
                    </>
                )}
            </nav>
        </aside>
    );
}
ENDOFFILE

# 13. src/components/Header.tsx
cat > src/components/Header.tsx << 'ENDOFFILE'
'use client';
import { supabase } from '@/lib/supabase';

export default function Header({ name, uid, role }: { name: string; uid: string; role: string }) {
    const logout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };
    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-20">
            <p className="text-sm text-gray-500">Welcome, <span className="font-medium text-gray-900">{name}</span></p>
            <div className="flex items-center gap-4">
                <div className="text-right">
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-gray-400">{uid} · {role}</p>
                </div>
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-700">{name[0].toUpperCase()}</span>
                </div>
                <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
        </header>
    );
}
ENDOFFILE

# 14. src/app/(dashboard)/dashboard/page.tsx
cat > "src/app/(dashboard)/dashboard/page.tsx" << 'ENDOFFILE'
export const instant = false;
import DashboardContent from '@/components/DashboardContent';
export default function Page() { return <DashboardContent />; }
ENDOFFILE

# 15. src/components/DashboardContent.tsx
cat > src/components/DashboardContent.tsx << 'ENDOFFILE'
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, FileText, HardDrive, Clock } from 'lucide-react';

export default function DashboardContent() {
    const [stats, setStats] = useState<any>(null);
    useEffect(() => {
        Promise.all([
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]).then(([{ count: m }, { count: p }]) => setStats({ m, p }));
    }, []);

    const cards = [
        { label: 'Active Members', value: stats?.m ?? '...', icon: Users, bg: 'bg-blue-50 text-blue-600' },
        { label: 'Total Files', value: '—', icon: FileText, bg: 'bg-green-50 text-green-600' },
        { label: 'Storage', value: '0 / 15 GB', icon: HardDrive, bg: 'bg-purple-50 text-purple-600' },
        { label: 'Pending', value: stats?.p ?? '...', icon: Clock, bg: 'bg-yellow-50 text-yellow-600' },
    ];

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards.map((c) => (
                    <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">{c.label}</p>
                                <p className="text-2xl font-bold mt-1">{c.value}</p>
                            </div>
                            <div className={`p-3 rounded-lg ${c.bg}`}><c.icon className="w-6 h-6" /></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
ENDOFFILE

# 16. src/app/(dashboard)/profile/page.tsx
cat > "src/app/(dashboard)/profile/page.tsx" << 'ENDOFFILE'
export const instant = false;
import ProfileContent from '@/components/ProfileContent';
export default function Page() { return <ProfileContent />; }
ENDOFFILE

# 17. src/components/ProfileContent.tsx
cat > src/components/ProfileContent.tsx << 'ENDOFFILE'
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ProfileContent() {
    const [p, setP] = useState<any>(null);
    useEffect(() => {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user) return;
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            setP(data);
        });
    }, []);
    if (!p) return <p className="text-gray-500">Loading...</p>;
    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Profile</h1>
            <div className="bg-white rounded-xl border border-gray-200 max-w-lg p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-xl font-bold text-blue-700">{p.full_name[0]}</span>
                    </div>
                    <div><h2 className="text-lg font-bold">{p.full_name}</h2><p className="text-sm text-gray-500">{p.email}</p></div>
                </div>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">User ID</span><span className="font-mono">{p.unique_user_id}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Role</span><span className="capitalize">{p.role}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="text-green-600">{p.status}</span></div>
                </div>
            </div>
        </div>
    );
}
ENDOFFILE

# 18. src/app/(dashboard)/admin/registrations/page.tsx
cat > "src/app/(dashboard)/admin/registrations/page.tsx" << 'ENDOFFILE'
export const instant = false;
import RegistrationsContent from '@/components/RegistrationsContent';
export default function Page() { return <RegistrationsContent />; }
ENDOFFILE

# 19. src/components/RegistrationsContent.tsx
cat > src/components/RegistrationsContent.tsx << 'ENDOFFILE'
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function RegistrationsContent() {
    const [pending, setPending] = useState<any[]>([]);
    const [all, setAll] = useState<any[]>([]);
    const load = async () => {
        const { data: p } = await supabase.from('profiles').select('*').eq('status', 'pending');
        const { data: a } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        setPending(p || []); setAll(a || []);
    };
    useEffect(() => { load(); }, []);
    const act = async (id: string, s: string) => { await supabase.from('profiles').update({ status: s }).eq('id', id); load(); };

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Registrations</h1>
            <div className="bg-white rounded-xl border border-gray-200 mb-8">
                <div className="p-4 border-b"><h2 className="font-semibold">Pending ({pending.length})</h2></div>
                {pending.length === 0 ? <p className="p-4 text-sm text-gray-400">None</p> : (
                    <div className="divide-y">{pending.map((u) => (
                        <div key={u.id} className="p-4 flex items-center justify-between">
                            <div><p className="font-medium">{u.full_name}</p><p className="text-sm text-gray-500">{u.email}</p></div>
                            <div className="flex gap-2">
                                <button onClick={() => act(u.id, 'active')} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100">Approve</button>
                                <button onClick={() => act(u.id, 'rejected')} className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm hover:bg-red-100">Reject</button>
                            </div>
                        </div>
                    ))}</div>
                )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-4 border-b"><h2 className="font-semibold">All ({all.length})</h2></div>
                <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-gray-500"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Status</th></tr></thead>
                    <tbody className="divide-y">{all.map((m) => (
                        <tr key={m.id}><td className="px-4 py-3 font-medium">{m.full_name}</td><td className="px-4 py-3 text-gray-500">{m.email}</td><td className="px-4 py-3 font-mono text-gray-400">{m.unique_user_id}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-green-100 text-green-700' : m.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{m.status}</span></td></tr>
                    ))}</tbody>
                </table>
            </div>
        </div>
    );
}
ENDOFFILE

echo ""
echo "All 19 files created successfully!"
echo ""
echo "Next steps:"
echo "  1. Make sure .env.local has your Supabase URL and key"
echo "  2. Run: npm run dev"
echo "  3. Open http://localhost:3000"
