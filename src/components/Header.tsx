'use client';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Header({ name, uid, role }: { name: string; uid: string; role: string }) {
    const router = useRouter();
    const logout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
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
