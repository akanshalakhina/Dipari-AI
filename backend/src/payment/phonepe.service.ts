import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import { getPlanPricing } from './payment.constants';

export interface CreatePhonePePaymentParams {
  userId?: string;
  businessId: string;
  plan: string;
  redirectUrl?: string;
}

@Injectable()
export class PhonePeService {
  private readonly logger = new Logger(PhonePeService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private getCredentials() {
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
    const baseUrl = (process.env.PHONEPE_BASE_URL || 'https://api.phonepe.com/apis/hermes').replace(/\/$/, '');

    if (!merchantId || !saltKey) {
      this.logger.error('PhonePe API credentials (PHONEPE_MERCHANT_ID or PHONEPE_SALT_KEY) missing in environment');
      throw new BadRequestException('PhonePe payment gateway credentials not configured on server');
    }

    return { merchantId, saltKey, saltIndex, baseUrl };
  }

  /**
   * Create a PhonePe payment transaction
   */
  async createPaymentRequest(params: CreatePhonePePaymentParams) {
    this.logger.log(`PhonePe payment request received for businessId: ${params.businessId}, plan: ${params.plan}`);

    const { merchantId, saltKey, saltIndex, baseUrl } = this.getCredentials();

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

    // 3. Generate transaction ID & URLs
    const merchantTransactionId = `MTX_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const amountInPaise = Math.round(pricing.amount * 100);

    const frontendBase = process.env.FRONTEND_URL 
      ? process.env.FRONTEND_URL.replace(/\/$/, '')
      : 'http://localhost:3000';
    const redirectUrl = params.redirectUrl || `${frontendBase}/profile?merchantTransactionId=${merchantTransactionId}`;

    const backendHost = process.env.BACKEND_URL ? process.env.BACKEND_URL.replace(/\/$/, '') : 'http://localhost:3001';
    const callbackUrl = `${backendHost}/api/payment/callback`;

    // 4. Construct Payload
    const payPayload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: userId.substring(0, 36),
      amount: amountInPaise,
      redirectUrl,
      redirectMode: 'REDIRECT',
      callbackUrl,
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    const base64Payload = Buffer.from(JSON.stringify(payPayload)).toString('base64');
    const apiEndpoint = '/pg/v1/pay';

    // Compute SHA256 checksum: sha256(base64Payload + apiEndpoint + saltKey) + ### + saltIndex
    const checksumString = base64Payload + apiEndpoint + saltKey;
    const sha256 = crypto.createHash('sha256').update(checksumString).digest('hex');
    const xVerify = `${sha256}###${saltIndex}`;

    try {
      this.logger.log(`Initiating PhonePe payment request to ${baseUrl}${apiEndpoint}`);

      const response = await axios.post(
        `${baseUrl}${apiEndpoint}`,
        { request: base64Payload },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': xVerify,
          },
          timeout: 15000,
        },
      );

      const resData = response.data;
      if (!resData || !resData.success || !resData.data?.instrumentResponse?.redirectInfo?.url) {
        this.logger.error(`PhonePe checkout initialization failed: ${JSON.stringify(resData)}`);
        throw new BadRequestException(resData?.message || 'Failed to generate PhonePe payment checkout link');
      }

      const payUrl = resData.data.instrumentResponse.redirectInfo.url;

      // 5. Store pending payment record in Firestore `payments` collection
      const paymentRecord = {
        paymentId: merchantTransactionId,
        merchantTransactionId,
        userId,
        businessId: params.businessId,
        planId: params.plan,
        plan: pricing.name,
        amount: pricing.amount,
        currency: pricing.currency,
        status: 'PENDING',
        provider: 'PHONEPE',
        payUrl,
        redirectUrl,
        callbackUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gatewayResponse: resData,
      };

      await this.firebase.col('payments').doc(merchantTransactionId).set(paymentRecord);

      this.logger.log(`PhonePe payment created. TxnID: ${merchantTransactionId}, PayURL: ${payUrl}`);

      return {
        success: true,
        payUrl,
        merchantTransactionId,
        status: 'PENDING',
        plan: pricing.name,
        amount: pricing.amount,
        currency: pricing.currency,
      };
    } catch (err: any) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      this.logger.error(`PhonePe payment creation error: ${errMsg}`);
      throw new BadRequestException(`PhonePe payment gateway error: ${err.response?.data?.message || err.message}`);
    }
  }

  /**
   * Verify and query payment status directly from PhonePe server
   */
  async verifyPaymentStatus(merchantTransactionId: string) {
    this.logger.log(`Verifying PhonePe payment status for merchantTransactionId: ${merchantTransactionId}`);

    const { merchantId, saltKey, saltIndex, baseUrl } = this.getCredentials();

    // 1. Retrieve payment record from Firestore
    let doc = await this.firebase.col('payments').doc(merchantTransactionId).get();
    let paymentData: any = doc.exists ? doc.data() : null;

    if (!paymentData) {
      const snap = await this.firebase.col('payments').where('merchantTransactionId', '==', merchantTransactionId).limit(1).get();
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

    // 2. Call PhonePe Status API
    const apiEndpoint = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
    const checksumString = apiEndpoint + saltKey;
    const sha256 = crypto.createHash('sha256').update(checksumString).digest('hex');
    const xVerify = `${sha256}###${saltIndex}`;

    try {
      const response = await axios.get(`${baseUrl}${apiEndpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': merchantId,
        },
        timeout: 10000,
      });

      const resData = response.data;
      this.logger.log(`PhonePe status response for ${merchantTransactionId}: code=${resData.code}, success=${resData.success}`);

      const code = resData.code;
      let newStatus = paymentData.status;
      const now = new Date().toISOString();

      if (resData.success && code === 'PAYMENT_SUCCESS') {
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
      } else if (code === 'PAYMENT_ERROR' || code === 'PAYMENT_DECLINED' || code === 'TIMED_OUT' || code === 'CANCELLED') {
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
      this.logger.warn(`Could not verify status with PhonePe API: ${errMsg}`);
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
   * Handle PhonePe Callback Webhook
   */
  async processCallback(payload: any) {
    this.logger.log(`PhonePe Callback received: ${JSON.stringify(payload)}`);

    if (!payload?.response) {
      return { success: false, message: 'Invalid callback payload format' };
    }

    try {
      const decodedStr = Buffer.from(payload.response, 'base64').toString('utf-8');
      const responseObj = JSON.parse(decodedStr);

      const merchantTransactionId = responseObj.data?.merchantTransactionId;
      const code = responseObj.code;

      if (!merchantTransactionId) {
        return { success: false, message: 'Missing merchantTransactionId in callback' };
      }

      return await this.verifyPaymentStatus(merchantTransactionId);
    } catch (err: any) {
      this.logger.error(`Failed to process PhonePe callback: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Internal Helper: Activate user subscription in Firestore
   */
  private async activateSubscription(businessId: string, plan: string, paymentId?: string, merchantTransactionId?: string) {
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
      lastPaymentId: paymentId || merchantTransactionId || '',
      provider: 'PHONEPE',
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
