import {Injectable, Logger} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {Prisma} from '@prisma/client';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(private prismaService: PrismaService) {
    }

    async createMessage(senderId: string, receiverId: string, content: string) {
        const message = await this.prismaService.message.create({
            data: {
                senderId,
                receiverId,
                content,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                receiver: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        this.logger.log(`Message created: ${senderId} -> ${receiverId}`);
        return message;
    }

    async getConversation(userId1: string, userId2: string, page = 1, limit = 50) {
        const skip = (page - 1) * limit;

        const messages = await this.prismaService.message.findMany({
            where: {
                OR: [
                    {senderId: userId1, receiverId: userId2},
                    {senderId: userId2, receiverId: userId1},
                ],
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {createdAt: 'desc'},
            skip,
            take: limit,
        });

        return messages.reverse(); // Return in chronological order
    }

    async getUserConversations(userId: string) {
        const conversations = await this.prismaService.$queryRaw<
            Array<{
                partnerId: string;
                partnerName: string;
                partnerEmail: string;
                lastMessage: string | null;
                lastMessageAt: Date | null;
                unreadCount: number;
            }>
        >(Prisma.sql`
            WITH Base AS (SELECT m.*,
                                 CASE
                                     WHEN m."senderId" = ${userId} THEN m."receiverId"
                                     ELSE m."senderId"
                                     END AS "partnerId"
                          FROM "messages" m
                          WHERE m."senderId" = ${userId}
                             OR m."receiverId" = ${userId}),
                 ConversationPartners AS (SELECT DISTINCT "partnerId"
                                          FROM Base),
                 LastMessages AS (SELECT DISTINCT
            ON ("partnerId")
                "partnerId",
                content AS "lastMessage",
                "createdAt" AS "lastMessageAt"
            FROM Base
            ORDER BY "partnerId", "createdAt" DESC
                ),
                UnreadCounts AS (
            SELECT
                "senderId" AS "partnerId", COUNT (*):: int AS "unreadCount"
            FROM "messages"
            WHERE "receiverId" = ${userId} AND "isRead" = false
            GROUP BY "senderId"
                )
            SELECT u.id                          AS "partnerId",
                   u.name                        AS "partnerName",
                   u.email                       AS "partnerEmail",
                   lm."lastMessage",
                   lm."lastMessageAt",
                   COALESCE(uc."unreadCount", 0) AS "unreadCount"
            FROM ConversationPartners cp
                     JOIN "users" u ON u.id = cp."partnerId"
                     LEFT JOIN LastMessages lm ON lm."partnerId" = cp."partnerId"
                     LEFT JOIN UnreadCounts uc ON uc."partnerId" = cp."partnerId"
            ORDER BY lm."lastMessageAt" DESC NULLS LAST
        `);

        return conversations;
    }

    async markMessagesAsRead(senderId: string, receiverId: string) {
        await this.prismaService.message.updateMany({
            where: {
                senderId,
                receiverId,
                isRead: false,
            },
            data: {
                isRead: true,
            },
        });

        this.logger.log(`Messages marked as read: ${senderId} -> ${receiverId}`);
    }

    async setUserOnline(userId: string, isOnline: boolean) {
        await this.prismaService.user.update({
            where: {id: userId},
            data: {
                isOnline,
                lastSeen: new Date(),
            },
        });
    }

    async getAllUsers(currentUserId: string) {
        return this.prismaService.user.findMany({
            where: {
                isVerified: true,
                id: {not: currentUserId},
            },
            select: {
                id: true,
                name: true,
                email: true,
                isOnline: true,
                lastSeen: true,
            },
            orderBy: [
                {isOnline: 'desc'},
                {name: 'asc'},
            ],
        });
    }

    async getUnreadCount(userId: string) {
        return this.prismaService.message.count({
            where: {
                receiverId: userId,
                isRead: false,
            },
        });
    }
}
