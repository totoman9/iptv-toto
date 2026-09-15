import { safeStorage } from 'electron'

// Küçük değerleri (şifreler, API anahtarları) sistemin kendi anahtarlığıyla
// (Mac: Keychain, Windows: DPAPI) şifreleyip diske öyle yazmak için ortak
// yardımcılar. safeStorage her sistemde kullanılamıyorsa (nadiren) ham
// base64'e düşülür — hiç şifrelenmemiş yazmaktan daha iyi, ama garanti değil.

export function encodeSecret(value: string): string {
  return safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(value).toString('base64')}`
    : `raw:${Buffer.from(value).toString('base64')}`
}

// Eski (şifrelenmeden kaydedilmiş) değerleri de olduğu gibi geri döndürür;
// bir sonraki kayıtta otomatik olarak şifrelenmiş hale geçerler.
export function decodeSecret(value?: string): string | undefined {
  if (!value) return undefined
  if (value.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    } catch {
      return undefined
    }
  }
  if (value.startsWith('raw:')) {
    try {
      return Buffer.from(value.slice(4), 'base64').toString()
    } catch {
      return undefined
    }
  }
  return value
}
