'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { chatApi, ChatUser, Conversation, Message } from '../../lib/chatApi';
import { socketService } from '../../lib/socket';
import { authApi } from '../../lib/api';
import { fileUploadService, UploadProgress } from '../../lib/fileUpload';

export default function ChatPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();

    // State
    const [users, setUsers] = useState<ChatUser[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [isTyping, setIsTyping] = useState<string | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [showContacts, setShowContacts] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
    const [blockError, setBlockError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // File upload state
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Load users and conversations
    const loadData = useCallback(async () => {
        try {
            const [usersData, conversationsData, blockedData] = await Promise.all([
                chatApi.getUsers(),
                chatApi.getConversations(),
                chatApi.getBlockedUsers(),
            ]);
            setUsers(usersData);
            setConversations(conversationsData);
            setBlockedUsers(new Set(blockedData.map(u => u.id)));
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }, []);

    // Load messages for selected user
    const loadMessages = useCallback(async (partnerId: string) => {
        setLoadingMessages(true);
        try {
            const messagesData = await chatApi.getMessages(partnerId);
            setMessages(messagesData);
            setTimeout(scrollToBottom, 100);
            // Mark messages as read
            socketService.markAsRead(partnerId);
            // Refresh conversations to update unread counts
            setTimeout(() => loadData(), 500);
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            setLoadingMessages(false);
        }
    }, [loadData]);

    // Select a user to chat with
    const selectUser = useCallback((chatUser: ChatUser) => {
        setSelectedUser(chatUser);
        setShowContacts(false);
        loadMessages(chatUser.id);
    }, [loadMessages]);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    // Initialize socket and load data
    useEffect(() => {
        if (!user) return;

        // Connect to socket
        socketService.connect();

        // Load initial data
        loadData();

        // Socket event handlers
        const handleNewMessage = (data: any) => {
            const message = data as Message;
            setMessages((prev) => {
                // Check if message already exists
                if (prev.some((m) => m.id === message.id)) return prev;
                return [...prev, message];
            });
            setTimeout(scrollToBottom, 100);
            loadData(); // Refresh conversations

            // Confirm delivery to sender
            socketService.confirmDelivery(message.id, message.senderId);
        };

        const handleMessageSent = (data: any) => {
            const message = data as Message;
            setMessages((prev) => {
                if (prev.some((m) => m.id === message.id)) return prev;
                return [...prev, message];
            });
            setTimeout(scrollToBottom, 100);
            loadData();
        };

        const handleUserTyping = (data: any) => {
            const { userId, isTyping: typing } = data as { userId: string; isTyping: boolean };
            setIsTyping(typing ? userId : null);
        };

        const handleUserOnline = (data: any) => {
            const { userId } = data as { userId: string };
            setOnlineUsers((prev) => new Set([...prev, userId]));
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isOnline: true } : u)));
        };

        const handleUserOffline = (data: any) => {
            const { userId } = data as { userId: string };
            setOnlineUsers((prev) => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isOnline: false } : u)));
        };

        // Handle message status updates (DELIVERED, READ)
        const handleMessageStatusUpdated = (data: any) => {
            const { senderId, receiverId, status } = data as {
                senderId: string;
                receiverId: string;
                status: 'DELIVERED' | 'READ'
            };
            const statusOrder = { 'SENT': 0, 'DELIVERED': 1, 'READ': 2 };

            setMessages((prev) => prev.map((m) => {
                // Only update messages from this sender to this receiver
                if (m.senderId === senderId && m.receiverId === receiverId) {
                    // Only upgrade status, never downgrade (e.g., don't go from READ back to DELIVERED)
                    const currentStatusOrder = statusOrder[m.status] || 0;
                    const newStatusOrder = statusOrder[status] || 0;
                    if (newStatusOrder > currentStatusOrder) {
                        return { ...m, status };
                    }
                }
                return m;
            }));
        };

        // Handle message deleted
        const handleMessageDeleted = (data: unknown) => {
            const { messageId } = data as { messageId: string };
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === messageId
                        ? { ...m, content: 'This message was deleted.', isDeleted: true }
                        : m
                )
            );
        };

        socketService.on('newMessage', handleNewMessage);
        socketService.on('messageSent', handleMessageSent);
        socketService.on('userTyping', handleUserTyping);
        socketService.on('userOnline', handleUserOnline);
        socketService.on('userOffline', handleUserOffline);
        socketService.on('messageStatusUpdated', handleMessageStatusUpdated);
        socketService.on('messageDeleted', handleMessageDeleted);

        return () => {
            socketService.off('newMessage', handleNewMessage);
            socketService.off('messageSent', handleMessageSent);
            socketService.off('userTyping', handleUserTyping);
            socketService.off('userOnline', handleUserOnline);
            socketService.off('userOffline', handleUserOffline);
            socketService.off('messageStatusUpdated', handleMessageStatusUpdated);
            socketService.off('messageDeleted', handleMessageDeleted);
            socketService.disconnect();
        };
    }, [user, loadData]);

    // Handle sending message
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedUser) return;

        socketService.sendMessage(selectedUser.id, newMessage.trim(), (response: { error?: string }) => {
            if (response?.error) {
                setBlockError('You cannot send messages to this user. They may have blocked you.');
                setTimeout(() => setBlockError(null), 4000);
            }
        });
        setNewMessage('');

        // Stop typing indicator
        socketService.sendTyping(selectedUser.id, false);
    };

    // Handle typing
    const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewMessage(e.target.value);

        if (!selectedUser) return;

        // Send typing indicator
        socketService.sendTyping(selectedUser.id, true);

        // Clear existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Stop typing after 2 seconds of inactivity
        typingTimeoutRef.current = setTimeout(() => {
            socketService.sendTyping(selectedUser.id, false);
        }, 2000);
    };

    const handleLogout = async () => {
        socketService.disconnect();
        await logout();
        router.push('/login');
    };

    // Handle message delete
    const handleDeleteMessage = (messageId: string) => {
        socketService.deleteMessage(messageId);
        setContextMenu(null);
    };

    // Handle right-click on message
    const handleContextMenu = (e: React.MouseEvent, messageId: string, isSender: boolean) => {
        if (!isSender) return; // Only allow deleting own messages
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, messageId });
    };

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener('click', handleClick);
            return () => document.removeEventListener('click', handleClick);
        }
    }, [contextMenu]);

    // Handle delete account
    const handleDeleteAccount = async () => {
        try {
            socketService.disconnect();
            await authApi.deleteAccount();
            router.push('/login');
        } catch (error) {
            console.error('Failed to delete account:', error);
        }
    };

    // Handle block user
    const handleBlockUser = async (userId: string) => {
        try {
            await chatApi.blockUser(userId);
            setBlockedUsers(prev => new Set(prev).add(userId));
        } catch (error) {
            console.error('Failed to block user:', error);
        }
    };

    // Handle unblock user
    const handleUnblockUser = async (userId: string) => {
        try {
            await chatApi.unblockUser(userId);
            setBlockedUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
        } catch (error) {
            console.error('Failed to unblock user:', error);
        }
    };

    // Handle file upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedUser) return;

        // Check file size (3GB max)
        if (file.size > 3 * 1024 * 1024 * 1024) {
            alert('File size exceeds 3GB limit');
            return;
        }

        try {
            const result = await fileUploadService.uploadFile(file, (progress) => {
                setUploadProgress(progress);
            });

            console.log('File upload complete, result:', result);

            // Send file message
            const messageContent = `📎 ${file.name} (${fileUploadService.formatFileSize(file.size)}) [FILE:${result.fileId}] ⚠️ Expires in 2 days`;
            console.log('Sending file message:', messageContent);

            socketService.sendMessage(
                selectedUser.id,
                messageContent,
                (response: { error?: string }) => {
                    console.log('Socket sendMessage response:', response);
                    if (response?.error) {
                        console.error('Failed to send file message:', response.error);
                    }
                }
            );

            setUploadProgress(null);
        } catch (error) {
            console.error('File upload failed:', error);
            setUploadProgress(null);
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Filter users based on search (by name only)
    const filteredUsers = useMemo(() => {
        if (!searchQuery.trim()) return users;
        const query = searchQuery.toLowerCase().trim();
        return users.filter(u => u.name.toLowerCase().includes(query));
    }, [users, searchQuery]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--telegram-bg)] flex items-center justify-center">
                <div
                    className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--telegram-primary)]"></div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    // Format time
    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Render message content (handles file links)
    const renderMessageContent = (content: string, isDeleted: boolean) => {
        if (isDeleted) {
            return <span className="text-gray-400 italic">{content}</span>;
        }

        // Check for file pattern: [FILE:uuid]
        const fileMatch = content.match(/\[FILE:([a-f0-9-]+)\]/i);
        if (fileMatch) {
            const fileId = fileMatch[1];
            // Extract filename and size from the message
            const filenameMatch = content.match(/📎\s*(.+?)\s*\(/);
            const sizeMatch = content.match(/\(([^)]+)\)/);
            const filename = filenameMatch ? filenameMatch[1] : 'File';
            const size = sizeMatch ? sizeMatch[1] : '';

            const handleDownload = async () => {
                try {
                    const token = localStorage.getItem('accessToken');
                    const downloadUrl = fileUploadService.getDownloadUrl(fileId);

                    const response = await fetch(downloadUrl, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });

                    if (!response.ok) {
                        throw new Error('Download failed');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                } catch (error) {
                    console.error('Download failed:', error);
                    alert('Failed to download file. It may have expired.');
                }
            };

            return (
                <div className="flex flex-col gap-2">
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-3 p-3 bg-black/10 rounded-xl hover:bg-black/20 transition-colors cursor-pointer text-left"
                    >
                        <div className="w-12 h-12 bg-[var(--telegram-primary)] rounded-xl flex items-center justify-center text-white text-xl">
                            📎
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[var(--foreground)] font-medium truncate">{filename}</p>
                            <p className="text-xs text-[var(--telegram-gray)]">{size}</p>
                        </div>
                        <svg className="w-6 h-6 text-[var(--telegram-primary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </button>
                    <p className="text-xs text-orange-400">⚠️ Expires in 2 days</p>
                </div>
            );
        }

        // Regular text message
        return <span>{content}</span>;
    };


    return (
        <div className="h-screen bg-[var(--telegram-bg)] flex overflow-hidden font-sans">
            {/* Block Error Toast */}
            {blockError && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-pulse">
                    <div className="bg-red-500 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        <span className="font-medium">{blockError}</span>
                    </div>
                </div>
            )}
            {/* Sidebar (Left Column) */}
            <div
                className={`${showContacts ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-[420px] bg-[var(--telegram-surface)] border-r border-[var(--telegram-border)] mobile-view-transition`}>
                {/* Sidebar Header / Search */}
                <div className="p-3">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-[var(--telegram-input-bg)] rounded-full text-[var(--foreground)] placeholder-[var(--telegram-gray)] outline-none focus:ring-1 focus:ring-[var(--telegram-primary)] transition-all"
                        />
                        <svg className="w-5 h-5 text-[var(--telegram-gray)] absolute left-3 top-2.5" fill="none"
                            stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {/* User List */}
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {filteredUsers.length === 0 ? (
                        <div className="p-4 text-center text-[var(--telegram-gray)]">
                            No users found
                        </div>
                    ) : (
                        filteredUsers.map((chatUser) => {
                            const conversation = conversations.find((c) => c.partnerId === chatUser.id);
                            const isOnline = onlineUsers.has(chatUser.id) || chatUser.isOnline;
                            const isSelected = selectedUser?.id === chatUser.id;

                            return (
                                <button
                                    key={chatUser.id}
                                    onClick={() => selectUser(chatUser)}
                                    className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-[var(--telegram-hover)] transition-colors ${isSelected ? 'bg-[var(--telegram-primary)] hover:bg-[var(--telegram-primary)]' : ''}`}
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div
                                            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white bg-gradient-to-br from-blue-400 to-blue-600`}>
                                            {chatUser.name.charAt(0).toUpperCase()}
                                        </div>
                                        {isOnline && (
                                            <div
                                                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[var(--telegram-surface)]"></div>
                                        )}
                                    </div>

                                    {/* User Info */}
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="flex items-center justify-between">
                                            <span
                                                className={`font-medium truncate ${isSelected ? 'text-white' : 'text-[var(--foreground)]'}`}>
                                                {chatUser.name}
                                            </span>
                                            {conversation?.lastMessageAt && (
                                                <span
                                                    className={`text-xs ${isSelected ? 'text-white/80' : 'text-[var(--telegram-gray)]'}`}>
                                                    {/* Simple date formatting required here if needed */}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm truncate pr-2 ${isSelected ? 'text-white/80' : 'text-[var(--telegram-gray)]'}`}>
                                                {isTyping === chatUser.id ? 'Typing...' : (conversation?.lastMessage || 'No messages yet')}
                                            </p>
                                            {conversation?.unreadCount ? (
                                                <span
                                                    className={`flex-shrink-0 px-2 min-w-[1.25rem] h-5 flex items-center justify-center text-xs font-bold rounded-full ${isSelected ? 'bg-white text-[var(--telegram-primary)]' : 'bg-[var(--telegram-gray)] text-white'}`}>
                                                    {conversation.unreadCount}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Profile & Logout Section */}
                <div className="p-3 border-t border-[var(--telegram-border)] bg-[var(--telegram-surface)]">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                                className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold shadow-md">
                                {user.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.name || 'User'}</p>
                                <p className="text-xs text-[var(--telegram-gray)] truncate">{user.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-600 transition-colors group"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span className="text-xs font-medium hidden sm:inline">Logout</span>
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
                            title="Delete Account"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Delete Account Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-[var(--telegram-surface)] rounded-2xl p-6 max-w-sm w-full shadow-xl">
                            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Delete Account?</h3>
                            <p className="text-sm text-[var(--telegram-gray)] mb-4">
                                This action cannot be undone. All your messages and data will be permanently deleted.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="px-4 py-2 rounded-lg bg-[var(--telegram-hover)] text-[var(--foreground)] hover:bg-[var(--telegram-border)] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteAccount}
                                    className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Chat Area (Right Column) */}
            <div
                className={`${!showContacts && selectedUser ? 'flex' : 'hidden md:flex'} flex-col flex-1 bg-[var(--telegram-bg)] relative z-0 mobile-view-transition`}>
                {selectedUser ? (
                    <>
                        {/* Chat Header */}
                        <div
                            className="px-5 py-2 bg-[var(--telegram-surface)] border-b border-[var(--telegram-border)] flex items-center justify-between shadow-sm z-10">
                            <div className="flex items-center gap-4 cursor-pointer">
                                <button
                                    onClick={() => setShowContacts(true)}
                                    className="md:hidden -ml-2 p-2 hover:bg-[var(--telegram-hover)] rounded-full text-[var(--telegram-gray)]"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <div>
                                    <h3 className="font-semibold text-[var(--foreground)] text-lg leading-tight">
                                        {selectedUser.name}
                                    </h3>
                                    <p className="text-sm text-[var(--telegram-gray)]">
                                        {blockedUsers.has(selectedUser.id) ? (
                                            <span className="text-red-500">Blocked</span>
                                        ) : isTyping === selectedUser.id ? (
                                            <span className="text-[var(--telegram-primary)]">typing...</span>
                                        ) : onlineUsers.has(selectedUser.id) || selectedUser.isOnline ? (
                                            <span className="text-blue-500">Online</span>
                                        ) : (
                                            'Last seen recently'
                                        )}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => blockedUsers.has(selectedUser.id)
                                    ? handleUnblockUser(selectedUser.id)
                                    : handleBlockUser(selectedUser.id)
                                }
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${blockedUsers.has(selectedUser.id)
                                    ? 'bg-green-500/10 hover:bg-green-500/20 text-green-500 hover:text-green-600'
                                    : 'bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-600'
                                    }`}
                                title={blockedUsers.has(selectedUser.id) ? 'Unblock User' : 'Block User'}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {blockedUsers.has(selectedUser.id) ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    )}
                                </svg>
                                <span className="hidden sm:inline text-xs font-medium">
                                    {blockedUsers.has(selectedUser.id) ? 'Unblock' : 'Block'}
                                </span>
                            </button>

                        </div>

                        {/* Messages */}
                        <div
                            className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('/bg-telegram.png')] bg-repeat bg-[length:400px]">
                            {/* Note: bg-pattern can be added if asset exists, otherwise plain color */}
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-full">
                                    <div
                                        className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--telegram-primary)]"></div>
                                </div>
                            ) : messages.length === 0 ? (
                                <div
                                    className="flex flex-col items-center justify-center h-full text-[var(--telegram-gray)] opacity-60">
                                    <div
                                        className="w-32 h-32 bg-[var(--telegram-primary)]/10 rounded-full flex items-center justify-center mb-4">
                                        <svg className="w-16 h-16 text-[var(--telegram-primary)]" fill="none"
                                            stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                    </div>
                                    <p className="text-lg font-medium">No messages yet...</p>
                                    <p className="text-sm">Send a message to start the conversation!</p>
                                </div>
                            ) : (
                                messages.map((message) => {
                                    const isSender = message.senderId === user.id;
                                    return (
                                        <div
                                            key={message.id}
                                            className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[70%] sm:max-w-[500px] px-4 py-2 rounded-2xl shadow-sm relative ${isSender
                                                    ? 'bg-[var(--bubble-out)] rounded-br-sm'
                                                    : 'bg-[var(--bubble-in)] rounded-bl-sm'
                                                    } ${isSender && !message.isDeleted ? 'cursor-pointer' : ''}`}
                                                onContextMenu={(e) => handleContextMenu(e, message.id, isSender && !message.isDeleted)}
                                            >
                                                <div className={`leading-relaxed text-[15px] whitespace-pre-wrap ${message.isDeleted ? 'text-gray-400 italic' : 'text-[var(--foreground)]'}`}>{renderMessageContent(message.content, !!message.isDeleted)}</div>
                                                <div
                                                    className={`flex justify-end mt-1 space-x-1 items-center select-none`}>
                                                    <span
                                                        className={`text-[11px] ${isSender ? 'text-white/60' : 'text-gray-400'}`}>
                                                        {formatTime(message.createdAt)}
                                                    </span>
                                                    {isSender && !message.isDeleted && (
                                                        <span
                                                            className={`ml-1 flex items-center ${message.status === 'READ' ? 'text-blue-500' : 'text-gray-400'}`}>
                                                            {message.status === 'SENT' ? (
                                                                /* Single check - Sent */
                                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
                                                                    xmlns="http://www.w3.org/2000/svg">
                                                                    <path d="M5 13l4 4L19 7" stroke="currentColor"
                                                                        strokeWidth="2" strokeLinecap="round"
                                                                        strokeLinejoin="round" />
                                                                </svg>
                                                            ) : (
                                                                /* Double check - Delivered or Read */
                                                                <svg className="w-5 h-4" viewBox="0 0 24 24" fill="none"
                                                                    xmlns="http://www.w3.org/2000/svg">
                                                                    <path d="M2 13l4 4L16 7" stroke="currentColor"
                                                                        strokeWidth="2" strokeLinecap="round"
                                                                        strokeLinejoin="round" />
                                                                    <path d="M8 13l4 4L22 7" stroke="currentColor"
                                                                        strokeWidth="2" strokeLinecap="round"
                                                                        strokeLinejoin="round" />
                                                                </svg>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />

                            {/* Context Menu for Delete */}
                            {contextMenu && (
                                <div
                                    className="fixed z-50 bg-[var(--telegram-surface)] rounded-lg shadow-lg border border-[var(--telegram-border)] py-1 min-w-[120px]"
                                    style={{ top: contextMenu.y, left: contextMenu.x - 130 }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        onClick={() => handleDeleteMessage(contextMenu.messageId)}
                                        className="w-full px-4 py-2 text-left text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-[var(--telegram-surface)] border-t border-[var(--telegram-border)]">
                            {blockedUsers.has(selectedUser.id) ? (
                                <div className="max-w-4xl mx-auto text-center py-3 text-red-500 bg-red-500/10 rounded-2xl">
                                    <p className="text-sm font-medium">You have blocked this user. Unblock to send messages.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Upload Progress */}
                                    {uploadProgress && (
                                        <div className="max-w-4xl mx-auto mb-3 p-3 bg-[var(--telegram-bg)] rounded-xl">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{fileUploadService.getFileIcon(uploadProgress.filename)}</span>
                                                    <span className="text-sm text-[var(--foreground)] truncate max-w-[200px]">{uploadProgress.filename}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-[var(--telegram-gray)]">{uploadProgress.percentage}%</span>
                                                    {uploadProgress.status === 'uploading' && (
                                                        <button
                                                            onClick={() => fileUploadService.pauseUpload(uploadProgress.transferId)}
                                                            className="p-1 hover:bg-[var(--telegram-hover)] rounded"
                                                        >
                                                            <svg className="w-4 h-4 text-[var(--telegram-gray)]" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    {uploadProgress.status === 'paused' && (
                                                        <button
                                                            onClick={() => fileUploadService.resumePausedUpload(uploadProgress.transferId)}
                                                            className="p-1 hover:bg-[var(--telegram-hover)] rounded"
                                                        >
                                                            <svg className="w-4 h-4 text-[var(--telegram-primary)]" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M8 5v14l11-7z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            fileUploadService.cancelUpload(uploadProgress.transferId);
                                                            setUploadProgress(null);
                                                        }}
                                                        className="p-1 hover:bg-red-500/10 rounded"
                                                    >
                                                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="w-full bg-[var(--telegram-border)] rounded-full h-1.5">
                                                <div
                                                    className="bg-[var(--telegram-primary)] h-1.5 rounded-full transition-all duration-300"
                                                    style={{ width: `${uploadProgress.percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-2">
                                        {/* Hidden file input */}
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                            accept="video/*,image/*,.zip,.rar,.7z,.pdf,.doc,.docx"
                                        />
                                        {/* Attachment button */}
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={!!uploadProgress}
                                            className="p-3 rounded-full hover:bg-[var(--telegram-hover)] transition-colors text-[var(--telegram-gray)] hover:text-[var(--telegram-primary)] disabled:opacity-50"
                                            title="Attach file (max 3GB, expires in 2 days)"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                            </svg>
                                        </button>
                                        <div
                                            className="flex-1 bg-[var(--telegram-bg)] rounded-2xl flex items-center px-4 py-2 border border-transparent focus-within:border-[var(--telegram-primary)] focus-within:bg-[var(--telegram-surface)] transition-all">
                                            <input
                                                type="text"
                                                value={newMessage}
                                                onChange={handleTyping}
                                                placeholder="Write a message..."
                                                className="w-full bg-transparent border-none outline-none text-[var(--foreground)] placeholder-[var(--telegram-gray)] max-h-32 py-2"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!newMessage.trim()}
                                            className={`p-3 rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-lg ${newMessage.trim() ? 'bg-[var(--telegram-primary)] text-white hover:opacity-90' : 'bg-[var(--telegram-gray)]/30 text-[var(--telegram-gray)] cursor-not-allowed'}`}
                                        >
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                            </svg>
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    /* Empty State */
                    <div className="flex items-center justify-center h-full bg-[var(--telegram-bg)]">
                        <div
                            className="text-center p-8 bg-[var(--telegram-surface)] rounded-2xl shadow-sm border border-[var(--telegram-border)] max-w-sm mx-4">
                            <div
                                className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                                <span className="text-3xl">👋</span>
                            </div>
                            <h2 className="text-xl font-medium text-[var(--foreground)] mb-2">Welcome to MareenChat</h2>
                            <p className="text-[var(--telegram-gray)] text-sm">
                                Select a chat from the left menu to start messaging.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
