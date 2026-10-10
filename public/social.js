import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, endAt, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, startAt,
  serverTimestamp, setDoc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { decryptMessage, encryptMessage, getKeyFingerprint, getOrCreateIdentity, deleteIdentity } from "./social-crypto.js";
import { getAvatarOption } from "./avatars.js";

const $ = id => document.getElementById(id);
const callableNames = [
  "updatePublicProfile", "sendConnectionRequest", "respondToConnectionRequest",
  "blockUser", "createDirectChat", "sendDirectMessage", "findRandomChat", "sendRandomChatMessage",
  "leaveRandomChat", "shareRandomUsername", "getRandomChatStatus", "submitUserReport",
  "submitRandomChatReport", "submitModerationAppeal",
  "deactivateAccount", "reactivateAccount", "deleteAccount"
];

function setStatus(id, message, isError = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
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

async function directChatId(peerUid) {
  const participantUids = [currentUser.uid, peerUid].sort();
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

export function initializeSocialFeatures({ app, auth, db }) {
  const functions = getFunctions(app, "us-central1");
  const callables = Object.fromEntries(callableNames.map(name => [name, async data => {
    try {
      return await httpsCallable(functions, name)(data);
    } catch (error) {
      if (["functions/internal", "functions/not-found", "functions/unavailable"].includes(error.code)) {
        throw new Error(
          "The MAWAESU social service is unavailable. Its Firebase backend may not be deployed or enabled yet.",
          { cause: error }
        );
      }
      throw error;
    }
  }]));
  let currentUser = null;
  let identity = null;
  let myProfile = null;
  let activeChat = null;
  let chatPeer = null;
  let chatPeerProfile = null;
  let selectedPublicProfile = null;
  let randomRoomId = null;
  let randomPeerKey = null;
  let randomAlias = "";
  let randomTimer = null;
  let randomActive = false;
  let randomMessagesSubscribed = false;
  let reportTarget = null;
  let reportRandomRoomId = null;
  let searchDebounce = null;
  let searchRequestVersion = 0;
  let listeners = [];
  let randomMessageListener = null;
  let directMessageListener = null;
  let noteFeedListener = null;
  let featuredFeedListener = null;
  let randomRoomListener = null;
  const noteListeners = new Map();
  const profileCache = new Map();
  const chatPreviewListeners = new Map();

  async function readAccountStatus() {
    if (!currentUser) throw new Error("Sign in to check account status.");
    const [moderationSnapshot, accountSnapshot] = await Promise.all([
      getDoc(doc(db, "moderationCounters", currentUser.uid)),
      getDoc(doc(db, "accountStatuses", currentUser.uid))
    ]);
    const moderation = moderationSnapshot.exists() ? moderationSnapshot.data() : {};
    const account = accountSnapshot.exists() ? accountSnapshot.data() : {};
    const suspensionTimestamp = moderation.randomChatSuspendedUntil;
    const suspensionDate = suspensionTimestamp?.toDate?.() || null;
    return {
      banned: moderation.banned === true,
      deactivated: account.deactivated === true,
      randomChatSuspended: Boolean(suspensionDate && suspensionDate.getTime() > Date.now()),
      randomChatSuspendedUntil: suspensionDate?.toISOString() || null
    };
  }

  function stopListener(listener) {
    if (listener) listener();
  }

  function clearChatPreviewListeners() {
    for (const stop of chatPreviewListeners.values()) {
      stopListener(stop);
      const listenerIndex = listeners.indexOf(stop);
      if (listenerIndex >= 0) listeners.splice(listenerIndex, 1);
    }
    chatPreviewListeners.clear();
  }

  function clearListeners() {
    listeners.forEach(stopListener);
    listeners = [];
    noteListeners.forEach(stopListener);
    noteListeners.clear();
    clearChatPreviewListeners();
    stopListener(randomMessageListener);
    stopListener(directMessageListener);
    stopListener(noteFeedListener);
    stopListener(featuredFeedListener);
    stopListener(randomRoomListener);
    randomMessageListener = null;
    directMessageListener = null;
    noteFeedListener = null;
    featuredFeedListener = null;
    randomRoomListener = null;
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
    const result = await callables.updatePublicProfile({
      username,
      displayName: (userData.name || username).slice(0, 60),
      bio: (myProfile?.bio || "").slice(0, 280),
      avatarId,
      encryptionPublicKey: identity.publicKey
    });
    myProfile.username = result.data.username;
    profileCache.delete(currentUser.uid);
    return result.data;
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
      const account = await readAccountStatus();
      if ((account.banned || account.deactivated) && myProfile.username) {
        return;
      }
      throw error;
    }
    if (profileSnapshot.exists()) {
      const publicProfile = profileSnapshot.data();
      myProfile.username = myProfile.username || publicProfile.username || "";
      myProfile.bio = myProfile.bio ?? publicProfile.bio ?? "";
      myProfile.avatarId = publicProfile.avatarId || myProfile.avatarId || "leaf";
    }
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
        try { await callables.respondToConnectionRequest({ requestId: request.id, accept: true }); }
        catch (error) { setStatus("peopleSearchStatus", error.message, true); }
      }, "btn btn-primary"));
      item.appendChild(makeButton("Decline", async () => {
        try { await callables.respondToConnectionRequest({ requestId: request.id, accept: false }); }
        catch (error) { setStatus("peopleSearchStatus", error.message, true); }
      }));
      item.appendChild(makeButton("Block", async () => {
        if (!confirm(`Block @${profile.username}?`)) return;
        try { await callables.blockUser({ targetUid: profile.uid }); }
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
      clearChatPreviewListeners();
      const container = $("connectionsList");
      container.replaceChildren();
      if (snapshot.empty) {
        container.appendChild(makeItem("No connections yet"));
        return;
      }
      if (!identity) identity = await getOrCreateIdentity(currentUser.uid);
      const profiles = (await Promise.all(snapshot.docs.map(relationship => getPublicProfile(relationship.id))))
        .filter(profile => profile);
      const chatByPeer = new Map(await Promise.all(profiles.map(async profile => {
        const chatId = await directChatId(profile.uid);
        const chat = await getDoc(doc(db, "directChats", chatId));
        return [profile.uid, chat.exists() ? chat : null];
      })));
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
            const chat = await callables.createDirectChat({ otherUid: profile.uid });
            const encrypted = await encryptMessage(identity, profile.encryptionPublicKey, chat.data.chatId, `Today's affirmation for you:\n\n${affirmation}`);
            await callables.sendDirectMessage({
              chatId: chat.data.chatId,
              ciphertext: encrypted.ciphertext,
              nonce: encrypted.nonce,
              algorithm: "ECDH-P256+HKDF-SHA256+AES-256-GCM",
              clientMessageId: crypto.randomUUID()
            });
            setStatus("peopleSearchStatus", `Today's affirmation was sent to @${profile.username} in an encrypted message.`);
          } catch (error) {
            setStatus("peopleSearchStatus", `Could not send the affirmation: ${error.message}`, true);
          }
        }));
        container.appendChild(item);
        renderedRows.push(item);

        const chat = chatByPeer.get(profile.uid);
        if (chat && profile.encryptionPublicKey) {
          const previewListener = onSnapshot(query(
            collection(db, "directChats", chat.id, "messages"),
            orderBy("createdAt", "desc"),
            limit(1)
          ), snapshot => {
            const latest = snapshot.docs[0];
            if (!latest) return;
            void (async () => {
              const message = latest.data();
              const readState = await getDoc(doc(db, "directChats", chat.id, "readStates", currentUser.uid));
              if (!container.contains(item)) return;
              try {
                preview.textContent = await decryptMessage(identity, profile.encryptionPublicKey, chat.id, message);
              } catch (error) {
                console.error("Could not decrypt a conversation preview.", error);
                preview.textContent = "Encrypted message";
              }
              time.textContent = formatTimestamp(message.createdAt);
              if (message.createdAt?.toDate) time.dateTime = message.createdAt.toDate().toISOString();
              const readAt = readState.data()?.lastReadAt?.toMillis?.() || 0;
              unread.hidden = message.senderUid === currentUser.uid ||
                (message.createdAt?.toMillis?.() || 0) <= readAt;
              sortRows();
            })().catch(error => setStatus("moderationStatus", `Could not load the conversation preview: ${error.message}`, true));
          }, error => setStatus("moderationStatus", `Could not load the conversation preview: ${error.message}`, true));
          chatPreviewListeners.set(profile.uid, previewListener);
          listeners.push(previewListener);
        }
      }
      sortRows();
    }, error => setStatus("peopleSearchStatus", error.message, true)));
  }

  async function openDirectChat(profile) {
    try {
      const result = await callables.createDirectChat({ otherUid: profile.uid });
      const chatId = result.data.chatId;
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
      await callables.sendDirectMessage({
        chatId: activeChat,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        algorithm: "ECDH-P256+HKDF-SHA256+AES-256-GCM",
        clientMessageId: crypto.randomUUID()
      });
      input.value = "";
    } catch (error) {
      setStatus("chatPeerLabel", `Message not sent: ${error.message}`, true);
    }
  }

  async function blockActivePeer() {
    if (!chatPeer || !confirm(`Block @${chatPeerProfile?.username || "this person"}? They will no longer be able to contact or match with you.`)) return;
    try {
      await callables.blockUser({ targetUid: chatPeer });
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

  function openReport(targetUid, roomId = null) {
    reportTarget = targetUid;
    reportRandomRoomId = roomId;
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
      if (reportRandomRoomId) {
        const submitRandomReport = httpsCallable(functions, "submitRandomChatReport");
        await submitRandomReport({ roomId: reportRandomRoomId, category, description });
      } else {
        await callables.submitUserReport({ targetUid: reportTarget, category, description });
      }
      $("reportDialog").close();
      alert("Your report was submitted with the details you provided.");
      await refreshAccountStatus();
    } catch (error) {
      setStatus("reportSubmitStatus", `Report could not be submitted: ${error.message}`, true);
    }
  }

  async function renderRandomMessages(roomId) {
    stopListener(randomMessageListener);
    randomMessageListener = onSnapshot(query(
      collection(db, "randomRooms", roomId, "messages"),
      orderBy("createdAt", "asc"),
      limit(100)
    ), async snapshot => {
      const container = $("randomChatMessages");
      container.replaceChildren();
      for (const message of snapshot.docs) {
        const data = message.data();
        const line = document.createElement("div");
        const label = document.createElement("strong");
        label.textContent = `${data.senderAlias || "Guest"}: `;
        line.className = `chatBubble${data.senderAlias === randomAlias ? " mine" : ""}`;
        line.appendChild(label);
        const text = document.createElement("span");
        try {
          text.textContent = await decryptMessage(identity, randomPeerKey, roomId, data);
        } catch (error) {
          console.error("Could not decrypt a random-chat message.", error);
          text.textContent = "Unable to decrypt this message on this device.";
        }
        line.appendChild(text);
        container.appendChild(line);
      }
      container.scrollTop = container.scrollHeight;
    }, error => setStatus("randomEligibility", error.message, true));
  }

  function updateRandomTimer(expiresAt) {
    clearInterval(randomTimer);
    const deadline = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      $("randomChatTimer").textContent =
        `${String(Math.floor(remaining / 60000)).padStart(2, "0")}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;
      if (remaining === 0) endRandomChat(true).catch(error => setStatus("randomEligibility", error.message, true));
    };
    tick();
    randomTimer = setInterval(tick, 1000);
  }

  async function startRandomChat() {
    try {
      $("startRandomChatBtn").disabled = true;
      const result = await callables.findRandomChat({ encryptionPublicKey: identity.publicKey });
      randomRoomId = result.data.roomId;
      randomPeerKey = result.data.peerEncryptionPublicKey || null;
      randomAlias = result.data.alias;
      randomActive = result.data.status === "active";
      randomMessagesSubscribed = false;
      $("randomChatPanel").hidden = false;
      $("randomChatEndPanel").hidden = true;
      $("randomChatMessages").replaceChildren();
      $("randomChatTimer").textContent = result.data.status === "active" ? "05:00" : "Finding someone…";
      updateRandomTimer(result.data.expiresAt);
      setStatus("randomEligibility", result.data.status === "waiting" ? "Looking for an available chat partner…" : `Connected as ${result.data.alias}.`);
      stopListener(randomRoomListener);
      randomRoomListener = onSnapshot(doc(db, "randomRooms", randomRoomId), async snapshot => {
        const data = snapshot.data();
        if (!data) return;
        if (data.status === "active" && !randomPeerKey) {
          const updated = await callables.findRandomChat({ encryptionPublicKey: identity.publicKey });
          randomPeerKey = updated.data.peerEncryptionPublicKey || null;
        }
        if (data.status === "active" && randomPeerKey) {
          randomActive = true;
          setStatus("randomEligibility", `Connected as ${result.data.alias}. Your username is hidden.`);
          if (!randomMessagesSubscribed) {
            updateRandomTimer(data.expiresAt.toDate().toISOString());
            randomMessagesSubscribed = true;
            await renderRandomMessages(randomRoomId);
          }
        } else if (data.status === "closed" || new Date(data.expiresAt.toDate()).getTime() <= Date.now()) {
          await endRandomChat(false);
        }
      }, error => setStatus("randomEligibility", error.message, true));
    } catch (error) {
      setStatus("randomEligibility", error.message, true);
      $("startRandomChatBtn").disabled = false;
      await refreshAccountStatus();
    }
  }

  async function sendRandomMessage() {
    const plaintext = $("randomMessageInput").value.trim();
    if (!plaintext || !randomRoomId || !randomPeerKey) return;
    try {
      const encrypted = await encryptMessage(identity, randomPeerKey, randomRoomId, plaintext);
      await callables.sendRandomChatMessage({
        roomId: randomRoomId,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce
      });
      $("randomMessageInput").value = "";
    } catch (error) {
      setStatus("randomEligibility", `Message not sent: ${error.message}`, true);
    }
  }

  async function endRandomChat(callServer) {
    clearInterval(randomTimer);
    stopListener(randomRoomListener);
    stopListener(randomMessageListener);
    randomRoomListener = null;
    randomMessageListener = null;
    if (callServer && randomRoomId) {
      try { await callables.leaveRandomChat({ roomId: randomRoomId }); }
      catch (error) { console.error("Could not close random chat cleanly.", error); }
    }
    $("randomChatEndPanel").hidden = false;
    $("startRandomChatBtn").disabled = false;
    $("randomMessageInput").disabled = true;
    $("sendRandomMessageBtn").disabled = true;
    randomActive = false;
    setStatus("randomEligibility", "This anonymous chat has ended.");
    randomPeerKey = null;
  }

  async function setRandomShare(share) {
    if (!randomRoomId) return;
    const roomId = randomRoomId;
    try {
      const result = await callables.shareRandomUsername({ roomId, share });
      setStatus("randomShareStatus", share ? "Your username has been shared with this person." : "Your username was not shared.");
      const checkForPeerShare = async () => {
        const status = await callables.getRandomChatStatus({ roomId });
        if (status.data.peerUsername) {
          setStatus("randomShareStatus", `${share ? "Your username has been shared." : "You stayed anonymous."} They also shared @${status.data.peerUsername}.`);
          if (randomRoomId === roomId) randomRoomId = null;
          $("startRandomChatBtn").disabled = false;
          return true;
        }
        return false;
      };
      if (result.data.peerUsername) {
        setStatus("randomShareStatus", `${share ? "Your username has been shared." : "You stayed anonymous."} They also shared @${result.data.peerUsername}.`);
        if (randomRoomId === roomId) randomRoomId = null;
        $("startRandomChatBtn").disabled = false;
      } else {
        await checkForPeerShare();
        if (share) {
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            try {
              if (await checkForPeerShare() || attempts >= 20) clearInterval(poll);
            } catch (error) {
              clearInterval(poll);
              setStatus("randomShareStatus", error.message, true);
            }
          }, 1500);
        } else {
          if (randomRoomId === roomId) randomRoomId = null;
          $("startRandomChatBtn").disabled = false;
        }
      }
    } catch (error) {
      setStatus("randomShareStatus", error.message, true);
    }
  }

  async function refreshAccountStatus(statusId = "moderationStatus") {
    if (!currentUser) return;
    try {
      const status = await readAccountStatus();
      $("appealPanel").hidden = !status.banned && !status.randomChatSuspended;
      $("startRandomChatBtn").disabled = Boolean(status.banned || status.randomChatSuspended || randomActive);
      if (status.banned) {
        setStatus("moderationStatus", "Your account is banned. You can sign in and submit an appeal for review. Reinstatement is not guaranteed.");
      } else if (status.deactivated) {
        setStatus("moderationStatus", "Your account is deactivated. Sign out and sign back in to reactivate it.");
      } else if (status.randomChatSuspended) {
        setStatus("moderationStatus", `Gentle warning: multiple safety reports have temporarily paused random chat until ${new Date(status.randomChatSuspendedUntil).toLocaleString()}. You can appeal this decision.`);
      } else {
        setStatus("moderationStatus", "Your account is in good standing. Reports are reviewed; a report is not proof by itself.");
      }
      setStatus("randomEligibility", status.banned
        ? "Random chat is unavailable while your account is banned."
        : status.deactivated ? "Random chat is unavailable while your account is deactivated."
          : status.randomChatSuspended ? "Random chat is paused for your account." : "");
    } catch (error) {
      setStatus(statusId, `Account status could not be loaded: ${error.message}`, true);
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
      const accountStatus = await readAccountStatus();
      if (accountStatus.banned) throw new Error("Your account is restricted from posting.");
      if (accountStatus.deactivated) throw new Error("Your account is deactivated. Sign out and sign back in before posting.");
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
      await callables.sendConnectionRequest({ recipientUid: selectedPublicProfile.uid });
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
      await callables.blockUser({ targetUid: selectedPublicProfile.uid });
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
    try {
      await callables.submitModerationAppeal({ explanation });
      $("appealMessage").value = "";
      setStatus("appealStatus", "Your appeal has been submitted for review. Reinstatement is not guaranteed.");
    } catch (error) {
      setStatus("appealStatus", error.message, true);
    }
  }

  function emailAppeal() {
    const explanation = $("appealMessage").value.trim();
    const accountEmail = currentUser?.email || "";
    const subject = encodeURIComponent("MAWAESU account restriction appeal");
    const body = encodeURIComponent(
      `Account email: ${accountEmail}\n\nMy appeal:\n${explanation || "[Please explain why you are appealing.]"}\n\nI understand the decision may be upheld or changed after review.`
    );
    window.location.href = `mailto:mawaesu.toknowyou@gmail.com?subject=${subject}&body=${body}`;
  }

  async function openCommunity(pageId) {
    if (!currentUser) return;
    listeners.forEach(stopListener);
    listeners = [];
    clearChatPreviewListeners();
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
  $("sendRandomMessageBtn").addEventListener("click", sendRandomMessage);
  $("randomMessageInput").addEventListener("keydown", event => { if (event.key === "Enter") sendRandomMessage(); });
  $("leaveRandomChatBtn").addEventListener("click", () => endRandomChat(true));
  $("reportRandomPeerBtn").addEventListener("click", () => openReport(null, randomRoomId));
  $("shareRandomUsernameBtn").addEventListener("click", () => setRandomShare(true));
  $("keepRandomAnonymousBtn").addEventListener("click", () => setRandomShare(false));
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
  document.addEventListener("mawaesu-random-ended", () => {
    $("randomChatPanel").hidden = false;
    $("randomChatEndPanel").hidden = false;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (randomRoomId && !$("randomChatPanel").hidden) {
      $("randomMessageInput").disabled = false;
      $("sendRandomMessageBtn").disabled = false;
    }
  });

  onAuthStateChanged(auth, async user => {
      clearListeners();
      currentUser = user;
      identity = null;
      myProfile = null;
      activeChat = null;
      randomRoomId = null;
      randomPeerKey = null;
      chatPeer = null;
      chatPeerProfile = null;
      $("chatMessageInput").disabled = true;
      $("sendChatMessageBtn").disabled = true;
      $("randomMessageInput").disabled = false;
      $("sendRandomMessageBtn").disabled = false;
      $("startRandomChatBtn").disabled = false;
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
    reactivateAccount: () => callables.reactivateAccount({}),
    deactivateAccount: () => callables.deactivateAccount({}),
    deleteAccount: async () => {
      const result = await callables.deleteAccount({});
      try {
        await deleteIdentity(currentUser.uid);
      } catch (error) {
        console.error("The account was deleted, but its local encryption key could not be removed.", error);
        setStatus("accountActionStatus", `Your account was deleted, but its encryption key could not be cleared from this device: ${error.message}`, true);
      }
      return result;
    },
    getIdentity: async () => identity || (identity = await getOrCreateIdentity(currentUser.uid))
  };
}
