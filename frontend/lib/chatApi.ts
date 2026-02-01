import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface ChatUser {
    id: string;
    name: string;
    email: string;
    isOnline?: boolean;
    lastSeen?: string;
}

export interface Message {
    id: string;
    content: string;
    senderId: string;
    receiverId: string;
    status: 'SENT' | 'DELIVERED' | 'READ';
    createdAt: string;
    isDeleted?: boolean;
    sender?: {
        id: string;
        name: string;
        email: string;
    };
}

export interface Conversation {
    partnerId: string;
    partnerName: string;
    partnerEmail: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
}

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(): Promise<boolean> {
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
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
 * API request helper with auto token refresh
 */
async function chatRequest<T>(
    endpoint: string,
    options?: { method?: string; retry?: boolean }
): Promise<T> {
    const retry = options?.retry !== false;
    const method = options?.method || 'GET';

    const token = getAccessToken();
    if (!token) {
        throw { message: 'Not authenticated', statusCode: 401 };
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });

    // Handle 401 - try to refresh token
    if (response.status === 401 && retry) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            return chatRequest<T>(endpoint, { ...options, retry: false });
        }
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        throw { message: 'Session expired', statusCode: 401 };
    }

    const data = await response.json();

    if (!response.ok) {
        throw data;
    }

    return data as T;
}

// Chat API functions
export const chatApi = {
    /**
     * Get all users for contacts list
     */
    getUsers: async (): Promise<ChatUser[]> => {
        return chatRequest<ChatUser[]>('/chat/users');
    },

    /**
     * Get list of conversations
     */
    getConversations: async (): Promise<Conversation[]> => {
        return chatRequest<Conversation[]>('/chat/conversations');
    },

    /**
     * Get messages for a specific conversation
     */
    getMessages: async (partnerId: string, page = 1): Promise<Message[]> => {
        return chatRequest<Message[]>(`/chat/messages?partnerId=${partnerId}&page=${page}`);
    },

    /**
     * Get unread message count
     */
    getUnreadCount: async (): Promise<{ unreadCount: number }> => {
        return chatRequest<{ unreadCount: number }>('/chat/unread');
    },

    /**
     * Get list of blocked users
     */
    getBlockedUsers: async (): Promise<ChatUser[]> => {
        return chatRequest<ChatUser[]>('/chat/blocked');
    },

    /**
     * Block a user
     */
    blockUser: async (userId: string): Promise<{ message: string }> => {
        return chatRequest<{ message: string }>(`/chat/block/${userId}`, { method: 'POST' });
    },

    /**
     * Unblock a user
     */
    unblockUser: async (userId: string): Promise<{ message: string }> => {
        return chatRequest<{ message: string }>(`/chat/block/${userId}`, { method: 'DELETE' });
    },
};

export default chatApi;
