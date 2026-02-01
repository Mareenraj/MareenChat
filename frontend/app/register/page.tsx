'use client';

import {FormEvent, useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {useAuth} from '../../context/AuthContext';

export default function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [localError, setLocalError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const {signup, error, clearError} = useAuth();
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

        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(password)) {
            setLocalError('Password must contain uppercase, lowercase, number, and a special character');
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

    // Password strength indicators
    const hasMinLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return (
        <div
            className="min-h-screen bg-gradient-to-br from-[#0a0f18] via-[#0e1621] to-[#1a1f2e] flex items-center justify-center p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo/Header */}
                <div className="text-center mb-6">
                    <div
                        className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/30 transform hover:scale-105 transition-transform">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-1">
                        Create Account
                    </h1>
                    <p className="text-gray-400 text-sm">Join MareenChat and start messaging</p>
                </div>

                {/* Register Form Card */}
                <div className="bg-[#17212b]/80 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Error Message */}
                        {displayError && (
                            <div
                                className="bg-red-500/10 text-red-400 px-4 py-3 rounded-xl text-sm border border-red-500/20 flex items-center gap-2">
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor"
                                     viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                {displayError}
                            </div>
                        )}

                        {/* Name Field */}
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-1.5">
                                Full Name
                            </label>
                            <input
                                type="text"
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                minLength={2}
                                autoComplete="name"
                                className="w-full px-4 py-3 bg-[#242f3d] border border-[#3a4a5c] rounded-xl text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-500"
                                placeholder="Enter your full name"
                            />
                        </div>

                        {/* Email Field */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1.5">
                                Email Address
                            </label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                className="w-full px-4 py-3 bg-[#242f3d] border border-[#3a4a5c] rounded-xl text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-500"
                                placeholder="Enter your email"
                            />
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1.5">
                                Password
                            </label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                autoComplete="new-password"
                                className="w-full px-4 py-3 bg-[#242f3d] border border-[#3a4a5c] rounded-xl text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-500"
                                placeholder="Create a password"
                            />
                            {/* Password Requirements */}
                            {password && (
                                <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                                    <div
                                        className={`flex items-center gap-1 ${hasMinLength ? 'text-green-400' : 'text-gray-500'}`}>
                                        <span>{hasMinLength ? '✓' : '○'}</span> 8+ characters
                                    </div>
                                    <div
                                        className={`flex items-center gap-1 ${hasUppercase ? 'text-green-400' : 'text-gray-500'}`}>
                                        <span>{hasUppercase ? '✓' : '○'}</span> Uppercase
                                    </div>
                                    <div
                                        className={`flex items-center gap-1 ${hasLowercase ? 'text-green-400' : 'text-gray-500'}`}>
                                        <span>{hasLowercase ? '✓' : '○'}</span> Lowercase
                                    </div>
                                    <div
                                        className={`flex items-center gap-1 ${hasNumber ? 'text-green-400' : 'text-gray-500'}`}>
                                        <span>{hasNumber ? '✓' : '○'}</span> Number
                                    </div>
                                    <div
                                        className={`flex items-center gap-1 ${hasSpecialChar ? 'text-green-400' : 'text-gray-500'}`}>
                                        <span>{hasSpecialChar ? '✓' : '○'}</span> Special char
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirm Password Field */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-400 mb-1.5">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                                className={`w-full px-4 py-3 bg-[#242f3d] border rounded-xl text-white outline-none focus:ring-2 transition-all placeholder:text-gray-500 ${confirmPassword && password !== confirmPassword
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                                    : confirmPassword && password === confirmPassword
                                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                                        : 'border-[#3a4a5c] focus:border-blue-500 focus:ring-blue-500/20'
                                }`}
                                placeholder="Confirm your password"
                            />
                            {confirmPassword && password !== confirmPassword && (
                                <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                            )}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-blue-700 active:scale-[0.98] transition-all uppercase text-sm tracking-wider shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                                strokeWidth="4" fill="none"/>
                                        <path className="opacity-75" fill="currentColor"
                                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                    </svg>
                                    Creating Account...
                                </span>
                            ) : 'Create Account'}
                        </button>
                    </form>

                    {/* Login Link */}
                    <div className="mt-6 text-center">
                        <p className="text-gray-500 text-sm">
                            Already have an account?{' '}
                            <Link
                                href="/login"
                                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                            >
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-600 text-xs mt-6">
                    By creating an account, you agree to our Terms of Service
                </p>
            </div>
        </div>
    );
}

