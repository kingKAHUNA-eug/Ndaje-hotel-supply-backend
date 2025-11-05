const crypto = require('crypto');

class DeliveryCodeService {
  constructor() {
    // Use environment variable for encryption key or generate a default one
    this.encryptionKey = process.env.DELIVERY_CODE_KEY || 'default-delivery-code-key-32-chars';
    this.algorithm = 'aes-256-cbc';
  }

  /**
   * Generate a secure delivery code
   * @param {string} deliveryId - Delivery ID
   * @param {string} orderId - Order ID
   * @param {string} clientId - Client ID
   * @returns {Object} Generated code and metadata
   */
  generateDeliveryCode(deliveryId, orderId, clientId) {
    try {
      // Create a unique payload
      const payload = {
        deliveryId,
        orderId,
        clientId,
        timestamp: Date.now(),
        random: crypto.randomBytes(8).toString('hex')
      };

      // Encrypt the payload
      const encryptedCode = this.encrypt(JSON.stringify(payload));
      
      // Generate a shorter, user-friendly code (6 digits)
      const shortCode = this.generateShortCode(deliveryId, orderId);
      
      return {
        encryptedCode,
        shortCode,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };
    } catch (error) {
      console.error('DeliveryCodeService.generateDeliveryCode error:', error);
      throw new Error('Failed to generate delivery code');
    }
  }

  /**
   * Verify a delivery code
   * @param {string} encryptedCode - Encrypted code
   * @param {string} deliveryId - Delivery ID
   * @param {string} orderId - Order ID
   * @param {string} clientId - Client ID
   * @returns {Object} Verification result
   */
  verifyDeliveryCode(encryptedCode, deliveryId, orderId, clientId) {
    try {
      // Decrypt the code
      const decryptedPayload = this.decrypt(encryptedCode);
      const payload = JSON.parse(decryptedPayload);

      // Verify the payload matches
      const isValid = 
        payload.deliveryId === deliveryId &&
        payload.orderId === orderId &&
        payload.clientId === clientId;

      // Check if code is expired (24 hours)
      const isExpired = Date.now() - payload.timestamp > 24 * 60 * 60 * 1000;

      return {
        isValid: isValid && !isExpired,
        isExpired,
        payload: isValid ? payload : null
      };
    } catch (error) {
      console.error('DeliveryCodeService.verifyDeliveryCode error:', error);
      return {
        isValid: false,
        isExpired: false,
        error: 'Invalid code format'
      };
    }
  }

  /**
   * Generate a short, user-friendly code
   * @param {string} deliveryId - Delivery ID
   * @param {string} orderId - Order ID
   * @returns {string} 6-digit code
   */
  generateShortCode(deliveryId, orderId) {
    // Use last 3 characters of each ID to create a 6-digit code
    const deliverySuffix = deliveryId.slice(-3);
    const orderSuffix = orderId.slice(-3);
    
    // Convert to numbers and create a 6-digit code
    const deliveryNum = parseInt(deliverySuffix, 36) % 1000;
    const orderNum = parseInt(orderSuffix, 36) % 1000;
    
    // Combine and ensure 6 digits
    const combined = (deliveryNum * 1000 + orderNum) % 1000000;
    return combined.toString().padStart(6, '0');
  }

  /**
   * Encrypt data
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('DeliveryCodeService.encrypt error:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data
   * @param {string} encryptedText - Encrypted text
   * @returns {string} Decrypted text
   */
  decrypt(encryptedText) {
    try {
      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encrypted = textParts.join(':');
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('DeliveryCodeService.decrypt error:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generate a QR code data for delivery verification
   * @param {string} deliveryId - Delivery ID
   * @param {string} orderId - Order ID
   * @param {string} clientId - Client ID
   * @returns {Object} QR code data
   */
  generateQRCodeData(deliveryId, orderId, clientId) {
    const codeData = this.generateDeliveryCode(deliveryId, orderId, clientId);
    
    return {
      type: 'delivery_verification',
      deliveryId,
      orderId,
      clientId,
      shortCode: codeData.shortCode,
      encryptedCode: codeData.encryptedCode,
      generatedAt: codeData.generatedAt,
      expiresAt: codeData.expiresAt
    };
  }
}

module.exports = DeliveryCodeService;
