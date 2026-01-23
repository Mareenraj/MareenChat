'use client';

import { useState, FormEvent, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';

function VerifyOtpContent() {
    const searchParams = useSearchParams();
    const emailFromUrl = searchParams.get('email') || '';

    const [email, setEmail] = useState(emailFromUrl);
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [isLoading, setIsLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const { verifyOtp, resendOtp, error, clearError } = useAuth();
    const router = useRouter();
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Countdown timer for resend
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    // Handle OTP input change
    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // Only allow digits

        const newOtp = [...otp];
        newOtp[index] = value.slice(-1); // Only keep last digit
        setOtp(newOtp);

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    // Handle backspace
    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    // Handle paste
    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newOtp = [...otp];
        pastedData.split('').forEach((char, index) => {
            if (index < 6) newOtp[index] = char;
        });
        setOtp(newOtp);
        // Focus the last filled input or the next empty one
        const lastIndex = Math.min(pastedData.length, 5);
        inputRefs.current[lastIndex]?.focus();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const otpString = otp.join('');

        if (otpString.length !== 6) {
            return;
        }

        setIsLoading(true);
        clearError();

        try {
            await verifyOtp(email, otpString);
            // Redirect to login after successful verification
            router.push('/login?verified=true');
        } catch {
            // Error is handled by AuthContext
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = async () => {
        if (countdown > 0) return;

        setResendLoading(true);
        setResendSuccess(false);
        clearError();

        try {
            await resendOtp(email);
            setResendSuccess(true);
            setCountdown(60); // 60 second cooldown
        } catch {
            // Error is handled by AuthContext
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--telegram-bg)] flex items-center justify-center p-4">
            <div className="w-full max-w-[420px]">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="w-32 h-32 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-16 h-16 text-[var(--telegram-primary)]" fill="currentColor">
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-semibold text-[var(--foreground)]">
                        Verify Email
                    </h1>
                    <p className="text-[var(--telegram-gray)] mt-2">
                        Enter the code sent to <span className="font-semibold text-[var(--telegram-primary)]">{email || 'your email'}</span>
                    </p>
                </div>

                {/* OTP Form Card */}
                <div className="bg-[var(--telegram-surface)] rounded-2xl p-10 md:p-12 shadow-sm border border-[var(--telegram-border)]">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 text-red-500 px-4 py-3 rounded-lg text-sm border border-red-100">
                                {error}
                            </div>
                        )}

                        {/* Success Message */}
                        {resendSuccess && (
                            <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm border border-green-100">
                                OTP sent successfully!
                            </div>
                        )}

                        {/* Email Field (hidden if from URL) */}
                        {!emailFromUrl && (
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
                        )}

                        {/* OTP Input */}
                        <div>
                            <div className="flex justify-center gap-2" onPaste={handlePaste}>
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={(el) => { inputRefs.current[index] = el }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleOtpChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                        className="w-12 h-14 text-center text-2xl font-bold bg-[var(--telegram-surface)] border border-[var(--telegram-border)] rounded-xl text-[var(--foreground)] hover:border-[var(--telegram-primary)] focus:border-[var(--telegram-primary)] focus:ring-2 focus:ring-[var(--telegram-primary)]/20 outline-none transition-all"
                                    />
                                ))}
                            </div>
                            <p className="mt-4 text-center">
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={resendLoading || countdown > 0}
                                    className="text-[var(--telegram-primary)] hover:underline text-sm font-medium disabled:opacity-50"
                                >
                                    {resendLoading ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                                </button>
                            </p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || otp.join('').length !== 6}
                            className="w-full py-3.5 px-4 bg-[var(--telegram-primary)] text-white font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all uppercase text-sm tracking-wider shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
                        >
                            {isLoading ? 'VERIFYING...' : 'VERIFY EMAIL'}
                        </button>
                    </form>

                    {/* Back to Login */}
                    <div className="mt-6 text-center">
                        <Link
                            href="/login"
                            className="text-[var(--telegram-gray)] hover:text-[var(--telegram-primary)] text-sm transition-colors"
                        >
                            ← Back to Sign In
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function VerifyOtpPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
        }>
            <VerifyOtpContent />
        </Suspense>
    );
}
