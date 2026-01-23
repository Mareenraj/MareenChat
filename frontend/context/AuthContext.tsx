'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, User, clearTokens, getAccessToken } from '../lib/api';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, name: string) => Promise<{ email: string }>;
    verifyOtp: (email: string, otp: string) => Promise<void>;
    resendOtp: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Check if user is logged in on initial load
    useEffect(() => {
        const checkAuth = async () => {
            const token = getAccessToken();
            if (token) {
                try {
                    const userData = await authApi.getProfile();
                    setUser(userData);
                } catch {
                    // Token invalid or expired, try refresh
                    try {
                        await authApi.refreshTokens();
                        const userData = await authApi.getProfile();
                        setUser(userData);
                    } catch {
                        // Refresh failed, clear tokens
                        clearTokens();
                    }
                }
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

    const login = async (email: string, password: string) => {
        try {
            setError(null);
            const response = await authApi.login(email, password);
            if (response.user) {
                setUser(response.user);
            }
        } catch (err: unknown) {
            const message = (err as { message?: string | string[] })?.message;
            const errorMsg = Array.isArray(message) ? message[0] : message || 'Login failed';
            setError(errorMsg);
            throw err;
        }
    };

    const signup = async (email: string, password: string, name: string) => {
        try {
            setError(null);
            const response = await authApi.signup(email, password, name);
            return { email: response.email || email };
        } catch (err: unknown) {
            const message = (err as { message?: string | string[] })?.message;
            const errorMsg = Array.isArray(message) ? message[0] : message || 'Signup failed';
            setError(errorMsg);
            throw err;
        }
    };

    const verifyOtp = async (email: string, otp: string) => {
        try {
            setError(null);
            await authApi.verifyOtp(email, otp);
        } catch (err: unknown) {
            const message = (err as { message?: string | string[] })?.message;
            const errorMsg = Array.isArray(message) ? message[0] : message || 'OTP verification failed';
            setError(errorMsg);
            throw err;
        }
    };

    const resendOtp = async (email: string) => {
        try {
            setError(null);
            await authApi.resendOtp(email);
        } catch (err: unknown) {
            const message = (err as { message?: string | string[] })?.message;
            const errorMsg = Array.isArray(message) ? message[0] : message || 'Failed to resend OTP';
            setError(errorMsg);
            throw err;
        }
    };

    const logout = async () => {
        try {
            await authApi.logout();
        } finally {
            setUser(null);
        }
    };

    const clearError = () => setError(null);

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                error,
                login,
                signup,
                verifyOtp,
                resendOtp,
                logout,
                clearError,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;
