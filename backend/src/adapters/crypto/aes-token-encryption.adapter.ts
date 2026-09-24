import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { TokenEncryptionPort } from '../../ports/tokens.port';
import { loadConfig } from '../../infrastructure/config/env';

/**
 * AES-256-GCM token encryption adapter.
 * Stores ciphertext as: base64(iv + authTag + encryptedData)
 */
@Injectable()
export class AesTokenEncryptionAdapter implements TokenEncryptionPort {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  
  constructor() {
    const config = loadConfig();
    const keyString = config.encryption.tokenKey;
    
    // Support hex or base64 encoded 32-byte key
    if (keyString.length === 64) {
      // Hex
      this.key = Buffer.from(keyString, 'hex');
    } else {
      // Base64
      this.key = Buffer.from(keyString, 'base64');
    }
    
    if (this.key.length !== 32) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars)',
      );
    }
  }
  
  async encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine: iv (12) + authTag (16) + encrypted
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }
  
  async decrypt(ciphertext: string): Promise<string> {
    const combined = Buffer.from(ciphertext, 'base64');
    
    if (combined.length < 28) {
      throw new Error('Invalid ciphertext: too short');
    }
    
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const encrypted = combined.subarray(28);
    
    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  }
}
