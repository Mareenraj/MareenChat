'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useAuth} from '../context/AuthContext';

export default function Home() {
    const {user, loading} = useAuth();
    const router = useRouter();

    // Redirect based on authentication status
    useEffect(() => {
        if (!loading) {
            if (user) {
                router.push('/chat');
            } else {
                router.push('/login');
            }
        }
    }, [user, loading, router]);

    // Show loading spinner while checking auth
    return (
        <div className="min-h-screen bg-[var(--telegram-bg)] flex items-center justify-center">
            <div
                className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--telegram-primary)]"></div>
        </div>
    );
}
