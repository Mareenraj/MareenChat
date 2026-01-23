'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login, error, clearError } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        clearError();

        try {
            await login(email, password);
            router.push('/chat');
        } catch {
            // Error is handled by AuthContext
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--telegram-bg)] flex items-center justify-center p-4">
            <div className="w-full max-w-[420px]">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="w-40 h-40 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden">
                        {/* Placeholder for Telegram-like Monkey or Logo */}
                        <svg viewBox="0 0 24 24" className="w-24 h-24 text-[var(--telegram-primary)]" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-semibold text-[var(--foreground)]">
                        MareenChat
                    </h1>
                    <p className="text-[var(--telegram-gray)] mt-2">Please sign in to your account.</p>
                </div>

                {/* Login Form Card */}
                <div className="bg-[var(--telegram-surface)] rounded-2xl p-10 md:p-12 shadow-sm border border-[var(--telegram-border)]">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 text-red-500 px-4 py-3 rounded-lg text-sm border border-red-100">
                                {error}
                            </div>
                        )}

                        {/* Email Field */}
                        <div className="relative group">
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="peer w-full px-4 py-3 bg-[var(--telegram-surface)] border border-[var(--telegram-border)] rounded-xl text-[var(--foreground)] outline-none focus:border-[var(--telegram-primary)] focus:ring-1 focus:ring-[var(--telegram-primary)] transition-all placeholder-transparent"
                                placeholder="Email"
                            />
                            <label
                                htmlFor="email"
                                className="absolute left-4 top-3 text-[var(--telegram-gray)] text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-[var(--telegram-primary)] peer-focus:bg-[var(--telegram-surface)] peer-focus:px-1 pointer-events-none bg-[var(--telegram-surface)]"
                            >
                                Email
                            </label>
                        </div>

                        {/* Password Field */}
                        <div className="relative group">
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="peer w-full px-4 py-3 bg-[var(--telegram-surface)] border border-[var(--telegram-border)] rounded-xl text-[var(--foreground)] outline-none focus:border-[var(--telegram-primary)] focus:ring-1 focus:ring-[var(--telegram-primary)] transition-all placeholder-transparent"
                                placeholder="Password"
                            />
                            <label
                                htmlFor="password"
                                className="absolute left-4 top-3 text-[var(--telegram-gray)] text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-[var(--telegram-primary)] peer-focus:bg-[var(--telegram-surface)] peer-focus:px-1 pointer-events-none bg-[var(--telegram-surface)]"
                            >
                                Password
                            </label>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 px-4 bg-[var(--telegram-primary)] text-white font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all uppercase text-sm tracking-wider shadow-lg shadow-blue-500/20"
                        >
                            {isLoading ? 'PLEASE WAIT...' : 'LOG IN'}
                        </button>
                    </form>

                    {/* Register Link */}
                    <div className="mt-8 text-center">
                        <Link
                            href="/register"
                            className="text-[var(--telegram-primary)] hover:underline text-sm font-medium"
                        >
                            Don't have an account? Sign up
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
