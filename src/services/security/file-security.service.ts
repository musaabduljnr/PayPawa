import * as crypto from 'crypto';

export interface FileValidationResult {
  isValid: boolean;
  sanitizedFileName?: string;
  detectedMimeType?: string;
  errorCode?: 'FILE_TOO_LARGE' | 'INVALID_TYPE' | 'INVALID_SIGNATURE' | 'MALICIOUS_PATH' | 'EMPTY_FILE';
  errorMessage?: string;
}

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Magic bytes signatures
const MAGIC_NUMBERS: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // Starts with RIFF
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
};

/**
 * Enterprise File Security Service
 * 
 * Enforces:
 * 1. File size limits (<= 5MB).
 * 2. Magic byte file signature validation (prevents extension spoofing / polyglots).
 * 3. Path traversal protection.
 * 4. Safe random UUID-based file name generation.
 */
export class FileSecurityService {
  /**
   * Inspects buffer magic bytes against declared MIME type.
   */
  static verifyFileSignature(buffer: Buffer, declaredMimeType: string): boolean {
    const magic = MAGIC_NUMBERS[declaredMimeType];
    if (!magic || buffer.length < magic.length) {
      return false;
    }

    for (let i = 0; i < magic.length; i++) {
      if (buffer[i] !== magic[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validates a file for secure upload.
   */
  static validateUpload(
    fileName: string,
    fileSize: number,
    declaredMimeType: string,
    fileBuffer?: Buffer
  ): FileValidationResult {
    if (fileSize <= 0) {
      return {
        isValid: false,
        errorCode: 'EMPTY_FILE',
        errorMessage: 'Uploaded file cannot be empty.',
      };
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return {
        isValid: false,
        errorCode: 'FILE_TOO_LARGE',
        errorMessage: `File exceeds maximum allowed size of 5 MB (${Math.round(fileSize / 1024 / 1024)} MB provided).`,
      };
    }

    if (!ALLOWED_MIME_TYPES.includes(declaredMimeType as any)) {
      return {
        isValid: false,
        errorCode: 'INVALID_TYPE',
        errorMessage: `Unsupported file format: ${declaredMimeType}. Only JPEG, PNG, WEBP, and PDF files are allowed.`,
      };
    }

    // Path traversal prevention
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || /[\0<>:"|?*]/.test(fileName)) {
      return {
        isValid: false,
        errorCode: 'MALICIOUS_PATH',
        errorMessage: 'File name contains prohibited path traversal characters.',
      };
    }

    // Verify magic bytes if buffer is present
    if (fileBuffer && !this.verifyFileSignature(fileBuffer, declaredMimeType)) {
      return {
        isValid: false,
        errorCode: 'INVALID_SIGNATURE',
        errorMessage: 'File binary header does not match declared MIME type (signature mismatch).',
      };
    }

    const extension = declaredMimeType === 'application/pdf'
      ? 'pdf'
      : declaredMimeType === 'image/jpeg'
      ? 'jpg'
      : declaredMimeType === 'image/png'
      ? 'png'
      : 'webp';

    const safeUniqueName = `${crypto.randomUUID()}.${extension}`;

    return {
      isValid: true,
      sanitizedFileName: safeUniqueName,
      detectedMimeType: declaredMimeType,
    };
  }

  /**
   * Generates an isolated user storage path: `{userId}/{category}/{safeUniqueName}`
   */
  static generateStoragePath(userId: string, category: 'receipts' | 'support' | 'profiles', safeFileName: string): string {
    const cleanUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
    const cleanCategory = category.replace(/[^a-zA-Z0-9-]/g, '');
    return `${cleanUserId}/${cleanCategory}/${safeFileName}`;
  }
}
