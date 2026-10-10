"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

initializeApp();
const db = getFirestore();
const REGION = "us-central1";
const DAY_MS = 24 * 60 * 60 * 1000;
const RANDOM_ROOM_MS = 5 * 60 * 1000;
const RANDOM_METADATA_RETENTION_MS = DAY_MS;
const REPORT_WINDOW_MS = DAY_MS;

function fail(code, message) {
  throw new HttpsError(code, message);
}

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) fail("unauthenticated", "Sign in to continue.");
  return request.auth.uid;
}

function inputObject(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail("invalid-argument", "Expected an object.");
  }
  return data;
}

function onlyKeys(data, allowed) {
  if (Object.keys(data).some((key) => !allowed.includes(key))) {
    fail("invalid-argument", "Unexpected input field.");
  }
}

function stringField(data, key, min, max) {
  const value = data[key];
  if (typeof value !== "string") fail("invalid-argument", `${key} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail("invalid-argument", `${key} must be between ${min} and ${max} characters.`);
  }
  return trimmed;
}

function documentId(data, key, max = 150) {
  const value = stringField(data, key, 1, max);
  if (value.includes("/")) fail("invalid-argument", `${key} is invalid.`);
  return value;
}

function optionalString(data, key, max) {
  if (data[key] === undefined || data[key] === null) return "";
  if (typeof data[key] !== "string" || data[key].length > max) {
    fail("invalid-argument", `${key} must be a string of at most ${max} characters.`);
  }
  return data[key].trim();
}

function validatePublicJwk(value, fieldName = "encryptionPublicKey") {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid-argument", `${fieldName} must be a public JWK object or null.`);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 4096) fail("invalid-argument", `${fieldName} is too large.`);
  const allowed = ["kty", "crv", "x", "y", "n", "e", "use", "alg", "key_ops", "kid", "ext"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    fail("invalid-argument", `${fieldName} must not contain private key material.`);
  }
  if (value.kty === "EC") {
    if (value.crv !== "P-256" || typeof value.x !== "string" ||
        typeof value.y !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.x) ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.y)) {
      fail("invalid-argument", `${fieldName} must be a valid P-256 public JWK.`);
    }
  } else if (value.kty === "OKP") {
    if (value.crv !== "X25519" || typeof value.x !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.x)) {
      fail("invalid-argument", `${fieldName} must be a valid X25519 public JWK.`);
    }
  } else if (value.kty === "RSA") {
    if (typeof value.n !== "string" || typeof value.e !== "string" ||
        !/^[A-Za-z0-9_-]{342,1366}$/.test(value.n) ||
        !/^[A-Za-z0-9_-]{1,16}$/.test(value.e)) {
      fail("invalid-argument", `${fieldName} must be a valid RSA public JWK.`);
    }
  } else {
    fail("invalid-argument", `${fieldName} must use P-256, X25519, or RSA.`);
  }
  if (value.key_ops !== undefined &&
      (!Array.isArray(value.key_ops) || value.key_ops.length > 4 ||
       value.key_ops.some((op) => !["deriveKey", "deriveBits", "encrypt", "wrapKey"].includes(op)))) {
    fail("invalid-argument", `${fieldName}.key_ops is invalid for a public key.`);
  }
  if (value.use !== undefined && value.use !== "enc") {
    fail("invalid-argument", `${fieldName}.use must be "enc".`);
  }
  if (value.alg !== undefined &&
      (typeof value.alg !== "string" ||
       !["ECDH-ES", "ECDH-ES+A256KW", "RSA-OAEP", "RSA-OAEP-256"].includes(value.alg))) {
    fail("invalid-argument", `${fieldName}.alg is unsupported for encryption.`);
  }
  if (value.kid !== undefined &&
      (typeof value.kid !== "string" || value.kid.length < 1 || value.kid.length > 128)) {
    fail("invalid-argument", `${fieldName}.kid is invalid.`);
  }
  if (value.ext !== undefined && typeof value.ext !== "boolean") {
    fail("invalid-argument", `${fieldName}.ext must be a boolean.`);
  }
  return value;
}

function requireUid(uid) {
  if (typeof uid !== "string" || uid.length < 1 || uid.length > 128 || uid.includes("/")) {
    fail("invalid-argument", "Invalid user.");
  }
  return uid;
}

function pairKey(uidA, uidB) {
  return JSON.stringify([uidA, uidB].sort());
}

function connectionRequestId(senderUid, recipientUid) {
  return crypto.createHash("sha256")
    .update(JSON.stringify([senderUid, recipientUid]))
    .digest("hex");
}

function randomAlias() {
  return `Guest-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function rateRef(uid, action, bucket) {
  const id = crypto.createHash("sha256").update(JSON.stringify([uid, action, bucket])).digest("hex");
  return db.collection("callableRateLimits").doc(id);
}

async function consumeRateLimit(uid, action, max, windowMs) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const ref = rateRef(uid, action, bucket);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const count = snapshot.exists ? snapshot.data().count : 0;
    if (count >= max) fail("resource-exhausted", "Too many requests. Try again later.");
    tx.set(ref, {
      uid,
      action,
      bucket,
      count: count + 1,
      expiresAt: Timestamp.fromMillis((bucket + 2) * windowMs),
    });
  });
}

