import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import { getPlanPricing } from './payment.constants';

export interface CreateCashfreePaymentParams {
  userId?: string;
  businessId: string;
  plan: string;
  redirectUrl?: string;
}

@Injectable()
export class CashfreeService {
  private readonly logger = new Logger(CashfreeService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private getCredentials() {
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const environment = (process.env.CASHFREE_ENVIRONMENT || 'SANDBOX').trim().toUpperCase();
    const baseUrl =
      environment === 'PRODUCTION'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
    const apiVersion = process.env.CASHFREE_API_VERSION || '2023-08-01';

    if (!appId || !secretKey) {
      this.logger.error('Cashfree API credentials (CASHFREE_APP_ID or CASHFREE_SECRET_KEY) missing in environment');
      throw new BadRequestException('Cashfree payment gateway credentials not configured on server');
    }

    return { appId, secretKey, baseUrl, apiVersion, environment };
  }

  /**
   * Create a Cashfree payment order
   */
  async createPaymentRequest(params: CreateCashfreePaymentParams) {
    this.logger.log(`Cashfree payment request received for businessId: ${params.businessId}, plan: ${params.plan}`);

    const { appId, secretKey, baseUrl, apiVersion, environment } = this.getCredentials();

    // 1. Get business & owner profile
    const business = await this.firebase.getBusinessById(params.businessId);
    if (!business) {
      this.logger.error(`Payment creation failed: Business workspace ${params.businessId} not found`);
      throw new NotFoundException('Business workspace not found');
    }

    const userId = params.userId || business.ownerId || 'unknown-user';

    // 2. Validate plan & pricing server-side
    let pricing;
    try {
      pricing = getPlanPricing(params.plan);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Invalid subscription plan');
    }

    if (pricing.amount <= 0) {
      throw new BadRequestException('Free tier does not require payment gateway processing');
    }

    // 3. Generate unique order ID & return URL
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const frontendBase = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.replace(/\/$/, '')
      : 'http://localhost:3000';
    const backendHost = process.env.BACKEND_URL ? process.env.BACKEND_URL.replace(/\/$/, '') : 'http://localhost:3001';
    let returnUrl = params.redirectUrl || `${frontendBase}/profile?merchantTransactionId=${orderId}`;
    let notifyUrl = `${backendHost}/api/payment/callback`;

    if (environment === 'PRODUCTION') {
      if (returnUrl.startsWith('http://localhost') || returnUrl.startsWith('http://127.0.0.1')) {
        returnUrl = returnUrl.replace(/^http:/, 'https:');
      }
      if (notifyUrl.startsWith('http://localhost') || notifyUrl.startsWith('http://127.0.0.1')) {
        notifyUrl = notifyUrl.replace(/^http:/, 'https:');
      }
    }

    const user = userId ? await this.firebase.getUserById(userId).catch(() => null) : null;
    const customerEmail = business.contactEmail || business.email || user?.email || 'customer@campaignai.com';
    const customerPhone = (business.contactPhone || business.contactNumber || '9876543210').replace(/[^0-9]/g, '').slice(-10) || '9876543210';
    const customerName = business.name || business.businessName || user?.name || 'Valued Customer';

    // 4. Construct Cashfree order payload
    const orderPayload = {
      order_id: orderId,
      order_amount: pricing.amount,
      order_currency: pricing.currency,
      customer_details: {
        customer_id: userId.substring(0, 50),
        customer_phone: customerPhone,
        customer_email: customerEmail,
        customer_name: customerName,
      },
      order_meta: {
        return_url: `${returnUrl}`,
        notify_url: notifyUrl,
      },
      order_note: `${pricing.description} — ${params.plan}`,
    };

    try {
      this.logger.log(`Initiating Cashfree order creation at ${baseUrl}/orders`);

      const response = await axios.post(`${baseUrl}/orders`, orderPayload, {
        headers: {
          'x-client-id': appId,
          'x-client-secret': secretKey,
          'x-api-version': apiVersion,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const resData = response.data;

      if (!resData || !resData.payment_session_id) {
        this.logger.error(`Cashfree order creation failed: ${JSON.stringify(resData)}`);
        throw new BadRequestException(resData?.message || 'Failed to generate Cashfree payment session');
      }

      // Cashfree uses payment_session_id to redirect user to checkout page
      const payUrl = this.buildCashfreeCheckoutUrl(resData.payment_session_id, environment);

      // 5. Store pending payment record in Firestore `payments` collection
      const paymentRecord = {
        paymentId: orderId,
        merchantTransactionId: orderId,
        orderId,
        paymentSessionId: resData.payment_session_id,
        userId,
        businessId: params.businessId,
        planId: params.plan,
        plan: pricing.name,
        amount: pricing.amount,
        currency: pricing.currency,
        status: 'PENDING',
        provider: 'CASHFREE',
        payUrl,
        returnUrl,
        notifyUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gatewayResponse: resData,
      };

      await this.firebase.col('payments').doc(orderId).set(paymentRecord);

      this.logger.log(`Cashfree order created. OrderID: ${orderId}, PayURL: ${payUrl}`);

      return {
        success: true,
        payUrl,
        paymentSessionId: resData.payment_session_id,
        environment,
        merchantTransactionId: orderId,
        status: 'PENDING',
        plan: pricing.name,
        amount: pricing.amount,
        currency: pricing.currency,
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      this.logger.error(`Cashfree payment creation error: ${errMsg}`);
      throw new BadRequestException(`Cashfree payment gateway error: ${err.response?.data?.message || err.message}`);
    }
  }

  /**
   * Build Cashfree hosted checkout URL from payment_session_id
   */
  private buildCashfreeCheckoutUrl(paymentSessionId: string, env: string): string {
    const cleanEnv = env.trim().toUpperCase();
    if (cleanEnv === 'PRODUCTION') {
      return `https://payments.cashfree.com/order/#${paymentSessionId}`;
    }
    return `https://payments-test.cashfree.com/order/#${paymentSessionId}`;
  }

  /**
   * Verify and query payment status from Cashfree
   */
  async verifyPaymentStatus(merchantTransactionId: string) {
    this.logger.log(`Verifying Cashfree payment status for orderId: ${merchantTransactionId}`);

    const { appId, secretKey, baseUrl, apiVersion } = this.getCredentials();

    // 1. Retrieve payment record from Firestore
    let doc = await this.firebase.col('payments').doc(merchantTransactionId).get();
    let paymentData: any = doc.exists ? doc.data() : null;

    if (!paymentData) {
      const snap = await this.firebase
        .col('payments')
        .where('merchantTransactionId', '==', merchantTransactionId)
        .limit(1)
        .get();
      if (!snap.empty) {
        doc = snap.docs[0];
        paymentData = doc.data();
      }
    }

    if (!paymentData) {
      throw new NotFoundException(`Payment record not found for transaction: ${merchantTransactionId}`);
    }

    // If already verified SUCCESS, return stored status
    if (paymentData.status === 'SUCCESS' || paymentData.status === 'PAID') {
      return {
        merchantTransactionId,
        status: 'SUCCESS',
        plan: paymentData.plan,
        amount: paymentData.amount,
        currency: paymentData.currency,
        businessId: paymentData.businessId,
        createdAt: paymentData.createdAt,
        updatedAt: paymentData.updatedAt,
        verifiedAt: paymentData.verifiedAt || paymentData.updatedAt,
      };
    }

    // 2. Call Cashfree Get Order API
    const orderId = paymentData.orderId || merchantTransactionId;

    try {
      const response = await axios.get(`${baseUrl}/orders/${orderId}`, {
        headers: {
          'x-client-id': appId,
          'x-client-secret': secretKey,
          'x-api-version': apiVersion,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const resData = response.data;
      this.logger.log(`Cashfree order status for ${orderId}: order_status=${resData.order_status}`);

      const orderStatus = resData.order_status; // PAID, ACTIVE, EXPIRED, CANCELLED
      let newStatus = paymentData.status;
      const now = new Date().toISOString();

      if (orderStatus === 'PAID') {
        newStatus = 'SUCCESS';
        await this.firebase.col('payments').doc(doc.id).set(
          {
            status: 'SUCCESS',
            updatedAt: now,
            verifiedAt: now,
            gatewayStatusPayload: resData,
          },
          { merge: true },
        );

        if (paymentData.businessId) {
          await this.activateSubscription(paymentData.businessId, paymentData.plan, doc.id, merchantTransactionId);
        }
      } else if (orderStatus === 'EXPIRED' || orderStatus === 'CANCELLED') {
        newStatus = 'FAILED';
        await this.firebase.col('payments').doc(doc.id).set(
          {
            status: 'FAILED',
            updatedAt: now,
            gatewayStatusPayload: resData,
          },
          { merge: true },
        );
      }

      return {
        merchantTransactionId,
        status: newStatus,
        plan: paymentData.plan,
        amount: paymentData.amount,
        currency: paymentData.currency,
        businessId: paymentData.businessId,
        createdAt: paymentData.createdAt,
        updatedAt: now,
        verifiedAt: newStatus === 'SUCCESS' ? now : undefined,
      };
    } catch (err: any) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      this.logger.warn(`Could not verify status with Cashfree API: ${errMsg}`);
      return {
        merchantTransactionId,
        status: paymentData.status,
        plan: paymentData.plan,
        amount: paymentData.amount,
        currency: paymentData.currency,
        businessId: paymentData.businessId,
        error: errMsg,
      };
    }
  }

  /**
   * Handle Cashfree Webhook Notification
   *
   * Cashfree sends a JSON payload with order details.
   * Signature verification: HMAC-SHA256 of (timestamp + rawBody) using secretKey.
   * The controller should pass the raw body and headers for signature verification.
   */
  async processCallback(payload: any, signature?: string, timestamp?: string, rawBody?: string) {
    this.logger.log(`Cashfree Callback received: ${JSON.stringify(payload)}`);

    // Verify webhook signature if provided
    if (signature && timestamp && rawBody) {
      const { secretKey } = this.getCredentials();
      const computedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(timestamp + rawBody)
        .digest('base64');

      if (computedSignature !== signature) {
        this.logger.warn('Cashfree webhook signature verification failed');
        return { success: false, message: 'Invalid webhook signature' };
      }
    }

    try {
      // Cashfree webhook payload structure
      const data = payload?.data || payload;
      const orderId =
        data?.order?.order_id ||
        data?.orderId ||
        payload?.order_id;

      if (!orderId) {
        this.logger.warn('Cashfree callback: missing order_id in payload');
        return { success: false, message: 'Missing order_id in callback payload' };
      }

      return await this.verifyPaymentStatus(orderId);
    } catch (err: any) {
      this.logger.error(`Failed to process Cashfree callback: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Internal Helper: Activate user subscription in Firestore
   */
  private async activateSubscription(businessId: string, plan: string, paymentId?: string, orderId?: string) {
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    const subData = {
      businessId,
      plan: plan.toUpperCase(),
      status: 'ACTIVE',
      startDate: startDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      nextBillingDate: expiryDate.toISOString(),
      autoRenew: true,
      updatedAt: startDate.toISOString(),
      lastPaymentId: paymentId || orderId || '',
      provider: 'CASHFREE',
    };

    const subs = await this.firebase.getSubscriptionsByBusinessId(businessId);
    let activeSub = subs.find((s: any) => s.status === 'ACTIVE');
    if (activeSub) {
      await this.firebase.updateSubscription(activeSub.id, subData);
    } else {
      await this.firebase.createSubscription(subData);
    }

    await this.firebase.updateBusiness(businessId, {
      subscriptionPlan: plan.toUpperCase(),
      updatedAt: startDate.toISOString(),
    });
  }
}
