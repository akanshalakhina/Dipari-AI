import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FirebaseService } from '../firebase/firebase.service';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Payment Creation API (Cashfree Checkout)
   * POST /payment/create
   */
  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createPayment(@Req() req: any, @Body() dto: CreatePaymentDto) {
    this.logger.log(`POST /payment/create called by user: ${req.user?.uid || req.user?.id}`);

    let businessId = dto.businessId;

    if (!businessId && req.user?.uid) {
      const userDoc = await this.firebaseService.getUserById(req.user.uid);
      if (userDoc?.businessId) {
        businessId = userDoc.businessId;
      } else {
        const businesses = await this.firebaseService.getBusinessesByUserId(req.user.uid);
        if (businesses && businesses.length > 0) {
          businessId = businesses[0].id;
        }
      }
    }

    if (!businessId) {
      businessId = req.user?.businessId || req.user?.uid || 'default-business';
    }

    return this.paymentService.createPaymentRequest({
      userId: req.user?.uid || req.user?.id,
      businessId,
      plan: dto.plan,
      redirectUrl: dto.redirectUrl,
    });
  }

  /**
   * Cashfree Webhook / Callback Endpoint
   * POST /payment/callback
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Body() payload: any) {
    this.logger.log('POST /payment/callback received Cashfree notification');
    return this.paymentService.processCallback(payload);
  }

  /**
   * Legacy Webhook Alias
   * POST /payment/webhook
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    this.logger.log('POST /payment/webhook received webhook notification');
    return this.paymentService.processCallback(payload);
  }

  /**
   * Payment Verification / Status API
   * GET /payment/status/:transactionId
   */
  @Get('status/:transactionId')
  async getPaymentStatus(@Param('transactionId') transactionId: string) {
    this.logger.log(`GET /payment/status/${transactionId} called`);
    return this.paymentService.getPaymentStatus(transactionId);
  }

  /**
   * Invoice Download API
   * GET /payment/invoice/:paymentId
   */
  @UseGuards(JwtAuthGuard)
  @Get('invoice/:paymentId')
  async downloadInvoice(@Param('paymentId') paymentId: string, @Res() res: any) {
    const invoice = await this.paymentService.downloadInvoice(paymentId);
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${invoice.fileName}"`,
      'Cache-Control': 'private, no-store',
    });
    return res.send(invoice.pdfBuffer);
  }
}