async function assertNotBanned(tx, uid) {
  const [snapshot, accountStatus] = await Promise.all([
    tx.get(db.collection("moderationCounters").doc(uid)),
    tx.get(db.collection("accountStatuses").doc(uid)),
  ]);
  if (snapshot.exists && snapshot.data().banned === true) {
    fail("permission-denied", "This account is suspended from the service.");
  }
  if (accountStatus.exists && accountStatus.data().deactivated === true) {
    fail("permission-denied", "This account is deactivated. Sign in again to reactivate it.");
  }
  return snapshot.exists ? snapshot.data() : {};
}

async function assertRandomAccess(tx, uid) {
  if (!(await canRandomAccess(tx, uid))) {
    fail("permission-denied", "Random chat access is temporarily suspended.");
  }
}

async function canRandomAccess(tx, uid) {
  const [snapshot, accountStatus] = await Promise.all([
    tx.get(db.collection("moderationCounters").doc(uid)),
    tx.get(db.collection("accountStatuses").doc(uid)),
  ]);
  if (accountStatus.exists && accountStatus.data().deactivated === true) return false;
  if (!snapshot.exists) return true;
  const moderation = snapshot.data();
  return moderation.banned !== true &&
    !(moderation.randomChatSuspendedUntil &&
      moderation.randomChatSuspendedUntil.toMillis() > Date.now());
}

async function getPairStatus(tx, uidA, uidB) {
  const [ab, ba, blockAB, blockBA] = await Promise.all([
    tx.get(db.doc(`connections/${uidA}/users/${uidB}`)),
    tx.get(db.doc(`connections/${uidB}/users/${uidA}`)),
    tx.get(db.doc(`blocks/${uidA}/users/${uidB}`)),
    tx.get(db.doc(`blocks/${uidB}/users/${uidA}`)),
  ]);
  return {
    blocked: blockAB.exists || blockBA.exists,
    connected: ab.exists && ba.exists &&
      ab.data().status === "accepted" && ba.data().status === "accepted",
  };
}

async function assertPairAllowed(tx, uidA, uidB) {
  const status = await getPairStatus(tx, uidA, uidB);
  if (status.blocked) fail("permission-denied", "This user is unavailable.");
  return status.connected;
}

exports.updatePublicProfile = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["username", "displayName", "bio", "avatarId", "encryptionPublicKey"]);
  const username = stringField(data, "username", 3, 20).toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    fail("invalid-argument", "Username may contain only letters, numbers, underscores, and periods.");
  }
  const displayName = stringField(data, "displayName", 1, 60);
  const bio = optionalString(data, "bio", 280);
  const avatarId = data.avatarId === undefined ? "leaf" : stringField(data, "avatarId", 1, 20);
  if (!["leaf", "bloom", "sun", "moon", "wave", "moss", "star", "flower"].includes(avatarId)) {
    fail("invalid-argument", "Choose one of the available illustrated avatars.");
  }
  const encryptionPublicKey = validatePublicJwk(data.encryptionPublicKey);
  const profileRef = db.collection("publicProfiles").doc(uid);
  const usernameRef = db.collection("usernames").doc(username);

  await consumeRateLimit(uid, "updatePublicProfile", 10, DAY_MS);
  await db.runTransaction(async (tx) => {
    await assertNotBanned(tx, uid);
    const [taken, current] = await Promise.all([tx.get(usernameRef), tx.get(profileRef)]);
    if (taken.exists && taken.data().uid !== uid) {
      fail("already-exists", "That username is already taken.");
    }
    const previous = current.exists ? current.data().username : null;
    if (previous && previous !== username) {
      const previousRef = db.collection("usernames").doc(previous.toLowerCase());
      const previousDoc = await tx.get(previousRef);
      if (previousDoc.exists && previousDoc.data().uid === uid) tx.delete(previousRef);
    }
    tx.set(usernameRef, { uid, username });
    const profileUpdate = {
      uid,
      username,
      displayName,
      bio,
      avatarId,
      avatarUrl: FieldValue.delete(),
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (encryptionPublicKey !== undefined) {
      profileUpdate.encryptionPublicKey = encryptionPublicKey === null
        ? FieldValue.delete()
        : encryptionPublicKey;
    }
    tx.set(profileRef, profileUpdate, { merge: true });
  });
  return { username, updated: true };
});

exports.getAccountStatus = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const [snapshot, accountStatus] = await Promise.all([
    db.collection("moderationCounters").doc(uid).get(),
    db.collection("accountStatuses").doc(uid).get(),
  ]);
  const moderation = snapshot.exists ? snapshot.data() : {};
  const suspendedUntil = moderation.randomChatSuspendedUntil || null;
  return {
    banned: moderation.banned === true,
    deactivated: accountStatus.exists && accountStatus.data().deactivated === true,
    randomChatSuspended: Boolean(suspendedUntil && suspendedUntil.toMillis() > Date.now()),
    randomChatSuspendedUntil: suspendedUntil ? suspendedUntil.toDate().toISOString() : null,
  };
});

