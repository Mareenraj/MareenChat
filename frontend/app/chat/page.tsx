'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { chatApi, ChatUser, Message, Conversation } from '../../lib/chatApi';
import { socketService } from '../../lib/socket';

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

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Load users and conversations
    const loadData = useCallback(async () => {
        try {
            const [usersData, conversationsData] = await Promise.all([
                chatApi.getUsers(),
                chatApi.getConversations(),
            ]);
            setUsers(usersData);
            setConversations(conversationsData);
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
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            setLoadingMessages(false);
        }
    }, []);

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

        socketService.on('newMessage', handleNewMessage);
        socketService.on('messageSent', handleMessageSent);
        socketService.on('userTyping', handleUserTyping);
        socketService.on('userOnline', handleUserOnline);
        socketService.on('userOffline', handleUserOffline);

        return () => {
            socketService.off('newMessage', handleNewMessage);
            socketService.off('messageSent', handleMessageSent);
            socketService.off('userTyping', handleUserTyping);
            socketService.off('userOnline', handleUserOnline);
            socketService.off('userOffline', handleUserOffline);
            socketService.disconnect();
        };
    }, [user, loadData]);

    // Handle sending message
    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedUser) return;

        socketService.sendMessage(selectedUser.id, newMessage.trim());
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

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--telegram-bg)] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--telegram-primary)]"></div>
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

    // Filter users based on search
    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-screen bg-[var(--telegram-bg)] flex overflow-hidden font-sans">
            {/* Sidebar (Left Column) */}
            <div className={`${showContacts ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[420px] bg-[var(--telegram-surface)] border-r border-[var(--telegram-border)]`}>
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
                        <svg className="w-5 h-5 text-[var(--telegram-gray)] absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${isSelected ? 'bg-white text-[var(--telegram-primary)]' : 'bg-gradient-to-br from-blue-400 to-blue-600'}`}>
                                            {chatUser.name.charAt(0).toUpperCase()}
                                        </div>
                                        {isOnline && (
                                            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[var(--telegram-surface)]"></div>
                                        )}
                                    </div>

                                    {/* User Info */}
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="flex items-center justify-between">
                                            <span className={`font-medium truncate ${isSelected ? 'text-white' : 'text-[var(--foreground)]'}`}>
                                                {chatUser.name}
                                            </span>
                                            {conversation?.lastMessageAt && (
                                                <span className={`text-xs ${isSelected ? 'text-white/80' : 'text-[var(--telegram-gray)]'}`}>
                                                    {/* Simple date formatting required here if needed */}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm truncate pr-2 ${isSelected ? 'text-white/80' : 'text-[var(--telegram-gray)]'}`}>
                                                {isTyping === chatUser.id ? 'Typing...' : (conversation?.lastMessage || 'No messages yet')}
                                            </p>
                                            {conversation?.unreadCount ? (
                                                <span className={`flex-shrink-0 px-2 min-w-[1.25rem] h-5 flex items-center justify-center text-xs font-bold rounded-full ${isSelected ? 'bg-white text-[var(--telegram-primary)]' : 'bg-[var(--telegram-gray)] text-white'}`}>
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

                {/* Logout Button (Moved to sidebar bottom) */}
                <div className="p-3 border-t border-[var(--telegram-border)]">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs">
                                {user.email?.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-[var(--foreground)] truncate max-w-[120px]">{user.name || user.email}</span>
                        </div>
                        <button onClick={handleLogout} className="text-red-500 hover:text-red-600 text-sm font-medium">
                            Log Out
                        </button>
                    </div>
                </div>
            </div>

            {/* Chat Area (Right Column) */}
            <div className={`${!showContacts || selectedUser ? 'flex' : 'hidden'} md:flex flex-col flex-1 bg-[var(--telegram-bg)] relative z-0`}>
                {selectedUser ? (
                    <>
                        {/* Chat Header */}
                        <div className="px-5 py-2 bg-[var(--telegram-surface)] border-b border-[var(--telegram-border)] flex items-center justify-between shadow-sm z-10">
                            <div className="flex items-center gap-4 cursor-pointer">
                                <button
                                    onClick={() => setShowContacts(true)}
                                    className="md:hidden -ml-2 p-2 hover:bg-[var(--telegram-hover)] rounded-full text-[var(--telegram-gray)]"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <div>
                                    <h3 className="font-semibold text-[var(--foreground)] text-lg leading-tight">
                                        {selectedUser.name}
                                    </h3>
                                    <p className="text-sm text-[var(--telegram-gray)]">
                                        {isTyping === selectedUser.id ? (
                                            <span className="text-[var(--telegram-primary)]">typing...</span>
                                        ) : onlineUsers.has(selectedUser.id) || selectedUser.isOnline ? (
                                            <span className="text-blue-500">Online</span>
                                        ) : (
                                            'Last seen recently'
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-[var(--telegram-gray)]">
                                <button className="p-2 hover:bg-[var(--telegram-hover)] rounded-full">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </button>
                                <button className="p-2 hover:bg-[var(--telegram-hover)] rounded-full">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('/bg-telegram.png')] bg-repeat bg-[length:400px]">
                            {/* Note: bg-pattern can be added if asset exists, otherwise plain color */}
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--telegram-primary)]"></div>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-[var(--telegram-gray)] opacity-60">
                                    <div className="w-32 h-32 bg-[var(--telegram-primary)]/10 rounded-full flex items-center justify-center mb-4">
                                        <svg className="w-16 h-16 text-[var(--telegram-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
                                                    }`}
                                            >
                                                <p className="text-[var(--foreground)] leading-relaxed text-[15px] whitespace-pre-wrap">{message.content}</p>
                                                <div className={`flex justify-end mt-1 space-x-1 items-center select-none`}>
                                                    <span className={`text-[11px] ${isSender ? 'text-green-800/70' : 'text-gray-400'}`}>
                                                        {formatTime(message.createdAt)}
                                                    </span>
                                                    {isSender && (
                                                        <span className="text-green-600">
                                                            {/* Double check icon */}
                                                            <svg className="w-3 h-3" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M10.966 0.284766L5.61602 8.51477L1.93602 5.09477L1.01102 6.08977L5.51602 10.2748L5.61602 10.3698L5.71602 10.2748L11.896 1.71477L10.966 0.284766Z" fill="currentColor" />
                                                            </svg>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-[var(--telegram-surface)] border-t border-[var(--telegram-border)]">
                            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-2">
                                <button type="button" className="p-3 text-[var(--telegram-gray)] hover:text-[var(--telegram-primary)] transition-colors rounded-full hover:bg-[var(--telegram-hover)]">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                </button>
                                <div className="flex-1 bg-[var(--telegram-bg)] rounded-2xl flex items-center px-4 py-2 border border-transparent focus-within:border-[var(--telegram-primary)] focus-within:bg-[var(--telegram-surface)] transition-all">
                                    <input
                                        type="text"
                                        value={newMessage}
                                        onChange={handleTyping}
                                        placeholder="Write a message..."
                                        className="w-full bg-transparent border-none outline-none text-[var(--foreground)] placeholder-[var(--telegram-gray)] max-h-32 py-2"
                                    />
                                </div>
                                {newMessage.trim() ? (
                                    <button
                                        type="submit"
                                        className="p-3 bg-[var(--telegram-primary)] text-white rounded-full hover:opacity-90 transition-transform transform hover:scale-105 active:scale-95 shadow-md"
                                    >
                                        <svg className="w-6 h-6 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                    </button>
                                ) : (
                                    <button type="button" className="p-3 text-[var(--telegram-gray)] hover:text-[var(--telegram-primary)] transition-colors rounded-full hover:bg-[var(--telegram-hover)]">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        </svg>
                                    </button>
                                )}
                            </form>
                        </div>
                    </>
                ) : (
                    /* Empty State */
                    <div className="flex items-center justify-center h-full bg-[var(--telegram-bg)]">
                        <div className="text-center p-8 bg-[var(--telegram-surface)] rounded-2xl shadow-sm border border-[var(--telegram-border)] max-w-sm mx-4">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
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
