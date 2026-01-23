'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';

export default function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [localError, setLocalError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { signup, error, clearError } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLocalError('');
        clearError();

        // Validate passwords match
        if (password !== confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }

        // Validate password strength
        if (password.length < 8) {
            setLocalError('Password must be at least 8 characters long');
            return;
        }

        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            setLocalError('Password must contain uppercase, lowercase, and a number');
            return;
        }

        setIsLoading(true);

        try {
            const result = await signup(email, password, name);
            // Redirect to OTP verification page with email
            router.push(`/verify-otp?email=${encodeURIComponent(result.email)}`);
        } catch {
            // Error is handled by AuthContext
        } finally {
            setIsLoading(false);
        }
    };

    const displayError = localError || error;

    return (
        <div className="min-h-screen bg-[var(--telegram-bg)] flex items-center justify-center p-4">
            <div className="w-full max-w-[420px]">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="w-32 h-32 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-16 h-16 text-[var(--telegram-primary)]" fill="currentColor">
                            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-semibold text-[var(--foreground)]">
                        Join MareenChat
                    </h1>
                    <p className="text-[var(--telegram-gray)] mt-2">Create your account to get started.</p>
                </div>

                {/* Register Form Card */}
                <div className="bg-[var(--telegram-surface)] rounded-2xl p-10 md:p-12 shadow-sm border border-[var(--telegram-border)]">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Error Message */}
                        {displayError && (
                            <div className="bg-red-50 text-red-500 px-4 py-3 rounded-lg text-sm border border-red-100">
                                {displayError}
                            </div>
                        )}

                        {/* Name Field */}
                        <div className="relative group">
                            <input
                                type="text"
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                minLength={2}
                                className="peer w-full px-4 py-3 bg-[var(--telegram-surface)] border border-[var(--telegram-border)] rounded-xl text-[var(--foreground)] outline-none focus:border-[var(--telegram-primary)] focus:ring-1 focus:ring-[var(--telegram-primary)] transition-all placeholder-transparent"
                                placeholder="Full Name"
                            />
                            <label
                                htmlFor="name"
                                className="absolute left-4 top-3 text-[var(--telegram-gray)] text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-[var(--telegram-primary)] peer-focus:bg-[var(--telegram-surface)] peer-focus:px-1 pointer-events-none bg-[var(--telegram-surface)]"
                            >
                                Full Name
                            </label>
                        </div>

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
                                minLength={8}
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

                        {/* Confirm Password Field */}
                        <div className="relative group">
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="peer w-full px-4 py-3 bg-[var(--telegram-surface)] border border-[var(--telegram-border)] rounded-xl text-[var(--foreground)] outline-none focus:border-[var(--telegram-primary)] focus:ring-1 focus:ring-[var(--telegram-primary)] transition-all placeholder-transparent"
                                placeholder="Confirm Password"
                            />
                            <label
                                htmlFor="confirmPassword"
                                className="absolute left-4 top-3 text-[var(--telegram-gray)] text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-[var(--telegram-primary)] peer-focus:bg-[var(--telegram-surface)] peer-focus:px-1 pointer-events-none bg-[var(--telegram-surface)]"
                            >
                                Confirm Password
                            </label>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 px-4 bg-[var(--telegram-primary)] text-white font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all uppercase text-sm tracking-wider shadow-lg shadow-blue-500/20"
                        >
                            {isLoading ? 'CREATING ACCOUNT...' : 'REGISTER'}
                        </button>
                    </form>

                    {/* Login Link */}
                    <div className="mt-8 text-center">
                        <Link
                            href="/login"
                            className="text-[var(--telegram-primary)] hover:underline text-sm font-medium"
                        >
                            Already have an account? Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
