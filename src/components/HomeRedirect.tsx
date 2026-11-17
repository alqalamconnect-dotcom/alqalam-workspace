'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function HomeRedirect() {
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            const session = data.session;
            router.push(session ? '/dashboard' : '/login');
        });
    }, [router]);

    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
}