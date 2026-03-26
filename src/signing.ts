import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'node:crypto'

export interface Keypair {
  publicKey: string  // PEM format
  privateKey: string // PEM format
}

export function generateKeypair(): Keypair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return { privateKey, publicKey }
}

export function buildPayload(gameId: string, action: string, timestamp: number): string {
  return `${gameId}:${action}:${timestamp}`
}

export function signMove(payload: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem)
  const signature = sign(null, Buffer.from(payload), key)
  return signature.toString('base64')
}

export function verifyMove(payload: string, signature: string, publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem)
    return verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}
