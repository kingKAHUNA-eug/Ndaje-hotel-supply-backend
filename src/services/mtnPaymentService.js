const axios = require('axios');
const crypto = require('crypto');

class MTNPaymentService {
  constructor() {
    this.baseUrl = process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
    this.apiKey = process.env.MTN_MOMO_API_KEY;
    this.apiSecret = process.env.MTN_MOMO_API_SECRET;
    this.subscriptionKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY;
    this.environment = process.env.MTN_MOMO_ENVIRONMENT || 'sandbox';
  }

  /**
   * Generate access token for MTN MoMo API
   * @returns {string} Access token
   */
  async generateAccessToken() {
    try {
      const auth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
      
      const response = await axios.post(
        `${this.baseUrl}/collection/token/`,
        {},
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.access_token;
    } catch (error) {
      console.error('MTN Payment Service - Generate token error:', error.response?.data || error.message);
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * Request payment from customer
   * @param {string} phoneNumber - Customer phone number
   * @param {number} amount - Amount to charge
   * @param {string} externalId - External reference ID
   * @param {string} payeeNote - Note for payee
   * @param {string} payerMessage - Message for payer
   * @returns {Object} Payment request response
   */
  async requestPayment(phoneNumber, amount, externalId, payeeNote = 'Hotel Supply Payment', payerMessage = 'Payment for order') {
    try {
      const accessToken = await this.generateAccessToken();
      
      // Format phone number (remove + and ensure it starts with country code)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      const requestBody = {
        amount: amount.toString(),
        currency: 'UGX', // Uganda Shillings - adjust based on your country
        externalId: externalId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: formattedPhone
        },
        payerMessage: payerMessage,
        payeeNote: payeeNote
      };

      const response = await axios.post(
        `${this.baseUrl}/collection/v1_0/requesttopay`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'X-Target-Environment': this.environment,
            'Content-Type': 'application/json',
            'X-Reference-Id': externalId
          }
        }
      );

      return {
        success: true,
        referenceId: externalId,
        status: 'PENDING',
        message: 'Payment request sent successfully'
      };
    } catch (error) {
      console.error('MTN Payment Service - Request payment error:', error.response?.data || error.message);
      
      // Handle specific MTN error codes
      if (error.response?.data) {
        const errorData = error.response.data;
        return {
          success: false,
          error: errorData.message || 'Payment request failed',
          code: errorData.code || 'UNKNOWN_ERROR'
        };
      }

      throw new Error('Failed to request payment');
    }
  }

  /**
   * Get payment status
   * @param {string} referenceId - Payment reference ID
   * @returns {Object} Payment status
   */
  async getPaymentStatus(referenceId) {
    try {
      const accessToken = await this.generateAccessToken();
      
      const response = await axios.get(
        `${this.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'X-Target-Environment': this.environment
          }
        }
      );

      return {
        success: true,
        referenceId: referenceId,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        payer: response.data.payer,
        financialTransactionId: response.data.financialTransactionId,
        externalId: response.data.externalId
      };
    } catch (error) {
      console.error('MTN Payment Service - Get status error:', error.response?.data || error.message);
      
      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'Payment not found',
          code: 'PAYMENT_NOT_FOUND'
        };
      }

      throw new Error('Failed to get payment status');
    }
  }

  /**
   * Validate webhook signature
   * @param {string} payload - Webhook payload
   * @param {string} signature - Webhook signature
   * @returns {boolean} True if valid
   */
  validateWebhookSignature(payload, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('MTN Payment Service - Signature validation error:', error);
      return false;
    }
  }

  /**
   * Format phone number for MTN MoMo
   * @param {string} phoneNumber - Raw phone number
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present (assuming Uganda +256)
    if (cleaned.startsWith('0')) {
      cleaned = '256' + cleaned.substring(1);
    } else if (!cleaned.startsWith('256')) {
      cleaned = '256' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Simulate payment for development/testing
   * @param {string} phoneNumber - Customer phone number
   * @param {number} amount - Amount to charge
   * @param {string} externalId - External reference ID
   * @returns {Object} Simulated payment response
   */
  async simulatePayment(phoneNumber, amount, externalId) {
    // This is for development/testing only
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Simulation not allowed in production');
    }

    // Simulate different scenarios based on phone number
    const lastDigit = phoneNumber.slice(-1);
    
    if (lastDigit === '0') {
      return {
        success: false,
        error: 'Insufficient funds',
        code: 'INSUFFICIENT_FUNDS'
      };
    } else if (lastDigit === '1') {
      return {
        success: false,
        error: 'User cancelled payment',
        code: 'USER_CANCELLED'
      };
    } else {
      // Simulate successful payment
      return {
        success: true,
        referenceId: externalId,
        status: 'SUCCESSFUL',
        amount: amount,
        currency: 'UGX',
        financialTransactionId: `FT${Date.now()}`,
        message: 'Payment successful'
      };
    }
  }

  /**
   * Get account balance
   * @returns {Object} Account balance
   */
  async getAccountBalance() {
    try {
      const accessToken = await this.generateAccessToken();
      
      const response = await axios.get(
        `${this.baseUrl}/collection/v1_0/account/balance`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'X-Target-Environment': this.environment
          }
        }
      );

      return {
        success: true,
        availableBalance: response.data.availableBalance,
        currency: response.data.currency
      };
    } catch (error) {
      console.error('MTN Payment Service - Get balance error:', error.response?.data || error.message);
      throw new Error('Failed to get account balance');
    }
  }
}

module.exports = MTNPaymentService;
