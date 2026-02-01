import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) { }

  @Get('users')
  async getUsers(@Req() req: any) {
    return this.chatService.getAllUsers(req.user.id);
  }

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.chatService.getUserConversations(req.user.id);
  }

  @Get('messages')
  async getMessages(
    @Req() req: any,
    @Query('partnerId') partnerId: string,
    @Query('page') page?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    return this.chatService.getConversation(req.user.id, partnerId, pageNum);
  }

  @Get('unread')
  async getUnreadCount(@Req() req: any) {
    const count = await this.chatService.getUnreadCount(req.user.id);
    return { unreadCount: count };
  }

  @Get('blocked')
  async getBlockedUsers(@Req() req: any) {
    return this.chatService.getBlockedUsers(req.user.id);
  }

  @Post('block/:userId')
  async blockUser(@Req() req: any, @Param('userId') blockedId: string) {
    return this.chatService.blockUser(req.user.id, blockedId);
  }

  @Delete('block/:userId')
  async unblockUser(@Req() req: any, @Param('userId') blockedId: string) {
    return this.chatService.unblockUser(req.user.id, blockedId);
  }
}