exports.sendConnectionRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["recipientUid"]);
  const recipientUid = requireUid(data.recipientUid);
  if (recipientUid === uid) fail("invalid-argument", "You cannot connect with yourself.");
  const incomingRef = db.collection("connectionRequests").doc(connectionRequestId(recipientUid, uid));
  const requestRef = db.collection("connectionRequests").doc(connectionRequestId(uid, recipientUid));
  const outgoingRef = requestRef;
  const now = FieldValue.serverTimestamp();

  await consumeRateLimit(uid, "connectionRequest", 10, 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    await assertNotBanned(tx, uid);
    const [recipient, moderation, reverse, outgoing, relationship] = await Promise.all([
      tx.get(db.collection("users").doc(recipientUid)),
      tx.get(db.collection("moderationCounters").doc(recipientUid)),
      tx.get(incomingRef),
      tx.get(outgoingRef),
      tx.get(db.doc(`connections/${uid}/users/${recipientUid}`)),
    ]);
    if (!recipient.exists) fail("not-found", "User not found.");
    if (reverse.exists && reverse.data().status === "pending") {
      fail("failed-precondition", "This user has already sent you a request.");
    }
    if (outgoing.exists && outgoing.data().status === "pending") {
      fail("already-exists", "A request is already pending.");
    }
    if (relationship.exists && relationship.data().status === "accepted") {
      fail("already-exists", "You are already connected.");
    }
    if (moderation.exists && moderation.data().banned === true) {
      fail("not-found", "User not found.");
    }
    if (await assertPairAllowed(tx, uid, recipientUid)) {
      fail("already-exists", "You are already connected.");
    }
    tx.set(requestRef, { senderUid: uid, recipientUid, status: "pending", createdAt: now });
  });
  return { requestId: requestRef.id };
});

exports.respondToConnectionRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["requestId", "accept"]);
  const requestId = documentId(data, "requestId");
  if (typeof data.accept !== "boolean") fail("invalid-argument", "accept must be a boolean.");
  const requestRef = db.collection("connectionRequests").doc(requestId);

  await consumeRateLimit(uid, "respondConnection", 30, 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    await assertNotBanned(tx, uid);
    const snap = await tx.get(requestRef);
    if (!snap.exists || snap.data().recipientUid !== uid) {
      fail("not-found", "Connection request not found.");
    }
    const item = snap.data();
    if (item.status !== "pending") fail("failed-precondition", "Request is no longer pending.");
    const senderUid = requireUid(item.senderUid);
    if (await assertPairAllowed(tx, uid, senderUid)) {
      fail("failed-precondition", "This user is unavailable.");
    }
    const pairRefs = [
      db.collection("connectionRequests").doc(connectionRequestId(uid, senderUid)),
      db.collection("connectionRequests").doc(connectionRequestId(senderUid, uid)),
    ];
    const pairDocs = await Promise.all(pairRefs.map((ref) => tx.get(ref)));
    if (data.accept) {
      const relationshipData = {
        status: "accepted",
        connectedAt: FieldValue.serverTimestamp(),
      };
      tx.set(db.doc(`connections/${uid}/users/${senderUid}`), {
        uid: senderUid, ...relationshipData,
      });
      tx.set(db.doc(`connections/${senderUid}/users/${uid}`), {
        uid, ...relationshipData,
      });
    }
    tx.update(requestRef, { status: data.accept ? "accepted" : "declined", respondedAt: FieldValue.serverTimestamp() });
    if (data.accept) {
      for (const pairDoc of pairDocs) {
        if (pairDoc.ref.path === requestRef.path || !pairDoc.exists ||
            pairDoc.data().status !== "pending") continue;
        tx.update(pairDoc.ref, {
          status: "cancelled",
          respondedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  });
  return { accepted: data.accept };
});

exports.blockUser = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["targetUid"]);
  const targetUid = requireUid(data.targetUid);
  if (targetUid === uid) fail("invalid-argument", "You cannot block yourself.");
  await consumeRateLimit(uid, "blockUser", 30, 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    const ownBlock = db.doc(`blocks/${uid}/users/${targetUid}`);
    const requestRefs = [
      db.collection("connectionRequests").doc(connectionRequestId(uid, targetUid)),
      db.collection("connectionRequests").doc(connectionRequestId(targetUid, uid)),
    ];
    const [ownSnap, requestDocs, ownRooms, targetRooms] = await Promise.all([
      tx.get(ownBlock),
      Promise.all(requestRefs.map((ref) => tx.get(ref))),
      tx.get(db.collectionGroup("members")
        .where("uid", "==", uid).where("expiresAt", ">", Timestamp.now()).limit(20)),
      tx.get(db.collectionGroup("members")
        .where("uid", "==", targetUid).where("expiresAt", ">", Timestamp.now()).limit(20)),
    ]);
    const ownRoomIds = new Set(ownRooms.docs.map((doc) => doc.ref.parent.parent.id));
    const sharedRoomRefs = targetRooms.docs
      .filter((doc) => ownRoomIds.has(doc.ref.parent.parent.id))
      .map((doc) => db.collection("randomRooms").doc(doc.ref.parent.parent.id));
    const sharedRooms = await Promise.all(sharedRoomRefs.map((ref) => tx.get(ref)));
    if (!ownSnap.exists) tx.set(ownBlock, { createdAt: FieldValue.serverTimestamp() });
    tx.delete(db.doc(`connections/${uid}/users/${targetUid}`));
    tx.delete(db.doc(`connections/${targetUid}/users/${uid}`));
    for (const room of sharedRooms) {
      if (room.exists && ["waiting", "active"].includes(room.data().status)) {
        tx.update(room.ref, { status: "closed", closedAt: FieldValue.serverTimestamp() });
      }
    }
    for (const item of requestDocs) {
      if (item.exists && item.data().status === "pending") {
        tx.update(item.ref, { status: "cancelled", respondedAt: FieldValue.serverTimestamp() });
      }
    }
  });
  return { blocked: true };
});

