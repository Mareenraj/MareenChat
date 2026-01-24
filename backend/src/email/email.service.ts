import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: parseInt(this.configService.get<string>('SMTP_PORT') || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendOtpEmail(email: string, otp: string, name?: string): Promise<void> {
    const mailFrom =
      this.configService.get<string>('MAIL_FROM') || 'no-reply@mareenchat.com';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - MareenChat</title>
</head>
<body style="margin:0; padding:0; background-color:#f5f7f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px; border-bottom:1px solid #eef2f6;">
              <h1 style="margin:0; font-size:22px; font-weight:600; color:#0088cc;">
                MareenChat
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0; font-size:16px; color:#222;">
                Hi${name ? ' ' + name : ''},
              </p>

              <p style="margin:0 0 24px 0; font-size:15px; color:#6b7280; line-height:1.6;">
                Welcome to MareenChat. Use the code below to verify your email address.
              </p>

              <!-- OTP -->
              <div style="text-align:center; margin:32px 0;">
                <div style="
                  display:inline-block;
                  padding:16px 32px;
                  background:#e6f2fb;
                  border-radius:10px;
                  font-size:32px;
                  font-weight:600;
                  color:#0088cc;
                  letter-spacing:6px;
                ">
                  ${otp}
                </div>
              </div>

              <p style="margin:24px 0 0 0; font-size:14px; color:#6b7280; text-align:center;">
                This code expires in <strong>5 minutes</strong>.
              </p>

              <p style="margin:12px 0 0 0; font-size:13px; color:#9aa0a6; text-align:center;">
                If you didn’t request this, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #eef2f6; text-align:center;">
              <p style="margin:0; font-size:12px; color:#9aa0a6;">
                © 2026 MareenChat
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
    try {
      await this.transporter.sendMail({
        from: `"MareenChat" <${mailFrom}>`,
        to: email,
        subject: 'Verify Your Email - MareenChat',
        html: htmlContent,
      });
      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
      throw error;
    }
  }
}
