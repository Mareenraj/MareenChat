import {io, Socket} from 'socket.io-client';
import {clearTokens, getAccessToken, getRefreshToken, setTokens} from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Message type
export interface Message {
    id: string;
    content: string;
    senderId: string;
    receiverId: string;
    status: 'SENT' | 'DELIVERED' | 'READ';
    createdAt: string;
    sender?: {
        id: string;
        name: string;
        email: string;
    };
}

// User type for contacts
export interface ChatUser {
    id: string;
    name: string;
    email: string;
    isOnline?: boolean;
    lastSeen?: string;
}

// Conversation type
export interface Conversation {
    partnerId: string;
    partnerName: string;
    partnerEmail: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
}

class SocketService {
    private socket: Socket | null = null;
    private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;

    /**
     * Refresh token and get new access token
     */
    private async refreshToken(): Promise<boolean> {
        const refreshToken = getRefreshToken();
        if (!refreshToken) return false;

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
        }
    }

    /**
     * Connect to the WebSocket server
     */
    connect(): Socket | null {
        const token = getAccessToken();
        if (!token) {
            console.warn('No token available for socket connection');
            return null;
        }

        if (this.socket?.connected) {
            return this.socket;
        }

        // Disconnect existing socket if any
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io(`${SOCKET_URL}/chat`, {
            auth: {token},
            extraHeaders: {
                Authorization: `Bearer ${token}`,
            },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.reconnectAttempts = 0;
            this.emitToListeners('connected');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            this.emitToListeners('disconnected', reason);
        });

        this.socket.on('connect_error', async (error) => {
            console.error('Socket connection error:', error.message);

            // If auth error, try to refresh token and reconnect
            if (error.message.includes('unauthorized') || error.message.includes('jwt')) {
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Attempting token refresh (attempt ${this.reconnectAttempts})`);

                    const refreshed = await this.refreshToken();
                    if (refreshed) {
                        // Disconnect and reconnect with new token
                        this.socket?.disconnect();
                        this.socket = null;
                        setTimeout(() => this.connect(), 1000);
                        return;
                    }
                }
                // Refresh failed, redirect to login
                if (typeof window !== 'undefined') {
                    clearTokens();
                    window.location.href = '/login';
                }
            }

            this.emitToListeners('error', error);
        });

        // Forward all events to registered listeners
        this.socket.onAny((event, ...args) => {
            this.emitToListeners(event, ...args);
        });

        return this.socket;
    }

    /**
     * Reconnect with fresh token (after token refresh)
     */
    reconnect(): Socket | null {
        this.disconnect();
        return this.connect();
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.reconnectAttempts = 0;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    /**
     * Send a message
     */
    sendMessage(receiverId: string, content: string): void {
        this.socket?.emit('sendMessage', {receiverId, content});
    }

    /**
     * Send typing indicator
     */
    sendTyping(receiverId: string, isTyping: boolean): void {
        this.socket?.emit('typing', {receiverId, isTyping});
    }

    /**
     * Mark messages as read
     */
    markAsRead(senderId: string): void {
        this.socket?.emit('markAsRead', {senderId});
    }

    /**
     * Confirm message delivery
     */
    confirmDelivery(messageId: string, senderId: string): void {
        this.socket?.emit('confirmDelivery', {messageId, senderId});
    }

    /**
     * Get online users
     */
    getOnlineUsers(): void {
        this.socket?.emit('getOnlineUsers');
    }

    /**
     * Register event listener
     */
    on(event: string, callback: (...args: unknown[]) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add(callback);
    }

    /**
     * Remove event listener
     */
    off(event: string, callback: (...args: unknown[]) => void): void {
        this.listeners.get(event)?.delete(callback);
    }

    /**
     * Emit event to all listeners
     */
    private emitToListeners(event: string, ...args: unknown[]): void {
        this.listeners.get(event)?.forEach((callback) => {
            try {
                callback(...args);
            } catch (error) {
                console.error(`Error in socket listener for ${event}:`, error);
            }
        });
    }
}

// Singleton instance
export const socketService = new SocketService();
export default socketService;