exports.unblockUser = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["targetUid"]);
  const targetUid = requireUid(data.targetUid);
  await consumeRateLimit(uid, "unblockUser", 30, 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    tx.delete(db.doc(`blocks/${uid}/users/${targetUid}`));
  });
  return { blocked: false };
});

exports.createDirectChat = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["otherUid"]);
  const otherUid = requireUid(data.otherUid);
  if (otherUid === uid) fail("invalid-argument", "You cannot chat with yourself.");
  const participants = [uid, otherUid].sort();
  const chatId = crypto.createHash("sha256").update(pairKey(uid, otherUid)).digest("hex");
  const chatRef = db.collection("directChats").doc(chatId);

  await consumeRateLimit(uid, "createDirectChat", 30, 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    await assertNotBanned(tx, uid);
    await assertNotBanned(tx, otherUid);
    if (!(await assertPairAllowed(tx, uid, otherUid))) {
      fail("permission-denied", "Only accepted connections may start a direct chat.");
    }
    const snap = await tx.get(chatRef);
    if (!snap.exists) {
      tx.create(chatRef, {
        participantUids: participants,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { chatId };
});

exports.sendDirectMessage = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["chatId", "ciphertext", "nonce", "algorithm", "clientMessageId"]);
  const chatId = documentId(data, "chatId", 128);
  if (!/^[a-f0-9]{64}$/.test(chatId)) fail("invalid-argument", "Invalid chat.");
  const ciphertext = stringField(data, "ciphertext", 1, 20000);
  const nonce = stringField(data, "nonce", 1, 512);
  const algorithm = optionalString(data, "algorithm", 64);
  const clientMessageId = stringField(data, "clientMessageId", 8, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(clientMessageId)) {
    fail("invalid-argument", "clientMessageId contains unsupported characters.");
  }
  const chatRef = db.collection("directChats").doc(chatId);
  const messageId = crypto.createHash("sha256")
    .update(JSON.stringify([chatId, uid, clientMessageId]))
    .digest("hex");
  const messageRef = chatRef.collection("messages").doc(messageId);
  await consumeRateLimit(uid, "directMessage", 120, 60 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    const [chat, existing] = await Promise.all([tx.get(chatRef), tx.get(messageRef)]);
    if (!chat.exists || !Array.isArray(chat.data().participantUids) ||
        chat.data().participantUids.length !== 2 ||
        !chat.data().participantUids.includes(uid)) {
      fail("not-found", "Chat not found.");
    }
    const otherUid = chat.data().participantUids.find((participant) => participant !== uid);
    await assertNotBanned(tx, uid);
    await assertNotBanned(tx, otherUid);
    if (!(await assertPairAllowed(tx, uid, otherUid))) {
      fail("permission-denied", "Only accepted connections may message.");
    }
    if (!existing.exists) {
      tx.create(messageRef, {
        senderUid: uid,
        ciphertext,
        nonce,
        algorithm,
        clientMessageId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { messageId };
});

exports.findRandomChat = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["encryptionPublicKey"]);
  const publicKey = validatePublicJwk(data.encryptionPublicKey);
  if (!publicKey) fail("invalid-argument", "encryptionPublicKey is required.");
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + RANDOM_ROOM_MS);
  const queueRef = db.collection("randomMatchQueue").doc(uid);
  const newRoomRef = db.collection("randomRooms").doc();
  let result;

  await consumeRateLimit(uid, "findRandomChat", 30, 60 * 1000);
  await db.runTransaction(async (tx) => {
    await assertRandomAccess(tx, uid);
    const ownQueue = await tx.get(queueRef);
    let clearStaleQueue = false;
    if (ownQueue.exists && ownQueue.data().expiresAt.toMillis() > now) {
      const existingRoom = db.collection("randomRooms").doc(ownQueue.data().roomId);
      const roomSnap = await tx.get(existingRoom);
      if (roomSnap.exists && ["waiting", "active"].includes(roomSnap.data().status) &&
          roomSnap.data().expiresAt.toMillis() > now) {
        const response = {
          roomId: existingRoom.id,
          status: roomSnap.data().status,
          alias: ownQueue.data().alias,
          expiresAt: roomSnap.data().expiresAt.toDate().toISOString(),
        };
        if (roomSnap.data().status === "active") {
          const roomMembers = await tx.get(existingRoom.collection("members").limit(2));
          const peer = roomMembers.docs.find((member) => member.id !== uid);
          if (peer && peer.data().encryptionPublicKey) {
            response.peerEncryptionPublicKey = peer.data().encryptionPublicKey;
          }
        } else if (roomSnap.data().status === "waiting") {
          const ownMemberRef = existingRoom.collection("members").doc(uid);
          const ownMember = await tx.get(ownMemberRef);
          if (ownMember.exists) {
            tx.update(ownMemberRef, { encryptionPublicKey: publicKey });
            tx.update(queueRef, { encryptionPublicKey: publicKey });
          }
        }
        result = response;
        return;
      }
      clearStaleQueue = true;
    }

    const waiting = await tx.get(db.collection("randomMatchQueue")
      .where("status", "==", "waiting")
      .limit(20));
    const candidates = [];
    for (const queued of waiting.docs) {
      const otherUid = queued.id;
      if (otherUid === uid) continue;
      const roomRef = db.collection("randomRooms").doc(queued.data().roomId);
      const roomSnap = await tx.get(roomRef);
      if (!roomSnap.exists || roomSnap.data().status !== "waiting" ||
          roomSnap.data().expiresAt.toMillis() <= now) continue;
      const queuedMember = await tx.get(roomRef.collection("members").doc(otherUid));
      if (!queuedMember.exists || !queuedMember.data().encryptionPublicKey) continue;
      const pair = await getPairStatus(tx, uid, otherUid);
      if (pair.blocked || pair.connected) continue;
      if (!(await canRandomAccess(tx, otherUid))) continue;
      candidates.push({ queued, roomRef, room: roomSnap.data(), member: queuedMember.data() });
    }

    if (candidates.length) {
      const candidate = candidates[crypto.randomInt(candidates.length)];
      const alias = randomAlias();
      const matchedExpiresAt = Timestamp.fromMillis(now + RANDOM_ROOM_MS);
      const cleanupAt = Timestamp.fromMillis(now + RANDOM_ROOM_MS + RANDOM_METADATA_RETENTION_MS);
      tx.update(candidate.roomRef, {
        status: "active",
        expiresAt: matchedExpiresAt,
        cleanupAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(candidate.roomRef.collection("members").doc(candidate.queued.id), {
        expiresAt: cleanupAt,
        cleanupAt,
      });
      tx.create(db.doc(`randomRooms/${candidate.roomRef.id}/members/${uid}`), {
        uid,
        alias,
        encryptionPublicKey: publicKey,
        usernameSharing: false,
        joinedAt: FieldValue.serverTimestamp(),
        expiresAt: cleanupAt,
        cleanupAt,
      });
      tx.update(candidate.queued.ref, {
        status: "matched",
        expiresAt: matchedExpiresAt,
        matchedAt: FieldValue.serverTimestamp(),
      });
      tx.set(queueRef, {
        roomId: candidate.roomRef.id,
        status: "matched",
        alias,
        encryptionPublicKey: publicKey,
        expiresAt: matchedExpiresAt,
      });
      result = {
        roomId: candidate.roomRef.id,
        status: "active",
        alias,
        peerEncryptionPublicKey: candidate.member.encryptionPublicKey,
        expiresAt: matchedExpiresAt.toDate().toISOString(),
      };
      return;
    }

    if (clearStaleQueue) tx.delete(queueRef);
    const alias = randomAlias();
    const cleanupAt = Timestamp.fromMillis(now + RANDOM_ROOM_MS + RANDOM_METADATA_RETENTION_MS);
    tx.create(newRoomRef, { status: "waiting", expiresAt, cleanupAt, createdAt: FieldValue.serverTimestamp() });
    tx.create(db.doc(`randomRooms/${newRoomRef.id}/members/${uid}`), {
      uid,
      alias,
      encryptionPublicKey: publicKey,
      usernameSharing: false,
      joinedAt: FieldValue.serverTimestamp(),
      expiresAt: cleanupAt,
      cleanupAt,
    });
    tx.set(queueRef, {
      roomId: newRoomRef.id,
      status: "waiting",
      alias,
      encryptionPublicKey: publicKey,
      expiresAt,
    });
    result = { roomId: newRoomRef.id, status: "waiting", alias, expiresAt: expiresAt.toDate().toISOString() };
  });
  return result;
});

exports.sendRandomChatMessage = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["roomId", "ciphertext", "nonce", "algorithm"]);
  const roomId = documentId(data, "roomId");
  const ciphertext = stringField(data, "ciphertext", 1, 20000);
  const nonce = stringField(data, "nonce", 1, 512);
  const algorithm = optionalString(data, "algorithm", 64);
  const roomRef = db.collection("randomRooms").doc(roomId);
  const messageRef = roomRef.collection("messages").doc();
  await consumeRateLimit(uid, "randomMessage", 60, 60 * 1000);
  await db.runTransaction(async (tx) => {
    await assertRandomAccess(tx, uid);
    const [room, member, queue] = await Promise.all([
      tx.get(roomRef),
      tx.get(roomRef.collection("members").doc(uid)),
      tx.get(db.collection("randomMatchQueue").doc(uid)),
    ]);
    if (!room.exists || room.data().status !== "active" ||
        room.data().expiresAt.toMillis() <= Date.now() || !member.exists) {
      fail("failed-precondition", "This random chat has expired or is unavailable.");
    }
    const otherMember = await tx.get(roomRef.collection("members").limit(2));
    const otherUid = otherMember.docs.map((doc) => doc.id).find((id) => id !== uid);
    if (!otherUid) fail("failed-precondition", "This random chat is unavailable.");
    const pairAllowed = await assertPairAllowed(tx, uid, otherUid);
    if (pairAllowed) fail("permission-denied", "This user is unavailable.");
    tx.create(messageRef, {
      senderAlias: member.data().alias,
      ciphertext,
      nonce,
      algorithm,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: room.data().expiresAt,
    });
    if (queue.exists && queue.data().roomId === roomId && queue.data().expiresAt.toMillis() <= Date.now()) {
      tx.delete(queue.ref);
    }
  });
  return { messageId: messageRef.id };
});

