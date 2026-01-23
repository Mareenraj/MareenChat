// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types for auth API responses
export interface User {
    id: string;
    email: string;
    name: string;
    isVerified?: boolean;
    createdAt?: string;
}

export interface AuthResponse {
    message: string;
    user?: User;
    accessToken?: string;
    refreshToken?: string;
    email?: string;
}

export interface ApiError {
    message: string | string[];
    statusCode: number;
    error?: string;
}

// Token management
const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

export const getAccessToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setTokens = (accessToken: string, refreshToken: string): void => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearTokens = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Refresh the access token using refresh token
 * Returns true if refresh was successful, false otherwise
 */
async function refreshAccessToken(): Promise<boolean> {
    // If already refreshing, wait for that to complete
    if (isRefreshing && refreshPromise) {
        return refreshPromise;
    }

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        return false;
    }

    isRefreshing = true;

    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({refreshToken}),
            });

            if (!response.ok) {
                clearTokens();
                return false;
            }

            const data = await response.json();
            if (data.accessToken && data.refreshToken) {
                setTokens(data.accessToken, data.refreshToken);
                return true;
            }

            return false;
        } catch {
            clearTokens();
            return false;
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

/**
 * API request helper with automatic token refresh
 */
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    retry = true
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Add auth token if available
    const token = getAccessToken();
    if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401 && retry && !endpoint.includes('/auth/refresh')) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            // Retry the original request with new token
            return apiRequest<T>(endpoint, options, false);
        }
        // Refresh failed, redirect to login
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        throw {message: 'Session expired. Please login again.', statusCode: 401};
    }

    const data = await response.json();

    if (!response.ok) {
        throw data as ApiError;
    }

    return data as T;
}

// Auth API functions
export const authApi = {
    /**
     * Register a new user
     */
    signup: async (email: string, password: string, name: string): Promise<AuthResponse> => {
        return apiRequest<AuthResponse>('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({email, password, name}),
        });
    },

    /**
     * Verify email with OTP
     */
    verifyOtp: async (email: string, otp: string): Promise<AuthResponse> => {
        return apiRequest<AuthResponse>('/auth/verify-otp', {
            method: 'POST',
            body: JSON.stringify({email, otp}),
        });
    },

    /**
     * Resend OTP
     */
    resendOtp: async (email: string): Promise<AuthResponse> => {
        return apiRequest<AuthResponse>('/auth/resend-otp', {
            method: 'POST',
            body: JSON.stringify({email}),
        });
    },

    /**
     * Login with email and password
     */
    login: async (email: string, password: string): Promise<AuthResponse> => {
        const response = await apiRequest<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({email, password}),
        });

        // Store tokens on successful login
        if (response.accessToken && response.refreshToken) {
            setTokens(response.accessToken, response.refreshToken);
        }

        return response;
    },

    /**
     * Refresh access token manually
     */
    refreshTokens: async (): Promise<AuthResponse> => {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
            throw {message: 'No refresh token available', statusCode: 401};
        }

        const response = await apiRequest<AuthResponse>('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({refreshToken}),
        }, false); // Don't retry refresh calls

        // Update tokens
        if (response.accessToken && response.refreshToken) {
            setTokens(response.accessToken, response.refreshToken);
        }

        return response;
    },

    /**
     * Get current user profile
     */
    getProfile: async (): Promise<User> => {
        return apiRequest<User>('/auth/me');
    },

    /**
     * Logout
     */
    logout: async (): Promise<void> => {
        const refreshToken = getRefreshToken();
        if (refreshToken) {
            try {
                await apiRequest<AuthResponse>('/auth/logout', {
                    method: 'POST',
                    body: JSON.stringify({refreshToken}),
                }, false);
            } catch {
                // Ignore logout errors
            }
        }
        clearTokens();
    },
};

export default authApi;
