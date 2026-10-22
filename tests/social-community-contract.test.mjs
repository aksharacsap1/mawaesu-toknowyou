import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, social, rules, indexes, functions, firebaseConfig, avatars, shareCardSource] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/social.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"),
  readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
  readFile(new URL("../firebase.json", import.meta.url), "utf8"),
  readFile(new URL("../public/avatars.js", import.meta.url), "utf8"),
  readFile(new URL("../public/share-card.js", import.meta.url), "utf8")
]);
const { getSpatialVibe } = await import(`data:text/javascript;base64,${Buffer.from(shareCardSource).toString("base64")}`);

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
  assert.match(social, /decryptMessage\(identity, profile\.encryptionPublicKey, chatId, data\)/);
});

test("community avatars use built-in selectable designs without image hosting", () => {
  assert.match(html, /id="avatarChoices"[\s\S]*?role="group"/);
  assert.match(html, /Choose an illustrated avatar/);
  assert.match(social, /avatarId,[\s\S]*?encryptionPublicKey: identity\.publicKey/);
  assert.match(social, /getAvatarOption\(profile\.avatarId\)/);
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

test("account status works without a callable and handles partial moderation records", () => {
  assert.match(social, /getDoc\(doc\(db, "moderationCounters", currentUser\.uid\)\)/);
  assert.match(social, /getDoc\(doc\(db, "accountStatuses", currentUser\.uid\)\)/);
  assert.doesNotMatch(social, /httpsCallable\(functions, "getAccountStatus"\)/);
  assert.match(rules, /match \/moderationCounters\/\{uid\} \{\s*allow read: if isSelf\(uid\);\s*allow write: if false;/);
  assert.ok(rules.includes("!('banned' in get(/databases/$(database)/documents/moderationCounters/$(uid)).data.keys())"));
  assert.match(rules, /match \/accountStatuses\/\{uid\} \{[\s\S]*?allow create: if isSelf\(uid\)[\s\S]*?deactivated == true[\s\S]*?allow update: if isSelf\(uid\)[\s\S]*?deactivated is bool/);
});

test("navigation targets exist and community tabs dispatch section loads", () => {
  const pageIds = new Set([...html.matchAll(/<div id="([^"]+)" class="page/g)].map(match => match[1]));
  const destinations = [...html.matchAll(/data-go="([^"]+)"/g)].map(match => match[1]);
  for (const destination of destinations) {
    assert.ok(pageIds.has(destination), `Navigation target ${destination} must exist`);
  }
  assert.match(html, /new CustomEvent\("mawaesu-page-change", \{ detail:pageId \}\)/);
  assert.match(social, /if \(\["mainMenuPage", "searchPage", "chatsPage", "profilePage"\]\.includes\(event\.detail\)\)/);
  assert.match(html, /const navigationPage = pageId === "roomIntroPage" \|\| pageId === "roomAnalysisPage" \? "profilePage" : pageId/);
});

test("Spark deployment removes callable dependencies and disables unsafe anonymous matching", () => {
  assert.doesNotMatch(social, /httpsCallable|getFunctions|firebase-functions\.js|callables\./);
  assert.doesNotMatch(firebaseConfig, /"functions"\s*:/);
  assert.match(social, /transaction\.set\(profileRef/);
  assert.match(social, /await addDoc\(collection\(db, "directChats", activeChat, "messages"\)/);
  assert.match(social, /async function sendConnectionRequest/);
  assert.match(social, /async function directChatId\(currentUid, peerUid\)/);
  assert.match(social, /Anonymous matching is paused on Firebase Spark/);
  assert.match(html, /id="startRandomChatBtn"[^>]*disabled/);
  assert.match(html, /Safety reports and appeals are reviewed manually/);
  assert.match(rules, /match \/userReports\/\{reportId\}/);
  assert.match(rules, /match \/moderationAppeals\/\{appealId\}/);
  assert.match(rules, /match \/connections\/\{uid\}\/users\/\{otherUid\}/);
  assert.match(rules, /getAfter\(\/databases\/\$\(database\)\/documents\/connectionRequests/);
});

test("account-status read failures do not block notes or expose Firebase internals", () => {
  const publishNote = social.match(/async function publishNote\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(publishNote);
  assert.doesNotMatch(publishNote, /readAccountStatus/);
  assert.match(social, /Safety status will appear here when available/);
  assert.match(html, /Safety status could not be checked right now/);
  assert.doesNotMatch(html, /Your account status could not be checked: \$\{accountStatusError\}/);
});

test("quiz results create a branded, downloadable share card with three-word vibes", () => {
  for (const id of ["flexCardPreview", "downloadFlexCardBtn"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /shareInstagramBtn|shareXBtn|sharePinterestBtn|Instagram Stories|Share to X|Pinterest/);
  assert.match(html, /void renderFlexCard\(stored\[0\]\)/);
  assert.match(shareCardSource, /canvas\.toBlob[\s\S]*?"image\/png"/);
  assert.match(shareCardSource, /siteUrl\.replace/);
  assert.match(html, /bindClick\("downloadFlexCardBtn", downloadResultCard\)/);
  assert.doesNotMatch(shareCardSource, /navigator\.share|twitter\.com|pinterest\.com|instagram\.com/);

  for (const archetype of ["🌿 The Gentle Healer", "🌙 The Wounded Dreamer", "🌟 The Luminous Soul"]) {
    assert.equal(getSpatialVibe(archetype).split(" · ").length, 3);
  }
});