exports.shareRandomUsername = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["roomId", "share"]);
  const roomId = documentId(data, "roomId");
  if (typeof data.share !== "boolean") fail("invalid-argument", "share must be a boolean.");
  const roomRef = db.collection("randomRooms").doc(roomId);
  const memberRef = roomRef.collection("members").doc(uid);
  await consumeRateLimit(uid, "shareRandomUsername", 10, DAY_MS);
  await db.runTransaction(async (tx) => {
    const [room, member] = await Promise.all([tx.get(roomRef), tx.get(memberRef)]);
    if (!room.exists || !member.exists) fail("not-found", "Random chat not found.");
    if (room.data().status !== "closed" && room.data().expiresAt.toMillis() > Date.now()) {
      fail("failed-precondition", "Username sharing is available after the chat ends.");
    }
    tx.update(memberRef, {
      usernameSharing: data.share,
      usernameSharingUpdatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { share: data.share };
});

exports.getRandomChatStatus = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["roomId"]);
  const roomId = documentId(data, "roomId");
  const roomRef = db.collection("randomRooms").doc(roomId);
  await consumeRateLimit(uid, "getRandomChatStatus", 120, 60 * 1000);
  const result = await db.runTransaction(async (tx) => {
    const [room, ownMember, members] = await Promise.all([
      tx.get(roomRef),
      tx.get(roomRef.collection("members").doc(uid)),
      tx.get(roomRef.collection("members").limit(2)),
    ]);
    if (!room.exists || !ownMember.exists) fail("not-found", "Random chat not found.");
    const roomData = room.data();
    const closed = roomData.status === "closed" || roomData.expiresAt.toMillis() <= Date.now();
    const peer = members.docs.find((member) => member.id !== uid);
    const response = {
      status: closed ? "closed" : roomData.status,
      expiresAt: roomData.expiresAt.toDate().toISOString(),
    };
    const blocked = peer && (await getPairStatus(tx, uid, peer.id)).blocked;
    if (closed && peer && !blocked && peer.data().usernameSharing === true) {
      const profile = await tx.get(db.collection("publicProfiles").doc(peer.id));
      if (profile.exists && typeof profile.data().username === "string") {
        response.peerUsername = profile.data().username;
      }
    }
    return response;
  });
  return result;
});

