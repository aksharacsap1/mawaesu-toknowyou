import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, social, rules, indexes, functions, firebaseConfig, avatars] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/social.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"),
  readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
  readFile(new URL("../firebase.json", import.meta.url), "utf8"),
  readFile(new URL("../public/avatars.js", import.meta.url), "utf8")
]);

test("community navigation and private/public profile collections are distinct", () => {
  const navigation = html.match(/<nav id="appNavigation"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(navigation);
  assert.deepEqual(
    [...navigation.matchAll(/data-go="([^"]+)"/g)].map(match => match[1]),
    ["mainMenuPage", "searchPage", "chatsPage", "profilePage"]
  );
  assert.match(html, /id="myNotesTab"[\s\S]*id="myFeaturedTab"[\s\S]*id="mySavedTab"/);
  assert.match(html, /id="publicNotesTab"[\s\S]*id="publicFeaturedTab"/);
  assert.match(html, /id="savedNotesPanel" role="tabpanel"[\s\S]*Only you can see the notes you save/);
  const publicProfile = html.match(/<section id="publicUserProfile"[\s\S]*?<\/section>/)?.[0];
  assert.ok(publicProfile);
  assert.doesNotMatch(publicProfile, /savedNotesFeed|deleteAccountBtn|deactivateAccountBtn|signOutBtn/);
});

test("username search supports safe prefix suggestions and a bounded result set", () => {
  assert.match(social, /where\("active", "==", true\)[\s\S]*?orderBy\("username"\)[\s\S]*?startAt\(username\)[\s\S]*?endAt\(`\$\{username\}\\uf8ff`\)[\s\S]*?limit\(12\)/);
  assert.match(indexes, /"collectionGroup": "publicProfiles"[\s\S]*?"fieldPath": "active"[\s\S]*?"fieldPath": "username"/);
  assert.match(social, /item\.appendChild\(makeProfileAvatar\(profile\)\)/);
});

test("notes render editorial metadata and comments show author and time", () => {
  assert.match(html, /id="newNoteTitle"/);
  assert.match(social, /className = "noteTitle"/);
  assert.match(social, /className = "noteBody"/);
  assert.match(social, /className = "muted noteTimestamp"/);
  assert.match(social, /className = "noteCommentHeading"/);
  assert.match(social, /Comments \(\$\{snapshot\.size\}\)/);
});

test("featured notes preserve original author identity and do not copy ownership", () => {
  assert.match(social, /featuredByUserId: currentUser\.uid/);
  assert.match(social, /originalNoteId: noteDocument\.id/);
  assert.match(social, /originalAuthorId: note\.authorUid/);
  assert.match(social, /originalAuthorUsername: originalAuthorName/);
  assert.match(rules, /request\.resource\.data\.originalAuthorId[\s\S]*?== request\.resource\.data\.originalAuthorUsername/);
  assert.match(social, /Originally written by @\$\{originalAuthorUsername \|\| originalAuthorName\}/);
});

test("private saves and conversation read markers are owner-restricted", () => {
  assert.match(rules, /match \/savedNotes\/\{noteId\} \{[\s\S]*?allow read: if isSelf\(uid\)/);
  assert.match(rules, /match \/readStates\/\{uid\} \{[\s\S]*?allow read: if isSelf\(uid\) && canReadChat\(chatId\)/);
  assert.match(rules, /allow create, update: if isSelf\(uid\) && canReadChat\(chatId\)[\s\S]*?lastReadAt == request\.time/);
  assert.match(social, /className = "unreadIndicator"/);
  assert.match(social, /decryptMessage\(identity, profile\.encryptionPublicKey, chat\.id, message\)/);
  assert.match(functions, /where\("featuredByUserId", "==", uid\)/);
});

test("community avatars use built-in selectable designs without image hosting", () => {
  assert.match(html, /id="avatarChoices"[\s\S]*?role="group"/);
  assert.match(html, /Choose an illustrated avatar/);
  assert.match(social, /updatePublicProfile\(\{[\s\S]*?avatarId/);
  assert.match(social, /getAvatarOption\(profile\.avatarId\)/);
  assert.match(functions, /data\.avatarId[\s\S]*?available illustrated avatars/);
  assert.match(avatars, /id: "leaf"/);
  assert.doesNotMatch(html + social, /firebase-storage\.js|uploadBytes|getDownloadURL|uploadAvatar/);
  assert.doesNotMatch(firebaseConfig, /"storage"\s*:/);
});

test("notes and reports are text-only and reject media uploads", () => {
  assert.doesNotMatch(html, /noteMediaInput|reportEvidenceInput|<input\b[^>]*type="file"/);
  assert.match(html, /Reports currently accept written details only/);
  assert.doesNotMatch(social, /mediaUrl|mediaType|reportEvidence|uploadBytes|firebase-storage\.js/);
  assert.doesNotMatch(functions, /getStorage|reserveReportEvidenceSlot|reportEvidenceSlots/);
  const noteRules = rules.match(/function validNote\(data\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(noteRules);
  assert.doesNotMatch(noteRules, /mediaUrl|mediaType/);
});
