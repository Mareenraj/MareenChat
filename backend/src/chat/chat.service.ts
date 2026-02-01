import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessageStatus, Prisma } from '@prisma/client';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private prismaService: PrismaService) { }

  async createMessage(senderId: string, receiverId: string, content: string) {
    const message = await this.prismaService.message.create({
      data: {
        senderId,
        receiverId,
        content,
        status: MessageStatus.SENT,
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

  async getConversation(
    userId1: string,
    userId2: string,
    page = 1,
    limit = 50,
  ) {
    const skip = (page - 1) * limit;

    const messages = await this.prismaService.message.findMany({
      where: {
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
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
      orderBy: { createdAt: 'desc' },
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
            WHERE "receiverId" = ${userId} AND "status" != 'READ'
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

  async markMessagesAsDelivered(senderId: string, receiverId: string) {
    const result = await this.prismaService.message.updateMany({
      where: {
        senderId,
        receiverId,
        status: MessageStatus.SENT,
      },
      data: {
        status: MessageStatus.DELIVERED,
      },
    });

    this.logger.log(
      `Messages marked as delivered: ${senderId} -> ${receiverId} (${result.count} messages)`,
    );
    return result.count;
  }

  async markMessagesAsRead(senderId: string, receiverId: string) {
    const result = await this.prismaService.message.updateMany({
      where: {
        senderId,
        receiverId,
        status: { not: MessageStatus.READ },
      },
      data: {
        status: MessageStatus.READ,
      },
    });

    this.logger.log(
      `Messages marked as read: ${senderId} -> ${receiverId} (${result.count} messages)`,
    );
    return result.count;
  }

  async setUserOnline(userId: string, isOnline: boolean) {
    await this.prismaService.user.update({
      where: { id: userId },
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
        id: { not: currentUserId },
      },
      select: {
        id: true,
        name: true,
        email: true,
        isOnline: true,
        lastSeen: true,
      },
      orderBy: [{ isOnline: 'desc' }, { name: 'asc' }],
    });
  }

  async deleteMessageForEveryone(messageId: string, requesterId: string) {
    const message = await this.prismaService.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, receiverId: true, isDeleted: true },
    });

    if (!message) {
      throw new NotFoundException('Unknown message');
    }

    if (message.senderId !== requesterId) {
      throw new ForbiddenException('You can delete your own message only.');
    }

    if (message.isDeleted) {
      return message;
    }
    return this.prismaService.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: 'This message was deleted.',
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        isDeleted: true,
      },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prismaService.message.count({
      where: {
        receiverId: userId,
        status: { not: MessageStatus.READ },
      },
    });
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new ForbiddenException('You cannot block yourself');
    }

    // Check if already blocked
    const existing = await this.prismaService.blockedUser.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    if (existing) {
      return { message: 'User already blocked' };
    }

    await this.prismaService.blockedUser.create({
      data: { blockerId, blockedId },
    });

    this.logger.log(`User ${blockerId} blocked ${blockedId}`);
    return { message: 'User blocked successfully' };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    const existing = await this.prismaService.blockedUser.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    if (!existing) {
      throw new NotFoundException('User is not blocked');
    }

    await this.prismaService.blockedUser.delete({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    this.logger.log(`User ${blockerId} unblocked ${blockedId}`);
    return { message: 'User unblocked successfully' };
  }

  async getBlockedUsers(userId: string) {
    const blocked = await this.prismaService.blockedUser.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return blocked.map((b) => b.blocked);
  }

  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    const block = await this.prismaService.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId1, blockedId: userId2 },
          { blockerId: userId2, blockedId: userId1 },
        ],
      },
    });
    return !!block;
  }
}
