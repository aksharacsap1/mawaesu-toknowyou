import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, endAt, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where, startAfter, startAt
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { decryptMessage, encryptMessage, getKeyFingerprint, getOrCreateIdentity } from "./social-crypto.js";
import { getAvatarOption } from "./avatars.js";

const $ = id => document.getElementById(id);

function setStatus(id, message, isError = false) {
  const element = $(id);
  if (!element) return;
  let displayMessage = message;
  if (/\binternal\b|functions\/(?:not-found|unavailable)/i.test(message)) {
    displayMessage = "This service is temporarily unavailable. Please try again later.";
  } else if (/missing or insufficient permissions|permission-denied/i.test(message)) {
    displayMessage = "This action isn’t available for your account right now. Make sure you’re signed in and try again.";
  } else if (/failed-precondition.*index|requires an index/i.test(message)) {
    displayMessage = "This feature is not fully configured yet. Please try again later.";
  }
  element.textContent = displayMessage;
  element.style.color = isError ? "#ff9b9b" : "";
}

function makeProfileAvatar(profile, label = "") {
  const option = getAvatarOption(profile.avatarId);
  const avatar = document.createElement("div");
  avatar.className = "profileAvatar";
  avatar.setAttribute("role", "img");
  avatar.setAttribute("aria-label", label || `${profile.displayName || profile.username || "Member"}'s ${option.label} avatar`);
  avatar.textContent = option.symbol;
  avatar.style.backgroundColor = option.color;
  return avatar;
}

