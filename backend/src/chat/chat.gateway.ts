import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
    userId: string;
    userEmail: string;
}

@WebSocketGateway({
    cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true,
    },
    namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);
    private connectedUsers = new Map<string, string>(); // userId -> socketId

    constructor(
        private jwtService: JwtService,
        private configService: ConfigService,
        private chatService: ChatService,
    ) {
    }

    async handleConnection(client: Socket) {
        try {
            const token = this.extractToken(client);
            if (!token) {
                throw new UnauthorizedException('No token provided');
            }

            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
            });

            const authenticatedClient = client as AuthenticatedSocket;
            authenticatedClient.userId = payload.sub;
            authenticatedClient.userEmail = payload.email;

            // Store connection
            this.connectedUsers.set(payload.sub, client.id);

            // Update user online status
            await this.chatService.setUserOnline(payload.sub, true);

            // Join personal room for direct messages
            client.join(`user:${payload.sub}`);

            // Notify other users about online status
            this.server.emit('userOnline', { userId: payload.sub });

            this.logger.log(`User connected: ${payload.email} (${payload.sub})`);
        } catch {
            this.logger.warn(`Connection rejected: Invalid token`);
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket) {
        const authenticatedClient = client as AuthenticatedSocket;
        if (authenticatedClient.userId) {
            this.connectedUsers.delete(authenticatedClient.userId);

            // Update user offline status
            await this.chatService.setUserOnline(authenticatedClient.userId, false);

            // Notify other users about offline status
            this.server.emit('userOffline', { userId: authenticatedClient.userId });

            this.logger.log(`User disconnected: ${authenticatedClient.userEmail}`);
        }
    }

    @SubscribeMessage('sendMessage')
    async handleSendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { receiverId: string; content: string },
    ) {
        const authenticatedClient = client as AuthenticatedSocket;
        const senderId = authenticatedClient.userId;

        if (!data.receiverId || !data.content?.trim()) {
            return { error: 'Invalid message data' };
        }

        // Save message to database (status: SENT)
        const message = await this.chatService.createMessage(
            senderId,
            data.receiverId,
            data.content.trim(),
        );

        // Check if receiver is online
        const isReceiverOnline = this.connectedUsers.has(data.receiverId);

        // Send to receiver if online
        if (isReceiverOnline) {
            this.server.to(`user:${data.receiverId}`).emit('newMessage', message);
        }

        // Send back to sender for confirmation (with SENT status)
        client.emit('messageSent', message);

        return { success: true, message };
    }

    @SubscribeMessage('confirmDelivery')
    async handleConfirmDelivery(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { messageId: string; senderId: string },
    ) {
        const authenticatedClient = client as AuthenticatedSocket;

        // Mark message as delivered
        await this.chatService.markMessagesAsDelivered(data.senderId, authenticatedClient.userId);

        // Notify sender about delivery status
        this.server.to(`user:${data.senderId}`).emit('messageStatusUpdated', {
            senderId: data.senderId,
            receiverId: authenticatedClient.userId,
            status: 'DELIVERED',
        });

        return { success: true };
    }

    @SubscribeMessage('typing')
    handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { receiverId: string; isTyping: boolean },
    ) {
        const authenticatedClient = client as AuthenticatedSocket;

        // Notify the receiver about typing status
        this.server.to(`user:${data.receiverId}`).emit('userTyping', {
            userId: authenticatedClient.userId,
            isTyping: data.isTyping,
        });
    }

    @SubscribeMessage('markAsRead')
    async handleMarkAsRead(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { senderId: string },
    ) {
        const authenticatedClient = client as AuthenticatedSocket;

        // Mark all messages from sender as read
        const count = await this.chatService.markMessagesAsRead(data.senderId, authenticatedClient.userId);

        // Notify sender about read status
        if (count > 0) {
            this.server.to(`user:${data.senderId}`).emit('messageStatusUpdated', {
                senderId: data.senderId,
                receiverId: authenticatedClient.userId,
                status: 'READ',
            });
        }

        return { success: true };
    }

    @SubscribeMessage('getOnlineUsers')
    async handleGetOnlineUsers() {
        const onlineUserIds = Array.from(this.connectedUsers.keys());
        return { onlineUsers: onlineUserIds };
    }

    private extractToken(client: Socket): string | null {
        const authHeader = client.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        // Also check query params for fallback
        return client.handshake.auth?.token || null;
    }
}

