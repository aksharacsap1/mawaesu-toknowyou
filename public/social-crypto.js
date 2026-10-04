const databaseName = "mawaesu-social-keys";
const storeName = "identities";
const encoder = new TextEncoder();
let identityPromise;

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "uid" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readIdentity(database, uid) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(uid);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeIdentity(database, identity) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readwrite").objectStore(storeName).put(identity);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getOrCreateIdentity(uid) {
  if (identityPromise) return identityPromise;
  identityPromise = (async () => {
    const database = await openKeyDatabase();
    try {
      const saved = await readIdentity(database, uid);
      if (saved) return saved;
      const pair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"]
      );
      const identity = {
        uid,
        privateKey: pair.privateKey,
        publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey)
      };
      await storeIdentity(database, identity);
      return identity;
    } finally {
      database.close();
    }
  })();
  try {
    return await identityPromise;
  } finally {
    identityPromise = undefined;
  }
}

export async function deleteIdentity(uid) {
  const database = await openKeyDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).delete(uid);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    identityPromise = undefined;
  } finally {
    database.close();
  }
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function messageKey(identity, peerPublicKey, conversationId) {
  const peerKey = await crypto.subtle.importKey(
    "jwk",
    peerPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    identity.privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(conversationId),
      info: encoder.encode("mawaesu-e2ee-v1")
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(identity, peerPublicKey, conversationId, plaintext) {
  const key = await messageKey(identity, peerPublicKey, conversationId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(conversationId) },
    key,
    encoder.encode(plaintext)
  );
  const nonce = toBase64(iv);
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: nonce, nonce };
}

export async function decryptMessage(identity, peerPublicKey, conversationId, encrypted) {
  const nonce = encrypted.iv || encrypted.nonce;
  if (!nonce) throw new Error("Encrypted message has no nonce.");
  const key = await messageKey(identity, peerPublicKey, conversationId);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(nonce),
      additionalData: encoder.encode(conversationId)
    },
    key,
    fromBase64(encrypted.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

export async function getKeyFingerprint(publicKey) {
  const imported = await crypto.subtle.importKey(
    "jwk",
    publicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
  const encoded = await crypto.subtle.exportKey("raw", imported);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest).slice(0, 8), byte => byte.toString(16).padStart(2, "0")).join("");
}
