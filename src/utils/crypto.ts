// AES-GCM 加解密工具，用于配置导入导出时保护敏感信息

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  // 分块处理避免大 buffer 导致栈溢出
  const CHUNK_SIZE = 8192
  let result = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))
    result += String.fromCharCode(...chunk)
  }
  return btoa(result)
}

function fromBase64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

export async function encrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    enc.encode(plaintext)
  )
  // 格式: salt.iv.ciphertext (均为 base64)
  return `${toBase64(salt)}.${toBase64(iv)}.${toBase64(ciphertext)}`
}

export async function decrypt(encrypted: string, password: string): Promise<string> {
  const parts = encrypted.split('.')
  if (parts.length !== 3) throw new Error('密文格式无效')
  const salt = fromBase64(parts[0])
  const iv = fromBase64(parts[1])
  const ciphertext = fromBase64(parts[2])
  const key = await deriveKey(password, salt)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  )
  return new TextDecoder().decode(decrypted)
}
