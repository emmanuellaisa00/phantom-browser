import {CompactEncrypt, compactDecrypt} from 'jose';
import {z} from 'zod';

// RFC 7516 compact JWE with RFC 7518 password-based key wrapping and AES-GCM.
// Crypto primitives, salt generation, authentication and key wrapping are jose/WebCrypto.
const passwordSchema = z.string().min(12).max(1024);
const algorithm = 'PBES2-HS512+A256KW';
const encryption = 'A256GCM';
const contentType = 'application/vnd.phantom.backup+gzip';
export async function encryptBackup(bytes: Uint8Array, password: string): Promise<Buffer> {
  const key = new TextEncoder().encode(passwordSchema.parse(password));
  try {
    return Buffer.from(await new CompactEncrypt(bytes).setProtectedHeader({alg:algorithm, enc:encryption, cty:contentType}).setKeyManagementParameters({p2c:310000}).encrypt(key), 'ascii');
  } finally {key.fill(0);}
}
export async function decryptBackup(bytes: Uint8Array, password: string): Promise<Buffer> {
  const key = new TextEncoder().encode(passwordSchema.parse(password));
  try {
    const {plaintext, protectedHeader} = await compactDecrypt(bytes, key, {keyManagementAlgorithms:[algorithm],contentEncryptionAlgorithms:[encryption],maxPBES2Count:310000});
    if (protectedHeader.cty !== contentType || protectedHeader.p2c !== 310000) throw Error('Unsupported backup parameters');
    return Buffer.from(plaintext);
  } catch {throw Error('Encrypted backup authentication failed: wrong password, damaged file or unsupported format');}
  finally {key.fill(0);}
}