function formatTimestamp(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function directChatId(currentUid, peerUid) {
  const participantUids = [currentUid, peerUid].sort();
  const bytes = new TextEncoder().encode(JSON.stringify(participantUids));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function makeButton(text, callback, className = "btn btn-secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", callback);
  return button;
}

function makeItem(title, detail = "") {
  const item = document.createElement("div");
  item.className = "socialItem";
  const heading = document.createElement("strong");
  heading.textContent = title;
  item.appendChild(heading);
  if (detail) {
    const paragraph = document.createElement("p");
    paragraph.textContent = detail;
    item.appendChild(paragraph);
  }
  return item;
}

export function initializeSocialFeatures({ auth, db }) {
  let currentUser = null;
  let identity = null;
  let myProfile = null;
  let activeChat = null;
  let chatPeer = null;
  let chatPeerProfile = null;
  let selectedPublicProfile = null;
  let reportTarget = null;
  let searchDebounce = null;
  let searchRequestVersion = 0;
  let listeners = [];
  let directMessageListener = null;
  let noteFeedListener = null;
  let featuredFeedListener = null;
  const noteListeners = new Map();
  const profileCache = new Map();

  async function readAccountStatus() {
    if (!currentUser) throw new Error("Sign in to check account status.");
    const [moderationSnapshot, accountSnapshot] = await Promise.all([
      getDoc(doc(db, "moderationCounters", currentUser.uid)),
      getDoc(doc(db, "accountStatuses", currentUser.uid))
    ]);
    const moderation = moderationSnapshot.exists() ? moderationSnapshot.data() : {};
    const account = accountSnapshot.exists() ? accountSnapshot.data() : {};
    return {
      banned: moderation.banned === true,
      deactivated: account.deactivated === true
    };
  }

  function stopListener(listener) {
    if (listener) listener();
  }

  function clearListeners() {
    listeners.forEach(stopListener);
    listeners = [];
    noteListeners.forEach(stopListener);
    noteListeners.clear();
    stopListener(directMessageListener);
    stopListener(noteFeedListener);
    stopListener(featuredFeedListener);
    directMessageListener = null;
    noteFeedListener = null;
    featuredFeedListener = null;
  }

  async function getPublicProfile(uid) {
    if (profileCache.has(uid)) return profileCache.get(uid);
    let snapshot;
    try {
      snapshot = await getDoc(doc(db, "publicProfiles", uid));
    } catch (error) {
      if (error.code === "permission-denied") return null;
      throw error;
    }
    const profile = snapshot.exists() ? { uid, ...snapshot.data() } : null;
    if (profile) profileCache.set(uid, profile);
    return profile;
  }

  async function publishProfile() {
    if (!currentUser) throw new Error("Sign in to save a community profile.");
    if (!identity) identity = await getOrCreateIdentity(currentUser.uid);
    await loadOwnProfile();
    const username = (myProfile?.username || "").trim();
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username)) {
      throw new Error("A valid username is required before joining the community.");
    }
    const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userSnapshot.exists() ? userSnapshot.data() : {};
    const avatarId = myProfile?.avatarId || userData.profileState?.avatarId || "leaf";
    const displayName = (userData.name || username).slice(0, 60);
    const bio = (myProfile?.bio || "").slice(0, 280);
    const usernameRef = doc(db, "usernames", username.toLowerCase());
    const profileRef = doc(db, "publicProfiles", currentUser.uid);
    await runTransaction(db, async transaction => {
      const [taken, current] = await Promise.all([
        transaction.get(usernameRef),
        transaction.get(profileRef)
      ]);
      if (taken.exists() && taken.data().uid !== currentUser.uid) {
        throw new Error("That username is already taken.");
      }
      const previousUsername = current.exists() ? current.data().username : "";
      if (previousUsername && previousUsername.toLowerCase() !== username.toLowerCase()) {
        const previousRef = doc(db, "usernames", previousUsername.toLowerCase());
        const previous = await transaction.get(previousRef);
        if (previous.exists() && previous.data().uid === currentUser.uid) transaction.delete(previousRef);
      }
      transaction.set(usernameRef, { uid: currentUser.uid, username: username.toLowerCase() });
      transaction.set(profileRef, {
        uid: currentUser.uid,
        username: username.toLowerCase(),
        displayName,
        bio,
        avatarId,
        encryptionPublicKey: identity.publicKey,
        active: true,
        updatedAt: serverTimestamp()
      });
    });
    myProfile.username = username.toLowerCase();
    profileCache.delete(currentUser.uid);
    return { username: myProfile.username, updated: true };
  }

  async function loadOwnProfile() {
    if (!currentUser) return;
    const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userSnapshot.exists() ? userSnapshot.data() : {};
    myProfile = {
      displayName: userData.name || userData.profileState?.displayName || "",
      username: userData.username || userData.profileState?.username || "",
      bio: userData.bio || userData.profileState?.bio || "",
      avatarId: userData.profileState?.avatarId || "leaf"
    };
    let profileSnapshot;
    try {
      profileSnapshot = await getDoc(doc(db, "publicProfiles", currentUser.uid));
    } catch (error) {
      if (error.code === "permission-denied" && myProfile.username) return;
      throw error;
    }
    if (profileSnapshot.exists()) {
      const publicProfile = profileSnapshot.data();
      myProfile.username = myProfile.username || publicProfile.username || "";
      myProfile.bio = myProfile.bio ?? publicProfile.bio ?? "";
      myProfile.avatarId = publicProfile.avatarId || myProfile.avatarId || "leaf";
    }
  }

  async function sendConnectionRequest(recipientUid) {
    if (recipientUid === currentUser.uid) throw new Error("You cannot connect with yourself.");
    const relationship = await getDoc(doc(db, "connections", currentUser.uid, "users", recipientUid));
    if (relationship.exists() && relationship.data().status === "accepted") {
      throw new Error("You are already connected.");
    }
    const [outgoing, incoming] = await Promise.all([
      getDocs(query(
        collection(db, "connectionRequests"),
        where("senderUid", "==", currentUser.uid),
        where("recipientUid", "==", recipientUid),
        where("status", "==", "pending")
      )),
      getDocs(query(
        collection(db, "connectionRequests"),
        where("senderUid", "==", recipientUid),
        where("recipientUid", "==", currentUser.uid),
        where("status", "==", "pending")
      ))
    ]);
    if (!outgoing.empty) throw new Error("A connection request is already pending.");
    if (!incoming.empty) throw new Error("This person has already sent you a request; you can accept it in your requests.");
    await addDoc(collection(db, "connectionRequests"), {
      senderUid: currentUser.uid,
      recipientUid,
      status: "pending",
      createdAt: serverTimestamp()
    });
  }

  async function respondToConnectionRequest(request, accept) {
    const requestRef = doc(db, "connectionRequests", request.id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists() || snapshot.data().recipientUid !== currentUser.uid ||
          snapshot.data().status !== "pending") {
        throw new Error("This connection request is no longer available.");
      }
      const senderUid = snapshot.data().senderUid;
      transaction.update(requestRef, {
        status: accept ? "accepted" : "declined",
        respondedAt: serverTimestamp()
      });
      if (accept) {
        transaction.set(doc(db, "connections", currentUser.uid, "users", senderUid), {
          uid: senderUid,
          status: "accepted",
          requestId: request.id,
          connectedAt: serverTimestamp()
        });
        transaction.set(doc(db, "connections", senderUid, "users", currentUser.uid), {
          uid: currentUser.uid,
          status: "accepted",
          requestId: request.id,
          connectedAt: serverTimestamp()
        });
      }
    });
  }

  async function blockUser(targetUid) {
    if (!targetUid || targetUid === currentUser.uid) throw new Error("Choose a valid member to block.");
    const blockRef = doc(db, "blocks", currentUser.uid, "users", targetUid);
    if ((await getDoc(blockRef)).exists()) return;
    await setDoc(blockRef, {
      uid: targetUid,
      createdAt: serverTimestamp()
    });
  }

  async function getOrCreateDirectChat(peerUid) {
    const chatId = await directChatId(currentUser.uid, peerUid);
    const chatRef = doc(db, "directChats", chatId);
    try {
      await setDoc(chatRef, {
        participantUids: [currentUser.uid, peerUid].sort(),
        createdAt: serverTimestamp()
      });
    } catch (writeError) {
      const snapshot = await getDoc(chatRef);
      if (!snapshot.exists() ||
          !Array.isArray(snapshot.data().participantUids) ||
          !snapshot.data().participantUids.includes(currentUser.uid) ||
          !snapshot.data().participantUids.includes(peerUid)) {
        throw writeError;
      }
    }
    return chatId;
  }

  function renderSearchResult(container, profile) {
    const item = document.createElement("article");
    item.className = "socialItem profileSearchResult";
    item.setAttribute("role", "listitem");
    item.appendChild(makeProfileAvatar(profile));
    const identity = document.createElement("div");
    identity.className = "profileSearchIdentity";
    identity.appendChild(makeButton(profile.displayName || profile.username, () => openPublicProfile(profile), "profileLink"));
    const username = document.createElement("span");
    username.className = "muted";
    username.textContent = `@${profile.username}`;
    identity.appendChild(username);
    if (profile.bio) {
      const bio = document.createElement("p");
      bio.textContent = profile.bio;
      identity.appendChild(bio);
    }
    item.appendChild(identity);
    container.appendChild(item);
  }

  async function renderPublicProfileTab(profile, tab = "notes") {
    const isNotes = tab === "notes";
    const panel = $(isNotes ? "publicUserNotesFeed" : "publicUserFeaturedFeed");
    panel.replaceChildren();
    try {
      if (isNotes) {
        const result = await getDocs(query(
          collection(db, "publicNotes"),
          where("authorUid", "==", profile.uid),
          limit(30)
        ));
        const sorted = result.docs.sort((a, b) =>
          (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
        );
        if (!sorted.length) panel.appendChild(makeItem("No public notes yet."));
        for (const note of sorted) await renderNote(note, panel);
        return;
      }

      const features = await getDocs(query(
        collection(db, "featuredNotes"),
        where("featuredByUserId", "==", profile.uid),
        limit(30)
      ));
      const sorted = features.docs.sort((a, b) =>
        (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
      );
      if (!sorted.length) panel.appendChild(makeItem("No featured notes yet."));
      for (const feature of sorted) {
        const data = feature.data();
        const noteId = data.originalNoteId || data.noteId;
        if (typeof noteId !== "string") continue;
        const note = await getDoc(doc(db, "publicNotes", noteId));
        if (note.exists()) {
          await renderNote(note, panel, {
            featuredByUid: profile.uid,
            originalAuthorUsername: data.originalAuthorUsername || ""
          });
        }
      }
    } catch (error) {
      setStatus("peopleSearchStatus", `Could not load this profile's ${tab}: ${error.message}`, true);
    }
  }

  function selectPublicProfileTab(tab) {
    document.querySelectorAll("[data-public-profile-tab]").forEach(button => {
      const selected = button.dataset.publicProfileTab === tab;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      $(button.getAttribute("aria-controls")).hidden = !selected;
    });
    if (selectedPublicProfile) void renderPublicProfileTab(selectedPublicProfile, tab);
  }

  async function openPublicProfile(profile) {
    selectedPublicProfile = profile;
    const panel = $("publicUserProfile");
    const content = $("publicUserProfileContent");
    content.replaceChildren();
    const header = document.createElement("header");
    header.className = "publicProfileHeader";
    header.appendChild(makeProfileAvatar(profile));
    const identity = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = profile.displayName || profile.username;
    const username = document.createElement("p");
    username.className = "muted";
    username.textContent = `@${profile.username}`;
    const bio = document.createElement("p");
    bio.className = "muted";
    bio.textContent = profile.bio || "No bio yet.";
    identity.append(title, username, bio);
    header.appendChild(identity);
    content.appendChild(header);
    panel.hidden = false;
    $("connectPublicProfileBtn").hidden = profile.uid === currentUser.uid;
    $("connectPublicProfileBtn").disabled = false;
    $("connectPublicProfileBtn").textContent = "Request connection";
    $("blockPublicProfileBtn").hidden = profile.uid === currentUser.uid;
    selectPublicProfileTab("notes");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function navigateToPublicProfile(profile) {
    if ($("searchPage").classList.contains("active")) {
      void openPublicProfile(profile);
      return;
    }
    document.dispatchEvent(new CustomEvent("mawaesu-open-public-profile", { detail: profile }));
  }

  async function searchPeople() {
    const username = $("peopleSearchInput").value.trim().replace(/^@/, "").toLowerCase();
    const results = $("peopleSearchResults");
    const requestVersion = ++searchRequestVersion;
    results.replaceChildren();
    setStatus("peopleSearchStatus", "");
    if (!/^[a-z0-9_.]{1,20}$/.test(username)) {
      setStatus("peopleSearchStatus", "Enter at least one letter, number, period, or underscore to search.");
      return;
    }
    try {
      $("publicUserProfile").hidden = true;
      const matches = await getDocs(query(
        collection(db, "publicProfiles"),
        where("active", "==", true),
        orderBy("username"),
        startAt(username),
        endAt(`${username}\uf8ff`),
        limit(12)
      ));
      if (requestVersion !== searchRequestVersion) return;
      const profiles = matches.docs
        .map(snapshot => ({ uid: snapshot.id, ...snapshot.data() }))
        .filter(profile => profile.username && profile.uid !== currentUser.uid);
      if (!profiles.length) {
        setStatus("peopleSearchStatus", "No MAWAESU members match that username yet.");
        return;
      }
      setStatus("peopleSearchStatus", "");
      profiles.forEach(profile => renderSearchResult(results, profile));
    } catch (error) {
      setStatus("peopleSearchStatus", `User suggestions could not be loaded: ${error.message}`, true);
    }
  }

  async function renderRequests(requests) {
    const container = $("connectionRequests");
    container.replaceChildren();
    const incoming = requests.filter(request => request.recipientUid === currentUser.uid && request.status === "pending");
    const outgoing = requests.filter(request => request.senderUid === currentUser.uid && request.status === "pending");
    if (!incoming.length && !outgoing.length) {
      container.appendChild(makeItem("No pending requests"));
      return;
    }
    for (const request of incoming) {
      const profile = await getPublicProfile(request.senderUid);
      if (!profile) continue;
      const item = makeItem(`@${profile.username}`, "Wants to connect with you.");
      item.appendChild(makeButton("Accept", async () => {
        try { await respondToConnectionRequest(request, true); }
        catch (error) { setStatus("peopleSearchStatus", error.message, true); }
      }, "btn btn-primary"));
      item.appendChild(makeButton("Decline", async () => {
        try { await respondToConnectionRequest(request, false); }
        catch (error) { setStatus("peopleSearchStatus", error.message, true); }
      }));
      item.appendChild(makeButton("Block", async () => {
        if (!confirm(`Block @${profile.username}?`)) return;
        try { await blockUser(profile.uid); }
        catch (error) { setStatus("peopleSearchStatus", error.message, true); }
      }, "btn btn-danger"));
      container.appendChild(item);
    }
    for (const request of outgoing) {
      const profile = await getPublicProfile(request.recipientUid);
      if (profile) container.appendChild(makeItem(`@${profile.username}`, "Connection request sent."));
    }
  }

  function listenForRequests() {
    const incoming = query(collection(db, "connectionRequests"), where("recipientUid", "==", currentUser.uid));
    const outgoing = query(collection(db, "connectionRequests"), where("senderUid", "==", currentUser.uid));
    const requestState = { incoming: [], outgoing: [] };
    const update = () => renderRequests([...requestState.incoming, ...requestState.outgoing]);
    listeners.push(onSnapshot(incoming, snapshot => {
      requestState.incoming = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      update();
    }, error => setStatus("peopleSearchStatus", error.message, true)));
    listeners.push(onSnapshot(outgoing, snapshot => {
      requestState.outgoing = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      update();
    }, error => setStatus("peopleSearchStatus", error.message, true)));
  }

  function listenForConnections() {
    const connectionQuery = collection(db, "connections", currentUser.uid, "users");
    listeners.push(onSnapshot(connectionQuery, async snapshot => {
      const container = $("connectionsList");
      container.replaceChildren();
      if (snapshot.empty) {
        container.appendChild(makeItem("No connections yet"));
        return;
      }
      if (!identity) identity = await getOrCreateIdentity(currentUser.uid);
      const profiles = (await Promise.all(snapshot.docs.map(relationship => getPublicProfile(relationship.id))))
        .filter(profile => profile);
      const renderedRows = [];
      const sortRows = () => renderedRows
        .sort((a, b) =>
          (Date.parse(b.querySelector("time")?.dateTime || "") || 0) -
          (Date.parse(a.querySelector("time")?.dateTime || "") || 0)
        )
        .forEach(row => container.appendChild(row));
      for (const profile of profiles) {
        const item = document.createElement("article");
        item.className = "socialItem conversationRow";
        item.dataset.peerUid = profile.uid;
        item.appendChild(makeProfileAvatar(profile));
        const details = document.createElement("div");
        details.className = "conversationDetails";
        const name = document.createElement("strong");
        name.textContent = profile.displayName || `@${profile.username}`;
        const username = document.createElement("span");
        username.className = "muted";
        username.textContent = `@${profile.username}`;
        const preview = document.createElement("p");
        preview.className = "conversationPreview";
        preview.textContent = profile.encryptionPublicKey
          ? "Open an encrypted conversation"
          : "Save a community profile to enable encrypted chat";
        const meta = document.createElement("div");
        meta.className = "conversationMeta";
        const time = document.createElement("time");
        const unread = document.createElement("span");
        unread.className = "unreadIndicator";
        unread.textContent = "Unread";
        unread.hidden = true;
        meta.append(time, unread);
        details.append(name, username, preview, meta);
        item.appendChild(details);
        item.appendChild(makeButton("Open chat", () => openDirectChat(profile), "btn btn-primary"));
        item.appendChild(makeButton("Send today's affirmation", async () => {
          const affirmation = $("dailyAffirmationText").textContent.trim();
          if (!affirmation || affirmation.startsWith("Sign in")) {
            setStatus("peopleSearchStatus", "Open your profile to load today's affirmation first.", true);
            return;
          }
          if (!profile.encryptionPublicKey) {
            setStatus("peopleSearchStatus", `@${profile.username} needs to save their community profile before they can receive encrypted messages.`, true);
            return;
          }
          try {
            const chatId = await getOrCreateDirectChat(profile.uid);
            const encrypted = await encryptMessage(identity, profile.encryptionPublicKey, chatId, `Today's affirmation for you:\n\n${affirmation}`);
            await addDoc(collection(db, "directChats", chatId, "messages"), {
              senderUid: currentUser.uid,
              ciphertext: encrypted.ciphertext,
              nonce: encrypted.nonce,
              algorithm: "ECDH-P256+HKDF-SHA256+AES-256-GCM",
              clientMessageId: crypto.randomUUID(),
              createdAt: serverTimestamp()
            });
            setStatus("peopleSearchStatus", `Today's affirmation was sent to @${profile.username} in an encrypted message.`);
          } catch (error) {
            setStatus("peopleSearchStatus", `Could not send the affirmation: ${error.message}`, true);
          }
        }));
        container.appendChild(item);
        renderedRows.push(item);
      }
      sortRows();
    }, error => setStatus("peopleSearchStatus", error.message, true)));
  }

  async function openDirectChat(profile) {
    try {
      if (!profile.encryptionPublicKey) throw new Error("This member has not enabled encrypted chat yet.");
      const chatId = await getOrCreateDirectChat(profile.uid);
      activeChat = chatId;
      if (!identity) identity = await getOrCreateIdentity(currentUser.uid);
      await setDoc(doc(db, "directChats", chatId, "readStates", currentUser.uid), {
        lastReadAt: serverTimestamp()
      });
      chatPeer = profile.uid;
      chatPeerProfile = profile;
      $("chatPeerLabel").textContent = `Encrypted conversation with @${profile.username}`;
      $("chatScreenTitle").textContent = `@${profile.username}`;
      $("chatMessageInput").disabled = false;
      $("sendChatMessageBtn").disabled = false;
      $("blockChatPeerBtn").disabled = false;
      $("reportChatPeerBtn").disabled = false;
      const fingerprint = await getKeyFingerprint(profile.encryptionPublicKey);
      $("chatKeyFingerprint").textContent = `Verify this connection's encryption key fingerprint out of band: ${fingerprint}`;
      stopListener(directMessageListener);
      directMessageListener = onSnapshot(query(
        collection(db, "directChats", chatId, "messages"),
        orderBy("createdAt", "asc"),
        limit(100)
      ), async snapshot => {
        const container = $("chatMessages");
        container.replaceChildren();
        for (const message of snapshot.docs) {
          const data = message.data();
          const bubble = document.createElement("div");
          bubble.className = `chatBubble${data.senderUid === currentUser.uid ? " mine" : ""}`;
          try {
            bubble.textContent = await decryptMessage(identity, profile.encryptionPublicKey, chatId, data);
          } catch (error) {
            console.error("Could not decrypt a direct message.", error);
            bubble.textContent = "Unable to decrypt this message on this device.";
          }
          container.appendChild(bubble);
        }
        const latest = snapshot.docs[snapshot.docs.length - 1];
        if (latest && activeChat === chatId) {
          const data = latest.data();
          const row = [...$("connectionsList").querySelectorAll(".conversationRow")]
            .find(item => item.dataset.peerUid === profile.uid);
          if (row) {
            const preview = row.querySelector(".conversationPreview");
            const time = row.querySelector("time");
            const unread = row.querySelector(".unreadIndicator");
            const latestBubble = container.lastElementChild;
            preview.textContent = latestBubble?.textContent || "Encrypted message";
            time.textContent = formatTimestamp(data.createdAt);
            if (data.createdAt?.toDate) time.dateTime = data.createdAt.toDate().toISOString();
            unread.hidden = true;
          }
          try {
            await setDoc(doc(db, "directChats", chatId, "readStates", currentUser.uid), {
              lastReadAt: serverTimestamp()
            });
          } catch (error) {
            setStatus("chatPeerLabel", `Messages are open, but the read state could not be saved: ${error.message}`, true);
          }
        }
        container.scrollTop = container.scrollHeight;
      }, error => setStatus("chatPeerLabel", error.message, true));
      $("chatsOverview").hidden = true;
      $("directConversationView").hidden = false;
      $("chatMessageInput").focus();
    } catch (error) {
      setStatus("moderationStatus", `Could not open this conversation: ${error.message}`, true);
    }
  }

  function showChatOverview() {
    $("directConversationView").hidden = true;
    $("chatsOverview").hidden = false;
    $("chatPeerLabel").textContent = "Choose a connection to open an encrypted chat.";
    $("connectionsSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function sendDirectMessage() {
    const input = $("chatMessageInput");
    const plaintext = input.value.trim();
    if (!plaintext || !activeChat || !chatPeerProfile?.encryptionPublicKey) return;
    try {
      const encrypted = await encryptMessage(identity, chatPeerProfile.encryptionPublicKey, activeChat, plaintext);
      await addDoc(collection(db, "directChats", activeChat, "messages"), {
        senderUid: currentUser.uid,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        algorithm: "ECDH-P256+HKDF-SHA256+AES-256-GCM",
        clientMessageId: crypto.randomUUID(),
        createdAt: serverTimestamp()
      });
      input.value = "";
    } catch (error) {
      setStatus("chatPeerLabel", `Message not sent: ${error.message}`, true);
    }
  }

  async function blockActivePeer() {
    if (!chatPeer || !confirm(`Block @${chatPeerProfile?.username || "this person"}? They will no longer be able to contact or match with you.`)) return;
    try {
      await blockUser(chatPeer);
      stopListener(directMessageListener);
      directMessageListener = null;
      activeChat = null;
      chatPeer = null;
      chatPeerProfile = null;
      $("chatMessages").replaceChildren();
      $("chatMessageInput").disabled = true;
      $("sendChatMessageBtn").disabled = true;
      $("blockChatPeerBtn").disabled = true;
      $("reportChatPeerBtn").disabled = true;
      $("chatPeerLabel").textContent = "User blocked. They can no longer connect or message you.";
    } catch (error) {
      setStatus("chatPeerLabel", `Could not block user: ${error.message}`, true);
    }
  }

  function openReport(targetUid) {
    reportTarget = targetUid;
    $("reportReasonInput").value = "";
    $("reportSubmitStatus").textContent = "";
    $("reportDialog").showModal();
  }

  async function submitReport() {
    const description = $("reportReasonInput").value.trim();
    if (description.length < 10) {
      setStatus("reportSubmitStatus", "Please describe what happened (at least 10 characters).", true);
      return;
    }
    try {
      const category = $("reportCategoryInput").value;
      if (!reportTarget || reportTarget === currentUser.uid) throw new Error("Choose a valid member to report.");
      await addDoc(collection(db, "userReports"), {
        reporterUid: currentUser.uid,
        targetUid: reportTarget,
        category,
        description,
        status: "pending",
        createdAt: serverTimestamp()
      });
      $("reportDialog").close();
      setStatus("moderationStatus", "Your report was sent for manual review. Reports do not trigger automatic restrictions on the Spark plan.");
    } catch (error) {
      setStatus("reportSubmitStatus", `Report could not be submitted: ${error.message}`, true);
    }
  }

  function startRandomChat() {
    setStatus("randomEligibility", "Anonymous matching is paused on Firebase Spark because a trusted server is required to protect participant identity and enforce the five-minute room limit.");
  }

  async function refreshAccountStatus(statusId = "moderationStatus") {
    if (!currentUser) return;
    try {
      const status = await readAccountStatus();
      $("appealPanel").hidden = !status.banned;
      $("startRandomChatBtn").disabled = true;
      if (status.banned) {
        setStatus("moderationStatus", "Account status is reviewed manually on the Firebase Spark plan. Contact support to appeal or request a review.");
      } else if (status.deactivated) {
        setStatus("moderationStatus", "Your account is deactivated. Sign out and sign back in to reactivate it.");
      } else {
        setStatus("moderationStatus", "Safety reports are sent for manual review. Firebase Spark cannot safely count reports or apply automatic warnings and bans.");
      }
      setStatus("randomEligibility", "Anonymous matching is paused on Firebase Spark; it requires a trusted server for safe matching, identity privacy, and room expiry.");
    } catch (error) {
      console.error("Could not load account status.", error);
      setStatus(statusId, "Safety status will appear here when available. Protected actions are checked before they complete.");
    }
  }

  async function publishNote() {
    const title = $("newNoteTitle").value.trim();
    const text = $("newNoteText").value.trim();
    const question = $("pollQuestionInput").value.trim();
    const options = [...document.querySelectorAll(".pollOptionInput")].map(input => input.value.trim()).filter(Boolean);
    if (!title && !text && !question) {
      setStatus("noteComposerStatus", "Add text or a poll before publishing.", true);
      return;
    }

    if (question && options.length < 2) {
      setStatus("noteComposerStatus", "A poll needs at least two non-empty options.", true);
      return;
    }
    try {
      setStatus("noteComposerStatus", "Publishing…");
      const noteRef = doc(collection(db, "publicNotes"));
      const pollMetadata = question ? { question, options } : null;
      await setDoc(noteRef, {
        authorUid: currentUser.uid,
        ...(title ? { title } : {}),
        text,
        ...(pollMetadata ? { pollMetadata } : {}),
        createdAt: serverTimestamp()
      });
      if (question) {
        await setDoc(doc(db, "publicNotes", noteRef.id, "polls", "main"), {
          authorUid: currentUser.uid,
          question,
          options,
          createdAt: serverTimestamp()
        });
      }
      $("newNoteTitle").value = "";
      $("newNoteText").value = "";
      $("pollQuestionInput").value = "";
      document.querySelectorAll(".pollOptionInput").forEach(input => { input.value = ""; });
      setStatus("noteComposerStatus", "Your note is public.");
    } catch (error) {
      const detail = error.code === "permission-denied"
        ? "Firestore denied this note. Confirm that your account is active and that the latest Firestore rules have deployed."
        : error.message;
      setStatus("noteComposerStatus", `Could not publish note: ${detail}`, true);
    }
  }

  async function connectToSelectedProfile() {
    if (!selectedPublicProfile || selectedPublicProfile.uid === currentUser.uid) return;
    try {
      await sendConnectionRequest(selectedPublicProfile.uid);
      $("connectPublicProfileBtn").disabled = true;
      $("connectPublicProfileBtn").textContent = "Request sent";
      setStatus("peopleSearchStatus", `Connection request sent to @${selectedPublicProfile.username}.`);
    } catch (error) {
      setStatus("peopleSearchStatus", error.message, true);
    }
  }

  async function blockSelectedProfile() {
    if (!selectedPublicProfile || selectedPublicProfile.uid === currentUser.uid) return;
    if (!confirm(`Block @${selectedPublicProfile.username}? They will not be able to connect or match with you.`)) return;
    try {
      await blockUser(selectedPublicProfile.uid);
      $("publicUserProfile").hidden = true;
      setStatus("peopleSearchStatus", `@${selectedPublicProfile.username} is blocked.`);
    } catch (error) {
      setStatus("peopleSearchStatus", error.message, true);
    }
  }

  async function addNoteComments(noteId, container, listenerId = noteId) {
    const details = document.createElement("details");
    details.className = "noteComments";
    const summary = document.createElement("summary");
    summary.textContent = "Comments";
    const comments = document.createElement("div");
    comments.className = "socialList";
    details.append(summary, comments);
    container.appendChild(details);
    const commentsQuery = query(collection(db, "publicNotes", noteId, "comments"), orderBy("createdAt", "asc"), limit(30));
    const stop = onSnapshot(commentsQuery, async snapshot => {
      comments.replaceChildren();
      summary.textContent = `Comments (${snapshot.size})`;
      for (const comment of snapshot.docs) {
        const data = comment.data();
        const profile = await getPublicProfile(data.authorUid);
        const item = document.createElement("article");
        item.className = "noteComment";
        if (profile) item.appendChild(makeProfileAvatar(profile));
        const content = document.createElement("div");
        const heading = document.createElement("div");
        heading.className = "noteCommentHeading";
        const author = document.createElement("strong");
        author.textContent = profile?.username ? `@${profile.username}` : "Member";
        const timestamp = document.createElement("time");
        timestamp.textContent = formatTimestamp(data.createdAt);
        if (timestamp.textContent && data.createdAt?.toDate) timestamp.dateTime = data.createdAt.toDate().toISOString();
        heading.append(author, timestamp);
        const text = document.createElement("p");
        text.textContent = data.text || "";
        content.append(heading, text);
        item.append(content);
        comments.appendChild(item);
      }
    }, error => setStatus("noteComposerStatus", `Comments could not be loaded: ${error.message}`, true));
    noteListeners.set(`${listenerId}:comments`, stop);
    const row = document.createElement("div");
    row.className = "socialRow";
    const input = document.createElement("input");
    input.maxLength = 2000;
    input.placeholder = "Write a comment…";
    input.setAttribute("aria-label", "Write a comment");
    row.appendChild(input);
    row.appendChild(makeButton("Comment", async () => {
      const text = input.value.trim();
      if (!text) return;
      try {
        await addDoc(collection(db, "publicNotes", noteId, "comments"), {
          authorUid: currentUser.uid,
          text,
          createdAt: serverTimestamp()
        });
        input.value = "";
      } catch (error) {
        setStatus("noteComposerStatus", `Comment could not be posted: ${error.message}`, true);
      }
    }, "btn btn-primary"));
    details.appendChild(row);
  }

  async function addPoll(noteId, note, container, listenerId = noteId) {
    const poll = note.pollMetadata;
    if (!poll?.question || !Array.isArray(poll.options) || poll.options.length < 2) return;
    const pollContainer = makeItem("Poll", poll.question);
    const options = document.createElement("div");
    options.className = "pollOptions";
    pollContainer.appendChild(options);
    const pollRef = doc(db, "publicNotes", noteId, "polls", "main");
    const voteCollection = collection(db, "publicNotes", noteId, "polls", "main", "votes");
    const [pollSnapshot, votesSnapshot, myVoteSnapshot] = await Promise.all([
      getDoc(pollRef),
      getDocs(voteCollection),
      getDoc(doc(voteCollection, currentUser.uid))
    ]);
    if (!pollSnapshot.exists()) {
      try {
        await setDoc(pollRef, {
          authorUid: note.authorUid,
          question: poll.question,
          options: poll.options,
          createdAt: note.createdAt || serverTimestamp()
        });
      } catch (error) {
        console.error("Could not initialize public note poll.", error);
      }
    }
    const voteCounts = new Array(poll.options.length).fill(0);
    votesSnapshot.docs.forEach(vote => {
      const optionIndex = vote.data().optionIndex;
      if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < voteCounts.length) voteCounts[optionIndex]++;
    });
    const voteButtons = [];
    poll.options.forEach((option, index) => {
      const button = makeButton(`${option} · ${voteCounts[index]} vote${voteCounts[index] === 1 ? "" : "s"}`, async () => {
        try {
          await setDoc(doc(voteCollection, currentUser.uid), {
            authorUid: currentUser.uid,
            optionIndex: index,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          setStatus("noteComposerStatus", `Vote could not be recorded: ${error.message}`, true);
        }
      }, myVoteSnapshot.exists() && myVoteSnapshot.data().optionIndex === index ? "btn btn-primary" : "btn btn-secondary");
      button.disabled = myVoteSnapshot.exists();
      options.appendChild(button);
      voteButtons.push(button);
    });
    noteListeners.set(`${listenerId}:votes`, onSnapshot(voteCollection, snapshot => {
      const counts = new Array(poll.options.length).fill(0);
      let selected = null;
      snapshot.docs.forEach(vote => {
        const optionIndex = vote.data().optionIndex;
        if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < counts.length) counts[optionIndex]++;
        if (vote.id === currentUser.uid) selected = optionIndex;
      });
      voteButtons.forEach((button, index) => {
        button.textContent = `${poll.options[index]} · ${counts[index]} vote${counts[index] === 1 ? "" : "s"}`;
        button.disabled = selected !== null;
        button.className = selected === index ? "btn btn-primary" : "btn btn-secondary";
      });
    }, error => setStatus("noteComposerStatus", error.message, true)));
    container.appendChild(pollContainer);
  }

  async function renderNote(noteDocument, container, { featuredByUid = null, originalAuthorUsername = "" } = {}) {
    const note = noteDocument.data();
    const profile = await getPublicProfile(note.authorUid);
    const listenerId = featuredByUid ? `${noteDocument.id}:featured:${featuredByUid}` : noteDocument.id;
    const card = document.createElement("article");
    card.className = "socialItem noteCard";
    const originalAuthorName = profile?.username || note.authorName || "Member";
    const featuringProfile = featuredByUid ? await getPublicProfile(featuredByUid) : null;
    const displayedAuthorName = featuredByUid
      ? featuringProfile?.username || "member"
      : originalAuthorName;
    const header = document.createElement("header");
    header.className = "noteByline";
    const authorProfile = featuredByUid ? featuringProfile : profile;
    if (authorProfile) header.appendChild(makeProfileAvatar(authorProfile));
    const authorDetails = document.createElement("div");
    const displayName = document.createElement("strong");
    displayName.textContent = featuredByUid
      ? featuringProfile?.displayName || displayedAuthorName
      : profile?.displayName || displayedAuthorName;
    authorDetails.appendChild(displayName);
    const usernameButton = makeButton(`@${displayedAuthorName}`, () => {
      const displayedProfile = featuringProfile || profile;
      if (displayedProfile) navigateToPublicProfile(displayedProfile);
    }, "profileLink");
    authorDetails.appendChild(usernameButton);
    header.appendChild(authorDetails);
    const postedAt = document.createElement("time");
    postedAt.className = "muted noteTimestamp";
    postedAt.textContent = formatTimestamp(note.createdAt);
    if (postedAt.textContent && note.createdAt?.toDate) postedAt.dateTime = note.createdAt.toDate().toISOString();
    header.appendChild(postedAt);
    card.appendChild(header);
    if (note.title) {
      const title = document.createElement("h3");
      title.className = "noteTitle";
      title.textContent = note.title;
      card.appendChild(title);
    }
    if (note.text) {
      const body = document.createElement("p");
      body.className = "noteBody";
      body.textContent = note.text;
      card.appendChild(body);
    }
    if (featuredByUid) {
      const attribution = document.createElement("p");
      attribution.className = "muted originalAuthor";
      attribution.textContent = `Originally written by @${originalAuthorUsername || originalAuthorName}`;
      card.appendChild(attribution);
    }
    const actions = document.createElement("div");
    actions.className = "socialRow";
    const reactionRef = doc(db, "publicNotes", noteDocument.id, "reactions", currentUser.uid);
    const [reactions, ownReaction] = await Promise.all([
      getDocs(collection(db, "publicNotes", noteDocument.id, "reactions")),
      getDoc(reactionRef)
    ]);
    let reactionCount = reactions.size;
    let liked = ownReaction.exists();
    const likeButton = makeButton(`${ownReaction.exists() ? "♥ Liked" : "♡ Like"} · ${reactionCount}`, async () => {
      try {
        if (liked) {
          await deleteDoc(reactionRef);
          liked = false;
        } else {
          await setDoc(reactionRef, { authorUid: currentUser.uid, reaction: "like", createdAt: serverTimestamp() });
          liked = true;
        }
        likeButton.textContent = `${liked ? "♥ Liked" : "♡ Like"} · ${reactionCount}`;
        likeButton.className = liked ? "btn btn-primary" : "btn btn-secondary";
      } catch (error) {
        setStatus("noteComposerStatus", `Like could not be saved: ${error.message}`, true);
      }
    }, ownReaction.exists() ? "btn btn-primary" : "btn btn-secondary");
    actions.appendChild(likeButton);
    const savedRef = doc(db, "users", currentUser.uid, "savedNotes", noteDocument.id);
    const [savedSnapshot, featuredSnapshot] = await Promise.all([
      getDoc(savedRef),
      featuredByUid || note.authorUid === currentUser.uid
        ? Promise.resolve(null)
        : getDoc(doc(db, "featuredNotes", `${currentUser.uid}_${noteDocument.id}`))
    ]);
    let saved = savedSnapshot.exists();
    const saveButton = makeButton(saved ? "Saved" : "Save privately", async () => {
      try {
        if (saved) await deleteDoc(savedRef);
        else await setDoc(savedRef, {
          noteId: noteDocument.id,
          authorUid: note.authorUid,
          savedAt: serverTimestamp()
        });
        saved = !saved;
        saveButton.textContent = saved ? "Saved" : "Save privately";
        saveButton.className = saved ? "btn btn-primary" : "btn btn-secondary";
      } catch (error) {
        setStatus("noteComposerStatus", `Note could not be saved: ${error.message}`, true);
      }
    }, saved ? "btn btn-primary" : "btn btn-secondary");
    actions.appendChild(saveButton);
    if (featuredByUid === currentUser.uid) {
      const featureRef = doc(db, "featuredNotes", `${currentUser.uid}_${noteDocument.id}`);
      actions.appendChild(makeButton("Remove from Featured", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await deleteDoc(featureRef);
          const listenerPrefix = `${noteDocument.id}:featured:${currentUser.uid}`;
          for (const [key, stop] of noteListeners) {
            if (key.startsWith(listenerPrefix)) {
              stopListener(stop);
              noteListeners.delete(key);
            }
          }
          card.remove();
        } catch (error) {
          button.disabled = false;
          setStatus("profileSaveStatus", `Could not remove the featured note: ${error.message}`, true);
        }
      }, "btn btn-secondary"));
    } else if (!featuredByUid && note.authorUid !== currentUser.uid) {
      let featured = Boolean(featuredSnapshot?.exists());
      const featureButton = makeButton(featured ? "Featured" : "Feature on my profile", async () => {
        const featureRef = doc(db, "featuredNotes", `${currentUser.uid}_${noteDocument.id}`);
        try {
          if (featured) await deleteDoc(featureRef);
          else await setDoc(featureRef, {
            featuredByUserId: currentUser.uid,
            originalNoteId: noteDocument.id,
            originalAuthorId: note.authorUid,
            originalAuthorUsername: originalAuthorName,
            createdAt: serverTimestamp()
          });
          featured = !featured;
          featureButton.textContent = featured ? "Featured" : "Feature on my profile";
          featureButton.className = featured ? "btn btn-primary" : "btn btn-secondary";
        } catch (error) {
          setStatus("noteComposerStatus", `Note could not be featured: ${error.message}`, true);
        }
      }, featured ? "btn btn-primary" : "btn btn-secondary");
      actions.appendChild(featureButton);
    }
    card.appendChild(actions);
    container.appendChild(card);
    noteListeners.set(`${listenerId}:reactions`, onSnapshot(
      collection(db, "publicNotes", noteDocument.id, "reactions"),
      snapshot => {
        reactionCount = snapshot.size;
        liked = snapshot.docs.some(reaction => reaction.id === currentUser.uid);
        likeButton.textContent = `${liked ? "♥ Liked" : "♡ Like"} · ${reactionCount}`;
        likeButton.className = liked ? "btn btn-primary" : "btn btn-secondary";
      },
      error => setStatus("noteComposerStatus", error.message, true)
    ));
    await addPoll(noteDocument.id, note, card, listenerId);
    await addNoteComments(noteDocument.id, card, listenerId);
  }

  function listenForNotes() {
    stopListener(noteFeedListener);
    stopListener(featuredFeedListener);
    const feed = $("publicNotesFeed");
    const loadMoreButton = $("loadMoreNotesBtn");
    feed.replaceChildren();
    let notesSnapshot = [];
    let featuredSnapshot = [];
    let olderNotes = [];
    let olderFeatured = [];
    let noteCursor = null;
    let featuredCursor = null;
    let notesMayHaveMore = false;
    let featuredMayHaveMore = false;
    let rendering = false;
    let rerender = false;
    const renderFeed = async () => {
      if (rendering) {
        rerender = true;
        return;
      }
      rendering = true;
      try {
        noteListeners.forEach(stopListener);
        noteListeners.clear();
        const combined = [
          ...notesSnapshot.map(note => ({ note, featuredByUid: null, createdAt: note.data().createdAt?.toMillis?.() || 0 })),
          ...olderNotes.map(note => ({ note, featuredByUid: null, createdAt: note.data().createdAt?.toMillis?.() || 0 })),
          ...featuredSnapshot.map(feature => ({ noteId: feature.data().originalNoteId || feature.data().noteId, featuredByUid: feature.data().featuredByUserId || feature.data().featuredByUid, createdAt: feature.data().createdAt?.toMillis?.() || 0 })),
          ...olderFeatured.map(feature => ({ noteId: feature.data().originalNoteId || feature.data().noteId, featuredByUid: feature.data().featuredByUserId || feature.data().featuredByUid, createdAt: feature.data().createdAt?.toMillis?.() || 0 }))
        ].sort((a, b) => b.createdAt - a.createdAt);
        feed.replaceChildren();
        for (const entry of combined) {
          const noteId = entry.noteId || entry.originalNoteId;
          const note = entry.note || await getDoc(doc(db, "publicNotes", noteId));
          if (note.exists()) await renderNote(note, feed, { featuredByUid: entry.featuredByUid });
        }
        if (!combined.length) feed.appendChild(makeItem("No notes yet", "Be the first to share a thought."));
        loadMoreButton.hidden = !notesMayHaveMore && !featuredMayHaveMore;
      } catch (error) {
        setStatus("noteComposerStatus", `The notes feed could not be loaded: ${error.message}`, true);
      } finally {
        rendering = false;
        if (rerender) {
          rerender = false;
          void renderFeed();
        }
      }
    };
    noteFeedListener = onSnapshot(query(collection(db, "publicNotes"), orderBy("createdAt", "desc"), limit(50)), snapshot => {
      notesSnapshot = snapshot.docs;
      noteCursor = snapshot.docs[snapshot.docs.length - 1] || null;
      notesMayHaveMore = snapshot.size === 50;
      void renderFeed();
    }, error => setStatus("noteComposerStatus", error.message, true));
    featuredFeedListener = onSnapshot(query(collection(db, "featuredNotes"), orderBy("createdAt", "desc"), limit(50)), snapshot => {
      featuredSnapshot = snapshot.docs;
      featuredCursor = snapshot.docs[snapshot.docs.length - 1] || null;
      featuredMayHaveMore = snapshot.size === 50;
      void renderFeed();
    }, error => setStatus("noteComposerStatus", error.message, true));
    loadMoreButton.hidden = true;
    loadMoreButton.onclick = async () => {
      loadMoreButton.disabled = true;
      try {
        const [notes, featured] = await Promise.all([
          notesMayHaveMore && noteCursor
            ? getDocs(query(collection(db, "publicNotes"), orderBy("createdAt", "desc"), startAfter(noteCursor), limit(50)))
            : Promise.resolve(null),
          featuredMayHaveMore && featuredCursor
            ? getDocs(query(collection(db, "featuredNotes"), orderBy("createdAt", "desc"), startAfter(featuredCursor), limit(50)))
            : Promise.resolve(null)
        ]);
        if (notes) {
          olderNotes.push(...notes.docs);
          noteCursor = notes.docs[notes.docs.length - 1] || noteCursor;
          notesMayHaveMore = notes.size === 50;
        }
        if (featured) {
          olderFeatured.push(...featured.docs);
          featuredCursor = featured.docs[featured.docs.length - 1] || featuredCursor;
          featuredMayHaveMore = featured.size === 50;
        }
        await renderFeed();
      } catch (error) {
        setStatus("noteComposerStatus", `Could not load older notes: ${error.message}`, true);
      } finally {
        loadMoreButton.disabled = false;
      }
    };
  }

  async function loadProfileNotes() {
    const myNotes = $("myNotesFeed");
    const myFeatured = $("myFeaturedNotesFeed");
    const savedNotes = $("savedNotesFeed");
    if (!myNotes || !myFeatured || !savedNotes) return;
    myNotes.replaceChildren();
    myFeatured.replaceChildren();
    savedNotes.replaceChildren();
    try {
      const [authored, featured, saved] = await Promise.all([
        getDocs(query(collection(db, "publicNotes"), where("authorUid", "==", currentUser.uid))),
        getDocs(query(collection(db, "featuredNotes"), where("featuredByUserId", "==", currentUser.uid))),
        getDocs(collection(db, "users", currentUser.uid, "savedNotes"))
      ]);
      const newestFirst = (items) => items.sort((a, b) =>
        (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
      );
      if (authored.empty) myNotes.appendChild(makeItem("You have not posted any notes yet."));
      for (const note of newestFirst(authored.docs)) await renderNote(note, myNotes);
      if (featured.empty) myFeatured.appendChild(makeItem("You have not featured any notes yet."));
      const newestFeatures = newestFirst(featured.docs);
      for (const feature of newestFeatures) {
        const data = feature.data();
        const noteId = data.originalNoteId || data.noteId;
        if (typeof noteId !== "string") continue;
        const note = await getDoc(doc(db, "publicNotes", noteId));
        if (note.exists()) {
          await renderNote(note, myFeatured, {
            featuredByUid: currentUser.uid,
            originalAuthorUsername: data.originalAuthorUsername || ""
          });
        }
      }
      if (saved.empty) savedNotes.appendChild(makeItem("Your privately saved notes will appear here."));
      for (const savedNote of saved.docs) {
        const note = await getDoc(doc(db, "publicNotes", savedNote.data().noteId || savedNote.id));
        if (note.exists()) await renderNote(note, savedNotes);
      }
    } catch (error) {
      const message = makeItem("Profile notes could not be loaded.", error.message);
      myNotes.appendChild(message);
    }
  }

  async function sendAppeal() {
    const explanation = $("appealMessage").value.trim();
    if (explanation.length < 10) {
      setStatus("appealStatus", "Please include at least 10 characters explaining your request.", true);
      return;
    }
    try {
      await addDoc(collection(db, "moderationAppeals"), {
        userId: currentUser.uid,
        explanation,
        createdAt: serverTimestamp()
      });
      $("appealMessage").value = "";
      setStatus("appealStatus", "Your appeal was submitted for manual review. Reinstatement is not guaranteed.");
    } catch (error) {
      setStatus("appealStatus", `Appeal could not be submitted: ${error.message}`, true);
    }
  }

  function emailAppeal(explanation = $("appealMessage").value.trim()) {
    const accountEmail = currentUser?.email || "";
    const subject = encodeURIComponent("MAWAESU account restriction appeal");
    const body = encodeURIComponent(
      `Account email: ${accountEmail}\n\nMy appeal or safety concern:\n${explanation || "[Please explain your request.]"}\n\nMAWAESU reviews requests manually.`
    );
    window.location.href = `mailto:mawaesu.toknowyou@gmail.com?subject=${subject}&body=${body}`;
    setStatus("appealStatus", "Your email app was opened so you can send your request to support.");
  }

  async function openCommunity(pageId) {
    if (!currentUser) return;
    listeners.forEach(stopListener);
    listeners = [];
    if (pageId !== "mainMenuPage") {
      stopListener(noteFeedListener);
      stopListener(featuredFeedListener);
      noteFeedListener = null;
      featuredFeedListener = null;
      noteListeners.forEach(stopListener);
      noteListeners.clear();
    }
    const statusId = pageId === "mainMenuPage" ? "mainMenuStatus"
      : pageId === "searchPage" ? "peopleSearchStatus"
        : pageId === "profilePage" ? "profileSaveStatus" : "moderationStatus";
    await refreshAccountStatus(statusId);
    if (pageId === "searchPage") listenForRequests();
    if (pageId === "chatsPage") {
      $("directConversationView").hidden = true;
      $("chatsOverview").hidden = false;
      listenForConnections();
    }
    if (pageId === "mainMenuPage") listenForNotes();
    if (pageId === "profilePage") await loadProfileNotes();
    if (!identity) identity = await getOrCreateIdentity(currentUser.uid);
    const fingerprint = await getKeyFingerprint(identity.publicKey);
    $("chatKeyFingerprint").textContent = `Your encryption key fingerprint: ${fingerprint}. Verify fingerprints with connections through another trusted channel.`;
  }

  $("peopleSearchBtn").addEventListener("click", searchPeople);
  $("peopleSearchInput").addEventListener("keydown", event => { if (event.key === "Enter") searchPeople(); });
  $("peopleSearchInput").addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { void searchPeople(); }, 250);
  });
  $("connectPublicProfileBtn").addEventListener("click", connectToSelectedProfile);
  $("blockPublicProfileBtn").addEventListener("click", blockSelectedProfile);
  $("closePublicProfileBtn").addEventListener("click", () => { $("publicUserProfile").hidden = true; $("peopleSearchInput").focus(); });
  document.querySelectorAll("[data-profile-tab]").forEach(button => button.addEventListener("click", () => {
    const tab = button.dataset.profileTab;
    document.querySelectorAll("[data-profile-tab]").forEach(tabButton => {
      const selected = tabButton === button;
      tabButton.classList.toggle("active", selected);
      tabButton.setAttribute("aria-selected", String(selected));
      $(tabButton.getAttribute("aria-controls")).hidden = !selected;
    });
  }));
  document.querySelectorAll("[data-public-profile-tab]").forEach(button => button.addEventListener("click", () => {
    selectPublicProfileTab(button.dataset.publicProfileTab);
  }));
  $("sendChatMessageBtn").addEventListener("click", sendDirectMessage);
  $("backToChatsBtn").addEventListener("click", showChatOverview);
  $("chatMessageInput").addEventListener("keydown", event => { if (event.key === "Enter") sendDirectMessage(); });
  $("blockChatPeerBtn").addEventListener("click", blockActivePeer);
  $("reportChatPeerBtn").addEventListener("click", () => openReport(chatPeer));
  $("cancelReportBtn").addEventListener("click", () => $("reportDialog").close());
  $("submitReportBtn").addEventListener("click", submitReport);
  $("startRandomChatBtn").addEventListener("click", startRandomChat);
  $("randomMessageInput").disabled = true;
  $("sendRandomMessageBtn").disabled = true;
  $("leaveRandomChatBtn").disabled = true;
  $("reportRandomPeerBtn").disabled = true;
  $("shareRandomUsernameBtn").disabled = true;
  $("keepRandomAnonymousBtn").disabled = true;
  $("randomEligibility").textContent = "Anonymous matching is paused on Firebase Spark; it requires a trusted server for safe matching, identity privacy, and room expiry.";
  $("publishNoteBtn").addEventListener("click", publishNote);
  $("sendAppealBtn").addEventListener("click", sendAppeal);
  $("emailAppealBtn").addEventListener("click", emailAppeal);
  document.addEventListener("mawaesu-community-open", event => openCommunity(event.detail).catch(error => {
    const statusId = event.detail === "mainMenuPage" ? "mainMenuStatus"
      : event.detail === "searchPage" ? "peopleSearchStatus"
        : event.detail === "profilePage" ? "profileSaveStatus" : "moderationStatus";
    setStatus(statusId, `Could not load this section: ${error.message}`, true);
  }));
  document.addEventListener("mawaesu-page-change", event => {
    if (["mainMenuPage", "searchPage", "chatsPage", "profilePage"].includes(event.detail)) {
      document.dispatchEvent(new CustomEvent("mawaesu-community-open", { detail: event.detail }));
    }
  });
  document.addEventListener("mawaesu-open-public-profile", event => {
    window.showPage("searchPage");
    void openPublicProfile(event.detail);
  });
  onAuthStateChanged(auth, async user => {
      clearListeners();
      currentUser = user;
      identity = null;
      myProfile = null;
      activeChat = null;
      chatPeer = null;
      chatPeerProfile = null;
      $("chatMessageInput").disabled = true;
      $("sendChatMessageBtn").disabled = true;
      $("randomMessageInput").disabled = true;
      $("sendRandomMessageBtn").disabled = true;
      $("startRandomChatBtn").disabled = true;
      $("randomChatPanel").hidden = true;
      $("appealPanel").hidden = true;
      if (!user) return;
      try {
        identity = await getOrCreateIdentity(user.uid);
        await loadOwnProfile();
      } catch (error) {
        console.error("Could not load social profile.", error);
      }
  });

  return {
    publishProfile,
    getAccountStatus: readAccountStatus,
    reactivateAccount: async () => updateDoc(doc(db, "accountStatuses", currentUser.uid), {
      deactivated: false,
      updatedAt: serverTimestamp()
    }),
    deactivateAccount: async () => {
      const profileRef = doc(db, "publicProfiles", currentUser.uid);
      const profile = await getDoc(profileRef);
      if (profile.exists()) {
        await updateDoc(profileRef, {
          active: false,
          updatedAt: serverTimestamp()
        });
      }
      await setDoc(doc(db, "accountStatuses", currentUser.uid), {
        deactivated: true,
        updatedAt: serverTimestamp()
      });
    },
    requestAccountDeletion: () => {
      const subject = encodeURIComponent("MAWAESU account deletion request");
      const body = encodeURIComponent(`Account email: ${currentUser?.email || ""}\n\nPlease review my request to permanently delete my MAWAESU account and associated data.`);
      window.location.href = `mailto:mawaesu.toknowyou@gmail.com?subject=${subject}&body=${body}`;
    },
    getIdentity: async () => identity || (identity = await getOrCreateIdentity(currentUser.uid))
  };
}