exports.leaveRandomChat = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["roomId"]);
  const roomId = documentId(data, "roomId");
  const roomRef = db.collection("randomRooms").doc(roomId);
  await consumeRateLimit(uid, "leaveRandomChat", 30, 60 * 1000);
  await db.runTransaction(async (tx) => {
    const memberRef = roomRef.collection("members").doc(uid);
    const [room, member, members] = await Promise.all([
      tx.get(roomRef), tx.get(memberRef), tx.get(roomRef.collection("members").limit(2)),
    ]);
    const participantUids = members.docs.map((item) => item.id);
    const queues = await Promise.all(participantUids.map((participantUid) =>
      tx.get(db.collection("randomMatchQueue").doc(participantUid))));
    for (let index = 0; index < queues.length; index += 1) {
      if (queues[index].exists && queues[index].data().roomId === roomId) {
        tx.delete(queues[index].ref);
      }
    }
    if (room.exists && member.exists) {
      tx.update(roomRef, { status: "closed", closedAt: FieldValue.serverTimestamp() });
    }
  });
  return { left: true };
});

exports.submitUserReport = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["targetUid", "category", "description"]);
  const targetUid = requireUid(data.targetUid);
  if (targetUid === uid) fail("invalid-argument", "You cannot report yourself.");
  const category = stringField(data, "category", 2, 40);
  if (!["harassment", "spam", "threats", "impersonation", "other"].includes(category)) {
    fail("invalid-argument", "Unsupported report category.");
  }
  const description = stringField(data, "description", 10, 4000);
  const dayBucket = Math.floor(Date.now() / REPORT_WINDOW_MS);
  const reportId = crypto.createHash("sha256")
    .update(JSON.stringify([uid, targetUid, dayBucket])).digest("hex");
  const reportRef = db.collection("userReports").doc(reportId);
  const counterRef = db.collection("moderationCounters").doc(targetUid);
  await consumeRateLimit(uid, "submitReport", 5, DAY_MS);
  await db.runTransaction(async (tx) => {
    await assertNotBanned(tx, uid);
    const [existing, target, targetUser] = await Promise.all([
      tx.get(reportRef),
      tx.get(counterRef),
      tx.get(db.collection("users").doc(targetUid)),
    ]);
    if (existing.exists) fail("already-exists", "You have already reported this user today.");
    if (!targetUser.exists) fail("not-found", "User not found.");
    const reportCount = (target.exists ? target.data().reportCount : 0) + 1;
    const updates = {
      reportCount,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (reportCount >= 5) {
      updates.randomChatSuspendedUntil = Timestamp.fromMillis(Date.now() + 30 * DAY_MS);
    }
    if (reportCount > 10) {
      updates.banned = true;
      updates.bannedAt = FieldValue.serverTimestamp();
    }
    tx.set(counterRef, updates, { merge: true });
    tx.create(reportRef, {
      reporterUid: uid,
      targetUid,
      category,
      description,
      status: "submitted",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { reportId };
});

exports.submitRandomChatReport = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["roomId", "category", "description"]);
  const roomId = documentId(data, "roomId");
  const category = stringField(data, "category", 2, 40);
  if (!["harassment", "spam", "threats", "impersonation", "other"].includes(category)) {
    fail("invalid-argument", "Unsupported report category.");
  }
  const description = stringField(data, "description", 10, 4000);
  const roomRef = db.collection("randomRooms").doc(roomId);
  const membersRef = roomRef.collection("members");
  await consumeRateLimit(uid, "submitRandomChatReport", 5, DAY_MS);

  const reportResult = await db.runTransaction(async (tx) => {
    await assertNotBanned(tx, uid);
    const [room, reporterMember, members] = await Promise.all([
      tx.get(roomRef),
      tx.get(membersRef.doc(uid)),
      tx.get(membersRef.limit(3)),
    ]);
    if (!room.exists || !reporterMember.exists) {
      fail("not-found", "Random chat not found.");
    }
    const peerMember = members.docs.find((member) => member.id !== uid);
    if (!peerMember || members.size !== 2) {
      fail("failed-precondition", "This random chat has no reportable peer.");
    }
    const targetUid = requireUid(peerMember.id);
    if (targetUid === uid) fail("failed-precondition", "This random chat is invalid.");

    const dayBucket = Math.floor(Date.now() / REPORT_WINDOW_MS);
    const reportId = crypto.createHash("sha256")
      .update(JSON.stringify([uid, targetUid, dayBucket])).digest("hex");
    const reportRef = db.collection("userReports").doc(reportId);
    const counterRef = db.collection("moderationCounters").doc(targetUid);
    const [existing, target] = await Promise.all([tx.get(reportRef), tx.get(counterRef)]);
    if (existing.exists) fail("already-exists", "You have already reported this user today.");

    const reportCount = (target.exists ? target.data().reportCount : 0) + 1;
    const updates = {
      reportCount,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (reportCount >= 5) {
      updates.randomChatSuspendedUntil = Timestamp.fromMillis(Date.now() + 30 * DAY_MS);
    }
    if (reportCount > 10) {
      updates.banned = true;
      updates.bannedAt = FieldValue.serverTimestamp();
    }
    tx.set(counterRef, updates, { merge: true });
    tx.create(reportRef, {
      reporterUid: uid,
      targetUid,
      source: "randomChat",
      roomId,
      category,
      description,
      status: "submitted",
      createdAt: FieldValue.serverTimestamp(),
    });
    return reportId;
  });

  return { reportId: reportResult };
});

exports.submitModerationAppeal = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = inputObject(request.data);
  onlyKeys(data, ["explanation"]);
  const explanation = stringField(data, "explanation", 20, 4000);
  const appealId = crypto.randomUUID();
  const appealRef = db.collection("moderationAppeals").doc(appealId);
  await consumeRateLimit(uid, "moderationAppeal", 3, DAY_MS);
  await db.runTransaction(async (tx) => {
    const counter = await tx.get(db.collection("moderationCounters").doc(uid));
    const activeSuspension = counter.exists && counter.data().randomChatSuspendedUntil &&
      counter.data().randomChatSuspendedUntil.toMillis() > Date.now();
    if (!counter.exists || (!counter.data().banned && !activeSuspension)) {
      fail("failed-precondition", "There is no active moderation action to appeal.");
    }
    tx.create(appealRef, {
      uid,
      explanation,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { appealId, status: "pending" };
});

exports.reviewModerationAppeal = onCall({ region: REGION }, async (request) => {
  const moderatorUid = requireAuth(request);
  if (request.auth.token.admin !== true) {
    fail("permission-denied", "Administrator access is required.");
  }
  const data = inputObject(request.data);
  onlyKeys(data, ["appealId", "decision", "reviewNote"]);
  const appealId = documentId(data, "appealId");
  if (!["reinstate", "uphold"].includes(data.decision)) {
    fail("invalid-argument", "decision must be reinstate or uphold.");
  }
  const reviewNote = optionalString(data, "reviewNote", 4000);
  const appealRef = db.collection("moderationAppeals").doc(appealId);
  await consumeRateLimit(moderatorUid, "reviewModerationAppeal", 100, 60 * 60 * 1000);

  await db.runTransaction(async (tx) => {
    const appeal = await tx.get(appealRef);
    if (!appeal.exists) fail("not-found", "Appeal not found.");
    const appealData = appeal.data();
    if (appealData.status !== "pending") {
      fail("failed-precondition", "This appeal has already been reviewed.");
    }
    const uid = requireUid(appealData.uid);
    const counterRef = db.collection("moderationCounters").doc(uid);
    const counter = await tx.get(counterRef);
    const reviewStatus = data.decision === "reinstate" ? "reinstated" : "upheld";
    tx.update(appealRef, {
      status: reviewStatus,
      decision: data.decision,
      moderatorUid,
      reviewNote,
      reviewedAt: FieldValue.serverTimestamp(),
    });

    if (data.decision === "reinstate" && counter.exists) {
      const moderation = counter.data();
      const updates = {};
      if (moderation.banned === true) {
        updates.banned = FieldValue.delete();
        updates.bannedAt = FieldValue.delete();
      }
      if (moderation.randomChatSuspendedUntil &&
          moderation.randomChatSuspendedUntil.toMillis() > Date.now()) {
        updates.randomChatSuspendedUntil = FieldValue.delete();
      }
      if (Object.keys(updates).length) {
        updates.updatedAt = FieldValue.serverTimestamp();
        tx.update(counterRef, updates);
      }
    }
  });
  return {
    appealId,
    status: data.decision === "reinstate" ? "reinstated" : "upheld",
    moderatorUid,
  };
});

exports.deactivateAccount = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  onlyKeys(inputObject(request.data), []);
  const statusRef = db.collection("accountStatuses").doc(uid);
  const profileRef = db.collection("publicProfiles").doc(uid);
  await db.runTransaction(async (tx) => {
    const profile = await tx.get(profileRef);
    tx.set(statusRef, {
      deactivated: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (profile.exists) {
      tx.update(profileRef, {
        active: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.delete(db.collection("randomMatchQueue").doc(uid));
  });
  return { deactivated: true };
});

exports.reactivateAccount = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  onlyKeys(inputObject(request.data), []);
  const statusRef = db.collection("accountStatuses").doc(uid);
  const profileRef = db.collection("publicProfiles").doc(uid);
  await db.runTransaction(async (tx) => {
    const profile = await tx.get(profileRef);
    tx.set(statusRef, {
      deactivated: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (profile.exists) {
      tx.update(profileRef, {
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { deactivated: false };
});

exports.deleteAccount = onCall({ region: REGION, timeoutSeconds: 540 }, async (request) => {
  const uid = requireAuth(request);
  onlyKeys(inputObject(request.data), []);
  const authTime = Number(request.auth.token.auth_time || 0) * 1000;
  if (!authTime || Date.now() - authTime > 5 * 60 * 1000) {
    fail("failed-precondition", "For security, sign out and sign in again before deleting your account.");
  }

  const userRef = db.collection("users").doc(uid);
  const [userSnapshot, publicProfileSnapshot, connections, requests, blocks, chats, authoredNotes, featuredNotes, receivedFeatures, memberships, reactions, votes] =
    await Promise.all([
      userRef.get(),
      db.collection("publicProfiles").doc(uid).get(),
      db.collection("connections").doc(uid).collection("users").get(),
      Promise.all([
        db.collection("connectionRequests").where("senderUid", "==", uid).get(),
        db.collection("connectionRequests").where("recipientUid", "==", uid).get(),
      ]),
      db.collection("blocks").doc(uid).collection("users").get(),
      db.collection("directChats").where("participantUids", "array-contains", uid).get(),
      db.collection("publicNotes").where("authorUid", "==", uid).get(),
      db.collection("featuredNotes").where("featuredByUserId", "==", uid).get(),
      db.collection("featuredNotes").where("originalAuthorId", "==", uid).get(),
      db.collectionGroup("members").where("uid", "==", uid).get(),
      db.collectionGroup("reactions").where("authorUid", "==", uid).get(),
      db.collectionGroup("votes").where("authorUid", "==", uid).get(),
    ]);

  const username = publicProfileSnapshot.exists ? publicProfileSnapshot.data().username : userSnapshot.data()?.username;
  await Promise.all(connections.docs.flatMap((connection) => [
    connection.ref.delete(),
    db.doc(`connections/${connection.id}/users/${uid}`).delete(),
  ]));
  await Promise.all(blocks.docs.flatMap((block) => [
    block.ref.delete(),
    db.doc(`blocks/${block.id}/users/${uid}`).delete(),
  ]));
  await Promise.all(requests.flatMap((snapshot) => snapshot.docs.map((item) => item.ref.delete())));
  await Promise.all(chats.docs.map((chat) => db.recursiveDelete(chat.ref)));
  await Promise.all([...reactions.docs, ...votes.docs].map((interaction) => interaction.ref.delete()));
  const randomRoomRefs = new Map(memberships.docs.map((member) => {
    const roomRef = member.ref.parent.parent;
    return [roomRef.path, roomRef];
  }));
  await Promise.all([...randomRoomRefs.values()].map((roomRef) => db.recursiveDelete(roomRef)));
  await Promise.all(authoredNotes.docs.map((note) => db.recursiveDelete(note.ref)));
  await Promise.all([...featuredNotes.docs, ...receivedFeatures.docs].map((note) => note.ref.delete()));

  const comments = await db.collectionGroup("comments").where("authorUid", "==", uid).get();
  await Promise.all(comments.docs.map((comment) => comment.ref.delete()));

  if (username) {
    const usernameRef = db.collection("usernames").doc(String(username).toLowerCase());
    const reservedUsername = await usernameRef.get();
    if (reservedUsername.exists && reservedUsername.data().uid === uid) await usernameRef.delete();
  }
  await db.recursiveDelete(userRef);
  await Promise.all([
    db.collection("publicProfiles").doc(uid).delete(),
    db.collection("accountStatuses").doc(uid).delete(),
    db.collection("randomMatchQueue").doc(uid).delete(),
  ]);
  await getAuth().deleteUser(uid);
  return { deleted: true };
});
