import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signOut, updateProfile, deleteUser
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc,
  serverTimestamp, query, where, writeBatch, orderBy, limit, startAfter,
  collectionGroup, runTransaction, getCountFromServer
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6pnGyG_S5WLz5JNW4hDcgAVto6YtdRWo",
  authDomain: "mawaesu-toknowyou.firebaseapp.com",
  projectId: "mawaesu-toknowyou",
  storageBucket: "mawaesu-toknowyou.appspot.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = (id) => document.getElementById(id);
if (new URLSearchParams(location.search).get("route") === "assessment" && !location.hash) {
  history.replaceState(null, "", `${location.pathname}#assessment`);
}
const routeContent = $("routeContent");
let currentUser = null;
let state = { profile:{}, entries:[], intentions:[], captured:[], goals:[], drafts:[], books:[], rooms:[], archive:[] };
let communityNotes = [];
let communityNotesCursor = null;
let communityNotesHaveMore = true;
const communityNotesPageSize = 12;
let profileOwnNotes = [];
let profileSavedNotes = [];
let profileWritingTab = "Saved";
const profileAvatarSymbols = ["🌿","🌸","🌞","🌙","🌊","🍃","✨","🌼"];
const assessmentQuestions = [
  "When you feel emotionally overwhelmed, you usually:",
  "Your ideal room feels:",
  "When making big decisions, you rely most on:",
  "When conflict arises, you naturally:",
  "What recharges your energy fastest?",
  "When entering a new space, you notice first:",
  "Stress usually makes you:",
  "Your strongest motivation tends to be:",
  "When someone confides in you, you:",
  "Your memories tend to center around:",
  "Your comfort zone is:",
  "When routines break, you:",
  "When feeling misunderstood, you:",
  "Your relationship with time is:",
  "When imagining the future, you think about:",
  "You feel most authentic when:",
  "When facing uncertainty, you:",
  "Your creativity appears as:",
  "What makes a place feel like home?",
  "When emotionally hurt, you:",
  "You feel safest when:",
  "When collaborating, you contribute most by:",
  "When facing failure, you:",
  "Your attention naturally moves toward:",
  "When learning, you prefer:",
  "Your leadership style is:",
  "When overwhelmed, your instinct is to:",
  "Your biggest internal strength is:",
  "When walking into chaos, you:",
  "You interpret silence as:",
  "Your emotional processing is:",
  "Your dreams usually focus on:",
  "When you need inspiration, you:",
  "When solving emotional challenges, you trust:",
  "Your decision speed is usually:",
  "Your personal growth happens through:",
  "When comfort is threatened, you:",
  "Your strongest memory triggers are:",
  "You feel most alive when:",
  "Your stress recovery method is:",
  "When observing others, you notice:",
  "When your environment feels wrong, you:",
  "You feel most balanced when life is:",
  "Your instinct during uncertainty is to:",
  "Your deepest drive is:"
];
const assessmentChoiceScores = [3,0,1,2];
const assessmentAnswerOptions = [
  ["Seek someone to support","Withdraw to process alone","Escape into imagination","Create a structured plan"],
  ["Warm and welcoming","Quiet and minimal","Creative and expressive","Organized and efficient"],
  ["Impact on people","Inner reflection","Creative possibilities","Logical sequencing"],
  ["Try to heal relationships","Take emotional distance","Reframe creatively","Focus on solutions"],
  ["Helping others","Being alone peacefully","Creating or imagining","Achieving a goal"],
  ["People's comfort levels","Atmosphere and silence","Visual inspiration","Layout efficiency"],
  ["Emotionally protective of others","Internally withdrawn","Mentally scattered with ideas","Highly task focused"],
  ["Connection","Peace","Expression","Achievement"],
  ["Offer emotional support","Listen quietly","Help them reinterpret creatively","Suggest practical steps"],
  ["Shared emotional experiences","Moments of stillness","Creative sparks","Personal milestones"],
  ["Emotionally expressive environments","Calm solitary spaces","Dynamic artistic settings","Structured predictable settings"],
  ["Check on others emotionally","Observe and adapt slowly","Experiment with alternatives","Rebuild structure quickly"],
  ["Try to reconnect emotionally","Retreat inward","Express through art or ideas","Clarify logically"],
  ["Centered around relationships","Fluid and reflective","Idea-driven and nonlinear","Schedule oriented"],
  ["Who will be there with you","How peaceful it feels","What you might create","What you might accomplish"],
  ["Caring for someone","Sitting with your thoughts","Expressing ideas freely","Leading or organizing"],
  ["Seek reassurance","Accept ambiguity quietly","Explore possibilities","Build contingency plans"],
  ["Emotional empathy","Reflective interpretation","Artistic imagination","Innovative problem solving"],
  ["Loved ones present","Silence and familiarity","Personal expression","Functional reliability"],
  ["Focus on healing bonds","Internalize feelings","Channel into creativity","Analyze the cause"],
  ["Relationships are stable","You have personal space","You can dream freely","Plans are predictable"],
  ["Supporting group harmony","Observing deeply","Generating ideas","Organizing tasks"],
  ["Seek emotional reassurance","Reflect privately","Reimagine possibilities","Strategize improvement"],
  ["People's emotional needs","Subtle environmental cues","Visual or conceptual novelty","Patterns and systems"],
  ["Discussion and collaboration","Independent contemplation","Creative experimentation","Structured instruction"],
  ["Emotionally supportive","Quietly observant","Visionary and inspiring","Strategic and directive"],
  ["Care for others first","Withdraw and regulate internally","Escape into imagination","Control surroundings"],
  ["Empathy","Self-awareness","Creative thinking","Discipline"],
  ["Support emotional stability","Watch silently first","Find creative angles","Establish order"],
  ["Emotional sensitivity","Comfort","Creative incubation","Information processing"],
  ["Shared outwardly","Deep and internal","Expressive symbolically","Analytical"],
  ["Relationships","Personal reflection","Creative imagery","Goals and tasks"],
  ["Talk to someone meaningful","Seek solitude","Engage with art or ideas","Review plans or data"],
  ["Connection","Self-reflection","Creative reinterpretation","Logical analysis"],
  ["Emotionally paced","Slow and reflective","Spontaneously inspired","Calculated and planned"],
  ["Relationships","Self-understanding","Creative exploration","Goal achievement"],
  ["Strengthen relationships","Seek inner quiet","Create new possibilities","Reorganize control"],
  ["Emotional connections","Sensory stillness","Visual imagination","Achievements"],
  ["Connecting deeply","Understanding yourself","Creating something new","Completing challenges"],
  ["Emotional support","Isolation and reflection","Creative engagement","Action planning"],
  ["Their emotional state","Their energy and presence","Their creative expression","Their efficiency"],
  ["Adjust relational energy","Withdraw inwardly","Redesign creatively","Rearrange structurally"],
  ["Emotionally meaningful","Internally peaceful","Creatively stimulating","Organized and purposeful"],
  ["Strengthen emotional bonds","Wait and observe","Experiment with ideas","Design a solution"],
  ["To nurture connection","To find inner harmony","To create and imagine","To build and accomplish"]
];
const assessmentArchetypes = [
  ["🌫️ The Silent Ache","Core Emotion: Emptiness\nHelpful Emotion: Tenderness\nEmotion Pulling You Back: Despair\nMantra: 'Even a flicker counts.'"],
  ["🌙 The Wounded Dreamer","Core Emotion: Longing\nHelpful Emotion: Imagination\nEmotion Pulling You Back: Resignation\nMantra: 'My longing is a compass.'"],
  ["🫧 The Fragile Survivor","Core Emotion: Fear\nHelpful Emotion: Awareness\nEmotion Pulling You Back: Hopelessness\nMantra: 'I am allowed to feel safe.'"],
  ["🌧️ The Quiet Keeper","Core Emotion: Grief\nHelpful Emotion: Sensitivity\nEmotion Pulling You Back: Isolation\nMantra: 'Grief is love with nowhere to go—so I'll give it a place.'"],
  ["🧭 The Searching Soul","Core Emotion: Confusion\nHelpful Emotion: Curiosity\nEmotion Pulling You Back: Self-doubt\nMantra: 'Test, learn, iterate.'"],
  ["🌪️ The Restless Heart","Core Emotion: Restlessness\nHelpful Emotion: Desire\nEmotion Pulling You Back: Shame\nMantra: 'Desire is data.'"],
  ["🔥 The Hidden Flame","Core Emotion: Anger\nHelpful Emotion: Determination\nEmotion Pulling You Back: Frustration\nMantra: 'My anger guards what matters.'"],
  ["🌿 The Gentle Healer","Core Emotion: Compassion\nHelpful Emotion: Empathy\nEmotion Pulling You Back: Exhaustion\nMantra: 'I am a well, not a pipeline.'"],
  ["🏔️ The Resilient Wanderer","Core Emotion: Perseverance\nHelpful Emotion: Hope\nEmotion Pulling You Back: Weariness\nMantra: 'I can pause without quitting.'"],
  ["🫀 The Shattered Light","Core Emotion: Vulnerability\nHelpful Emotion: Authenticity\nEmotion Pulling You Back: Fear of rejection\nMantra: 'I don't have to earn being real.'"],
  ["🌞 The Quiet Fighter","Core Emotion: Determination\nHelpful Emotion: Courage\nEmotion Pulling You Back: Doubt\nMantra: 'One brave inch at a time.'"],
  ["🌤️ The Gentle Dreamer","Core Emotion: Hope\nHelpful Emotion: Wonder\nEmotion Pulling You Back: Innocence\nMantra: 'Soft heart, strong spine.'"],
  ["🌈 The Radiant Spirit","Core Emotion: Joy\nHelpful Emotion: Gratitude\nEmotion Pulling You Back: Avoidance\nMantra: 'Joy is not a betrayal of pain.'"],
  ["🦁 The Brave Heart","Core Emotion: Courage\nHelpful Emotion: Strength\nEmotion Pulling You Back: Pride\nMantra: 'Strong enough to be helped.'"],
  ["🔥 The Inner Flame","Core Emotion: Passion\nHelpful Emotion: Creativity\nEmotion Pulling You Back: Obsession\nMantra: 'Tend the fire, don't feed the frenzy.'"],
  ["🕯️ The Guiding Light","Core Emotion: Wisdom\nHelpful Emotion: Clarity\nEmotion Pulling You Back: Detachment\nMantra: 'Wisdom lives in a warm body.'"],
  ["🌠 The Boundless Dreamer","Core Emotion: Inspiration\nHelpful Emotion: Vision\nEmotion Pulling You Back: Restlessness\nMantra: 'Focus turns light into laser.'"],
  ["🎙️ The Brave Creator","Core Emotion: Authenticity\nHelpful Emotion: Expression\nEmotion Pulling You Back: Vulnerability hangover\nMantra: 'I am safe to be seen.'"],
  ["❤️‍🔥 The Compassionate Flame","Core Emotion: Love\nHelpful Emotion: Connection\nEmotion Pulling You Back: Over-giving\nMantra: 'My love includes me.'"],
  ["🌟 The Luminous Soul","Core Emotion: Wholeness\nHelpful Emotion: Peace\nEmotion Pulling You Back: Fragility\nMantra: 'Nothing missing. Nothing extra.'"]
];
let quizIndex = 0;
let quizScore = 0;
let quizAnswers = [];

const affirmations = [
  ["I can learn to meet uncertainty with curiosity rather than judgment.","Courage"],
  ["My worth is not measured by how much I complete today.","Self-worth"],
  ["I may change my mind as I learn more.","Growth"],
  ["Rest is a useful part of my pace, not a failure.","Rest"],
  ["I can hold grief and gratitude without choosing one over the other.","Emotional awareness"],
  ["Small, honest efforts still matter.","Patience"],
  ["I am allowed to take up space and make it my own.","Confidence"],
  ["I can ask for support while remaining responsible for my choices.","Relationships"]
];
const reflections = [
  "What did you notice about yourself today?",
  "What challenged your perspective recently?",
  "What would you like to understand better?",
  "What experience would you like to remember?",
  "What is one thing you appreciated about your environment?",
  "What would you approach differently tomorrow?"
];
const discoveries = [
  {title:"The default mode network",category:"Psychology",text:"Periods of wakeful rest can involve internally focused thought, including memory and future planning. These experiences are varied and are not a single measure of creativity or health.",source:"National Institute of Neurological Disorders and Stroke",sourceUrl:"https://www.ninds.nih.gov/"},
  {title:"A room as a sequence",category:"Architecture",text:"Good spatial design considers how people enter, pause, move, work, and rest. Circulation is as meaningful as the objects placed within a room.",source:"Royal Institute of British Architects",sourceUrl:"https://www.architecture.com/"},
  {title:"The history of common gardens",category:"History",text:"Shared gardens have served as practical sources of food and as places of exchange, care, learning, and contested land use across many societies.",source:"Smithsonian Gardens",sourceUrl:"https://gardens.si.edu/"}
];

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function dailyIndex(list, seed = localDateKey()) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % list.length;
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[char]));
}
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}
function pathFor(type, id) { return doc(db, "users", currentUser.uid, type, id); }
async function saveDocument(type, id, data) {
  if (!currentUser) return;
  try {
    const target = type === "profile"
      ? doc(db, "users", currentUser.uid)
      : pathFor(type, id);
    await setDoc(target, { ...data, updatedAt: serverTimestamp() }, { merge:true });
  }
  catch (error) { toast("Could not save: " + error.message); throw error; }
}
async function deleteDocument(type, id) {
  if (!currentUser) return;
  await deleteDoc(pathFor(type,id));
}
async function loadCollection(type) {
  if (!currentUser) return [];
  try {
    const snapshot = await getDocs(collection(db, "users", currentUser.uid, type));
    return snapshot.docs.map(item => ({ id:item.id, ...item.data() }));
  } catch (error) { toast("Could not load saved " + type); return []; }
}
async function loadState() {
  const [profile, entries, intentions, captured, goals, drafts, books, rooms, archive] = await Promise.all([
    getDoc(doc(db,"users",currentUser.uid)).then(s => s.exists()?s.data():{}),
    loadCollection("entries"), loadCollection("intentions"), loadCollection("captures"),
    loadCollection("goals"), loadCollection("drafts"), loadCollection("books"),
    loadCollection("rooms"), loadCollection("archive")
  ]);
  state = { profile, entries, intentions, captured, goals, drafts, books, rooms, archive };
  applyProfilePreferences();
}
function applyProfilePreferences() {
  const legacyProfile = state.profile.profileState || {};
  state.profile.publicHandle ||= state.profile.username || legacyProfile.username || "";
  state.profile.bio ||= legacyProfile.bio || "";
  state.profile.avatarUrl ||= legacyProfile.avatar || "";
  state.profile.publicBio ??= "";
  const theme = state.profile.theme || "light";
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme:dark)").matches);
  document.body.classList.toggle("dark", dark);
  document.body.classList.toggle("large-text", !!state.profile.largeText);
  const name = state.profile.displayName || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Friend";
  $("accountName").textContent = name;
  $("avatarInitial").textContent = name[0]?.toUpperCase() || "M";
  const profileName = $("profileDisplayName");
  if(profileName)profileName.value=name;
  const usernameInput = $("profileUsername");
  if(usernameInput){
    usernameInput.value=state.profile.publicHandle;
    usernameInput.disabled=!!state.profile.publicHandle;
    $("profileUsernameNote").textContent=state.profile.publicHandle
      ? `Your handle is @${state.profile.publicHandle} and cannot be changed.`
      : "Choose a unique, permanent handle so people can find you. Only your display name and optional bio are shown.";
  }
  const privateBio=$("profileBio");
  if(privateBio)privateBio.value=state.profile.bio||"";
  const publicBio=$("profilePublicBio");
  if(publicBio)publicBio.value=state.profile.publicBio||"";
  const themeInput=$("profileTheme");
  if(themeInput)themeInput.value=theme;
  const largeText=$("profileLargeText");
  if(largeText)largeText.checked=!!state.profile.largeText;
  renderProfileAvatar();
}

function authMode(mode) {
  ["login","signup","forgot"].forEach(name => $(name+"Form").hidden = name !== mode);
  ["loginError","signupError","forgotError"].forEach(id => $(id).textContent = "");
}
document.querySelectorAll("[data-auth]").forEach(button => button.addEventListener("click",()=>authMode(button.dataset.auth)));

function friendlyAuthError(error) {
  const code = error.code || "";
  if (code.includes("invalid-credential")) return "The email or password was not recognised.";
  if (code.includes("email-already-in-use")) return "An account already exists with this email.";
  if (code.includes("weak-password")) return "Choose a stronger password.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("network")) return "Check your connection and try again.";
  return error.message || "Unable to complete that request.";
}
$("loginBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim(), password = $("loginPassword").value;
  $("loginBtn").disabled = true; $("loginError").textContent = "";
  try { await signInWithEmailAndPassword(auth,email,password); }
  catch(error){ $("loginError").textContent = friendlyAuthError(error); }
  finally { $("loginBtn").disabled = false; }
});
$("signupBtn").addEventListener("click", async () => {
  const name = $("signupName").value.trim(), email = $("signupEmail").value.trim(), password = $("signupPassword").value;
  $("signupError").textContent = "";
  if (!name || !email || !password) { $("signupError").textContent="Complete all fields."; return; }
  if (password.length < 8) { $("signupError").textContent="Use at least 8 characters."; return; }
  $("signupBtn").disabled=true;
  try {
    const credential = await createUserWithEmailAndPassword(auth,email,password);
    await updateProfile(credential.user,{displayName:name});
    await setDoc(doc(db,"users",credential.user.uid),{displayName:name,email,createdAt:serverTimestamp(),onboardingComplete:false},{merge:true});
  } catch(error){ $("signupError").textContent=friendlyAuthError(error); }
  finally { $("signupBtn").disabled=false; }
});
$("resetBtn").addEventListener("click", async () => {
  const email=$("forgotEmail").value.trim(); $("forgotError").textContent="";
  if(!email){$("forgotError").textContent="Enter your email.";return;}
  try { await sendPasswordResetEmail(auth,email); $("forgotError").textContent="If that account exists, a reset email has been sent."; }
  catch(error){ $("forgotError").textContent=friendlyAuthError(error); }
});

async function signOutUser() {
  try{
    await signOut(auth);
    if ($("moreDialog").open) $("moreDialog").close();
  }catch(error){
    toast("Could not sign out: "+error.message);
  }
}

async function deleteCommunityNoteChildren(noteId) {
  for (const name of ["comments","likes","votes"]) {
    const snapshot = await getDocs(collection(db, "publicNotes", noteId, name));
    await deleteRefsInBatches(snapshot.docs.map(item => item.ref));
  }
}

function navigate() {
  const requestedRoute = location.hash.replace("#","") || "home";
  const route = requestedRoute === "discovered-me" ? "profile" : requestedRoute;
  if(requestedRoute!==route)history.replaceState(null,"","#profile");
  document.body.classList.toggle("profile-view",route==="profile");
  document.querySelectorAll("[data-route]").forEach(link => link.classList.toggle("active",link.dataset.route===route));
  const renderer = renderers[route] || renderHome;
  renderer();
  $("mainContent").focus({preventScroll:true});
  window.scrollTo({top:0,behavior:"smooth"});
}
window.addEventListener("hashchange",navigate);

function pageHeading(eyebrow,title,description) {
  return `<header class="section-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>${description?`<p>${description}</p>`:""}</header>`;
}

function renderHome() {
  const date = new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(new Date());
  const [affirmation,category] = affirmations[dailyIndex(affirmations)];
  const reflection = reflections[dailyIndex(reflections)];
  const discovery = discoveries[dailyIndex(discoveries)];
  const name = state.profile.displayName || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Friend";
  const openIntentions = state.intentions.filter(item=>!item.completed);
  routeContent.innerHTML = `
    <div class="date-line">${escapeHtml(date)}</div>
    ${pageHeading("Daily companion",`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${escapeHtml(name.split(" ")[0])}.`,"")}
    <section class="hero-grid">
      <article class="affirmation-card">
        <div><p class="eyebrow">${category} · Today</p><blockquote>“${escapeHtml(affirmation)}”</blockquote></div>
        <div class="card-actions"><button data-action="save-affirmation">♡ Save</button><button data-action="copy-affirmation">Copy</button><button data-action="share-affirmation">Share</button></div>
      </article>
      <article class="panel intentions-panel"><h2>Today’s intentions</h2><div id="intentionsList"></div>
        <div class="quick-capture"><input id="intentionInput" type="text" placeholder="Add an intention" maxlength="120" /><button id="addIntentionBtn" class="secondary-button">Add</button></div>
      </article>
    </section>
    <section class="dashboard-grid">
      <article class="panel tile"><p class="eyebrow">Daily reflection</p><h3>${escapeHtml(reflection)}</h3><textarea id="reflectionInput" placeholder="A private response...">${escapeHtml(state.profile["reflection_"+localDateKey()]||"")}</textarea></article>
      <article class="panel tile"><p class="eyebrow">Today’s discovery</p><h3>${discovery.title}</h3><p>${discovery.text}</p><a class="tile-link" href="${discovery.sourceUrl}" target="_blank" rel="noopener">Source: ${discovery.source} ↗</a></article>
      <article class="panel tile"><p class="eyebrow">Quick capture</p><div class="quick-capture"><textarea id="quickCaptureInput" placeholder="Save an idea before it drifts away"></textarea><button id="quickCaptureBtn" class="primary-button">Save</button></div></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel tile"><p class="eyebrow">Your week</p><h3>${openIntentions.length} open intention${openIntentions.length===1?"":"s"}</h3><p>${state.entries.length} journal entries · ${state.goals.filter(g=>g.completed).length} goals completed</p></article>
      <article class="panel tile"><p class="eyebrow">Recently saved</p><h3>${state.archive.length?escapeHtml(state.archive[0].title||"Saved item"): "A fresh archive"}</h3><button class="tile-link" data-route-action="archive">Open My Archive →</button></article>
      <article class="panel tile"><p class="eyebrow">Continue</p><h3>${state.drafts.length?"Return to a draft":"Start creating"}</h3><button class="tile-link" data-route-action="create">Open Create →</button></article>
    </section>
    <section class="panel community-feed" aria-labelledby="communityNotesTitle">
      <p class="eyebrow">A shared space</p><h2 id="communityNotesTitle">Public notes</h2>
      <p>Share a note or a poll with the signed-in MAWAESU community. Do not include private or sensitive information.</p>
      <form id="communityNoteForm" class="community-composer">
        <label for="communityNoteTitle">Title <span class="field-note">(optional)</span></label>
        <input id="communityNoteTitle" type="text" maxlength="120" placeholder="Give your note a title">
        <label for="communityNoteBody">Your note</label>
        <textarea id="communityNoteBody" maxlength="1000" placeholder="Share a thought, question, or discovery..."></textarea>
        <details id="communityPollDetails" class="poll-composer">
          <summary>Add a poll</summary>
          <label for="communityPollQuestion">Poll question</label>
          <input id="communityPollQuestion" type="text" maxlength="180" placeholder="What would you like to ask?">
          <div id="communityPollOptions" class="poll-option-inputs">
            <label>Choice 1<input type="text" maxlength="100" data-poll-option placeholder="First choice"></label>
            <label>Choice 2<input type="text" maxlength="100" data-poll-option placeholder="Second choice"></label>
          </div>
          <button id="addPollOptionBtn" class="text-button" type="button">Add another choice</button>
        </details>
        <p id="communityNoteError" class="form-error" role="alert"></p>
        <div class="community-composer-actions"><span class="field-note">Public to signed-in MAWAESU members</span><button id="publishCommunityNoteBtn" class="primary-button" type="submit">Publish note</button></div>
      </form>
      <div id="communityNotesStatus" class="field-note" role="status" aria-live="polite"></div>
      <div id="communityNotesList" class="community-notes-list"></div>
      <button id="loadMoreCommunityNotesBtn" class="secondary-button" type="button" hidden>Load older notes</button>
    </section>`;
  renderIntentions();
  bindHomeActions(affirmation,category);
  bindCommunityNoteComposer();
  communityNotes = [];
  communityNotesCursor = null;
  communityNotesHaveMore = true;
  loadCommunityNotes(true);
}
function renderIntentions() {
  const list=$("intentionsList"); if(!list)return;
  list.innerHTML = state.intentions.length ? state.intentions.map(item=>`
    <div class="intention ${item.completed?"complete":""}"><input type="checkbox" data-intention-check="${item.id}" ${item.completed?"checked":""}><label>${escapeHtml(item.text)}</label><button data-intention-delete="${item.id}" aria-label="Remove intention">×</button></div>`).join("") : `<p class="field-note">No intentions yet.</p>`;
  list.querySelectorAll("[data-intention-check]").forEach(box=>box.addEventListener("change",async()=>{
    const item=state.intentions.find(i=>i.id===box.dataset.intentionCheck); item.completed=box.checked;
    await saveDocument("intentions",item.id,item); renderIntentions();
  }));
  list.querySelectorAll("[data-intention-delete]").forEach(button=>button.addEventListener("click",async()=>{await deleteDocument("intentions",button.dataset.intentionDelete);state.intentions=state.intentions.filter(i=>i.id!==button.dataset.intentionDelete);renderIntentions();}));
}
function bindHomeActions(affirmation,category) {
  $("addIntentionBtn")?.addEventListener("click",async()=>{const input=$("intentionInput");if(!input.value.trim())return;const item={id:crypto.randomUUID(),text:input.value.trim(),completed:false,date:localDateKey()};await saveDocument("intentions",item.id,item);state.intentions.push(item);input.value="";renderIntentions();});
  $("quickCaptureBtn")?.addEventListener("click",async()=>{const input=$("quickCaptureInput");if(!input.value.trim())return;const item={id:crypto.randomUUID(),text:input.value.trim(),createdAt:Date.now(),moved:false};await saveDocument("captures",item.id,item);state.captured.push(item);input.value="";toast("Idea captured");});
  $("reflectionInput")?.addEventListener("change",async()=>{const key="reflection_"+localDateKey();state.profile[key]=$("reflectionInput").value;await saveDocument("profile","main",{[key]:$("reflectionInput").value});toast("Private reflection saved");});
  document.querySelector("[data-action='save-affirmation']")?.addEventListener("click",async()=>{const item={id:crypto.randomUUID(),text:affirmation,category,date:localDateKey(),savedAt:Date.now()};await saveDocument("archive",item.id,item);state.archive.unshift(item);toast("Affirmation saved");});
  document.querySelector("[data-action='copy-affirmation']")?.addEventListener("click",async()=>{await navigator.clipboard.writeText(affirmation);toast("Affirmation copied");});
  document.querySelector("[data-action='share-affirmation']")?.addEventListener("click",async()=>{if(navigator.share){await navigator.share({title:"MAWAESU affirmation",text:affirmation});}else{await navigator.clipboard.writeText(affirmation);toast("Sharing is unavailable; affirmation copied");}});
  document.querySelectorAll("[data-route-action]").forEach(button=>button.addEventListener("click",()=>location.hash=button.dataset.routeAction));
}

function bindCommunityNoteComposer() {
  $("communityNoteForm").addEventListener("submit", publishCommunityNote);
  $("addPollOptionBtn").addEventListener("click", () => {
    const options = $("communityPollOptions");
    const count = options.querySelectorAll("[data-poll-option]").length;
    if (count >= 4) return;
    const label = document.createElement("label");
    label.textContent = `Choice ${count + 1}`;
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 100;
    input.placeholder = `Choice ${count + 1}`;
    input.dataset.pollOption = "";
    label.appendChild(input);
    options.appendChild(label);
    if (count + 1 === 4) $("addPollOptionBtn").hidden = true;
  });
  $("loadMoreCommunityNotesBtn").addEventListener("click", () => loadCommunityNotes(false));
}

async function publishCommunityNote(event) {
  event.preventDefault();
  const error = $("communityNoteError");
  const title = $("communityNoteTitle").value.trim();
  const body = $("communityNoteBody").value.trim();
  const pollOpen = $("communityPollDetails").open;
  const question = $("communityPollQuestion").value.trim();
  const options = [...document.querySelectorAll("[data-poll-option]")].map(input => input.value.trim()).filter(Boolean);
  error.textContent = "";
  if (!title && !body && !pollOpen) {
    error.textContent = "Add a title, write a note, or include a poll before publishing.";
    return;
  }
  if (pollOpen && (!question || options.length < 2 || options.length > 4)) {
    error.textContent = "A poll needs a question and at least two choices.";
    return;
  }
  if (new Set(options.map(option => option.toLocaleLowerCase())).size !== options.length) {
    error.textContent = "Poll choices must be different.";
    return;
  }
  const button = $("publishCommunityNoteBtn");
  button.disabled = true;
  try {
    const noteRef = doc(collection(db, "publicNotes"));
    const displayName = state.profile.displayName || currentUser.displayName || currentUser.email?.split("@")[0] || "MAWAESU member";
    const note = {
      authorId: currentUser.uid,
      displayName,
      username: state.profile.publicHandle || "",
      title,
      body,
      kind: pollOpen ? "poll" : "note",
      createdAt: serverTimestamp()
    };
    if (pollOpen) note.poll = { question, options };
    await setDoc(noteRef, note);
    $("communityNoteForm").reset();
    $("communityPollDetails").open = false;
    document.querySelectorAll("[data-poll-option]").forEach((input,index) => {
      if (index > 1) input.closest("label").remove();
    });
    $("addPollOptionBtn").hidden = false;
    communityNotes = [];
    communityNotesCursor = null;
    communityNotesHaveMore = true;
    await loadCommunityNotes(true);
    toast("Note published");
  } catch (error) {
    $("communityNoteError").textContent = "Could not publish your note: " + error.message;
  } finally {
    button.disabled = false;
  }
}

function archivedCommunityNoteId(item) {
  return item.sourceNoteId || item.noteId || item.postId || (item.kind==="community-note" ? item.id : "");
}

async function decorateCommunityNote(snapshot) {
  const data = snapshot.data();
  const authorId = data.authorId || data.authorUid || "";
  let publicProfile = {};
  if (authorId === currentUser.uid) {
    publicProfile = {
      displayName:state.profile.displayName || currentUser.displayName || currentUser.email?.split("@")[0],
      handle:state.profile.publicHandle || ""
    };
  } else if (authorId && (!data.displayName || !data.username)) {
    const profileSnapshot = await getDoc(doc(db,"publicProfiles",authorId));
    if (profileSnapshot.exists()) publicProfile = profileSnapshot.data();
  }
  const displayName = data.displayName || publicProfile.displayName || "MAWAESU member";
  const note = {
    ...data,
    id:snapshot.id,
    authorId,
    displayName,
    username:data.username || publicProfile.handle || "",
    title:typeof data.title === "string" ? data.title : "",
    body:typeof data.body === "string" ? data.body : typeof data.text === "string" ? data.text : "",
    kind:data.kind || (data.poll ? "poll" : "note"),
    commentsExpanded:false,
    comments:[]
  };
  const likesRef = collection(db, "publicNotes", note.id, "likes");
  const commentsRef = collection(db, "publicNotes", note.id, "comments");
  const markerRef = pathFor("likedNotes", note.id);
  const legacyLikeRef = doc(db, "publicNotes", note.id, "likes", currentUser.uid);
  const [likes, comments, ownLike, legacyLike] = await Promise.all([
    getCountFromServer(likesRef),
    getCountFromServer(commentsRef),
    getDoc(markerRef),
    getDoc(legacyLikeRef)
  ]);
  note.likeCount = likes.data().count;
  note.commentCount = comments.data().count;
  note.liked = ownLike.exists() || legacyLike.exists();
  note.saved = state.archive.some(item => archivedCommunityNoteId(item) === note.id);
  if (note.kind === "poll" && Array.isArray(note.poll?.options)) {
    const votesRef = collection(db, "publicNotes", note.id, "votes");
    const ownVote = await getDoc(pathFor("pollVotes", note.id));
    const counts = await Promise.all(note.poll.options.map((_,index) =>
      getCountFromServer(query(votesRef, where("optionIndex", "==", index)))
    ));
    note.voteCounts = counts.map(result => result.data().count);
    note.totalVotes = note.voteCounts.reduce((sum,value) => sum + value, 0);
    note.votedOption = ownVote.exists() ? ownVote.data().optionIndex : null;
  }
  return note;
}

async function loadCommunityNotes(reset) {
  const list = $("communityNotesList");
  if (!list) return;
  const status = $("communityNotesStatus");
  const moreButton = $("loadMoreCommunityNotesBtn");
  if (reset) {
    communityNotes = [];
    communityNotesCursor = null;
    communityNotesHaveMore = true;
    list.innerHTML = "";
    status.textContent = "Loading public notes…";
  }
  if (!communityNotesHaveMore) return;
  moreButton.disabled = true;
  try {
    const constraints = [orderBy("createdAt", "desc")];
    if (communityNotesCursor) constraints.push(startAfter(communityNotesCursor));
    constraints.push(limit(communityNotesPageSize));
    const snapshot = await getDocs(query(collection(db, "publicNotes"), ...constraints));
    const notes = await Promise.all(snapshot.docs.map(decorateCommunityNote));
    communityNotes = [...communityNotes, ...notes];
    communityNotesCursor = snapshot.docs[snapshot.docs.length - 1] || communityNotesCursor;
    communityNotesHaveMore = snapshot.docs.length === communityNotesPageSize;
    status.textContent = communityNotes.length ? "" : "No public notes yet. You can start the conversation with a note or poll.";
    renderCommunityNotes();
  } catch (error) {
    status.innerHTML = `<span class="form-error">Could not load public notes: ${escapeHtml(error.message)}. Confirm that the updated Firestore rules have been deployed.</span>`;
    list.innerHTML = "";
  } finally {
    moreButton.hidden = !communityNotesHaveMore || !communityNotes.length;
    moreButton.disabled = false;
  }
}

function communityNoteDate(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp ? new Date(timestamp) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(date)
    : "Just now";
}

function renderCommunityNotes() {
  const list = $("communityNotesList") || $("profileCommunityNotesList");
  if (!list) return;
  list.innerHTML = communityNotes.map(note => {
    const identity = note.username ? `@${escapeHtml(note.username)}` : escapeHtml(note.displayName || "MAWAESU member");
    const initial = escapeHtml((note.displayName || "M").trim()[0]?.toUpperCase() || "M");
    const poll = note.kind === "poll" && note.poll?.options?.length ? `
      <section class="community-poll" aria-label="Poll">
        <h3>${escapeHtml(note.poll.question)}</h3>
        <div class="community-poll-options">${note.poll.options.map((option,index) => {
          const count = note.voteCounts?.[index] || 0;
          const total = note.totalVotes || 0;
          const percent = total ? Math.round(count / total * 100) : 0;
          return note.votedOption === null || note.votedOption === undefined
            ? `<button class="poll-choice" type="button" data-community-vote="${note.id}" data-option-index="${index}">${escapeHtml(option)}</button>`
            : `<div class="poll-result ${note.votedOption === index ? "selected" : ""}"><span>${escapeHtml(option)}</span><strong>${percent}%</strong><span class="poll-result-bar"><i style="width:${percent}%"></i></span><small>${count} vote${count===1?"":"s"}</small></div>`;
        }).join("")}</div>
        ${note.votedOption === null || note.votedOption === undefined ? `<p class="field-note">Choose one option to vote. Your selection is not shown with your profile.</p>` : `<p class="field-note">Poll results · ${note.totalVotes} vote${note.totalVotes===1?"":"s"}</p>`}
      </section>` : "";
    const comments = note.commentsExpanded ? `
      <section class="community-comments" aria-label="Comments">
        ${note.commentsLoading ? `<p class="field-note">Loading comments…</p>` : note.commentsError ? `<p class="form-error">${escapeHtml(note.commentsError)}</p>` : note.comments.length ? note.comments.map(comment => `<article class="community-comment"><strong>${escapeHtml(comment.username ? `@${comment.username}` : comment.displayName || "MAWAESU member")}</strong><p>${escapeHtml(comment.text)}</p><time>${communityNoteDate(comment.createdAt)}</time></article>`).join("") : `<p class="field-note">No comments yet.</p>`}
        <form class="community-comment-form" data-community-comment-form="${note.id}">
          <label class="sr-only" for="comment-${note.id}">Write a comment</label>
          <input id="comment-${note.id}" name="comment" type="text" maxlength="500" placeholder="Write a comment…" required>
          <button class="secondary-button" type="submit">Comment</button>
        </form>
      </section>` : "";
    return `<article class="community-note-card" data-community-note="${note.id}">
      <header class="community-note-header"><span class="community-note-avatar" aria-hidden="true">${initial}</span><div><strong>${escapeHtml(note.displayName || "MAWAESU member")}</strong><p>${identity}</p></div><time>${communityNoteDate(note.createdAt)}</time></header>
      ${note.title ? `<h3 class="community-note-title">${escapeHtml(note.title)}</h3>` : ""}
      ${note.body ? `<p class="community-note-body">${escapeHtml(note.body)}</p>` : ""}
      ${poll}
      <div class="community-note-actions">
        <button type="button" class="${note.liked?"selected":""}" data-community-like="${note.id}" aria-pressed="${note.liked}">${note.liked?"Liked":"Like"} · ${note.likeCount}</button>
        <button type="button" class="${note.saved?"selected":""}" data-community-save="${note.id}" aria-pressed="${note.saved}">${note.saved?"Saved":"Save"}</button>
        <button type="button" data-community-comments="${note.id}" aria-expanded="${note.commentsExpanded}">Comments (${note.commentCount})</button>
        ${$("profileCommunityNotesList") && note.authorId === currentUser.uid ? `<button type="button" class="profile-feature-button ${state.profile.featuredNoteIds?.includes(note.id)?"selected":""}" data-profile-feature="${note.id}">${state.profile.featuredNoteIds?.includes(note.id)?"Featured":"Feature"}</button>` : ""}
        ${note.authorId === currentUser.uid ? `<button type="button" class="community-delete-button" data-community-delete="${note.id}">Delete</button>` : ""}
      </div>
      ${comments}
    </article>`;
  }).join("");

  document.querySelectorAll("[data-community-like]").forEach(button => button.addEventListener("click", () => toggleCommunityLike(button.dataset.communityLike)));
  document.querySelectorAll("[data-community-save]").forEach(button => button.addEventListener("click", () => toggleCommunitySave(button.dataset.communitySave)));
  document.querySelectorAll("[data-community-vote]").forEach(button => button.addEventListener("click", () => voteInCommunityPoll(button.dataset.communityVote, Number(button.dataset.optionIndex))));
  document.querySelectorAll("[data-community-comments]").forEach(button => button.addEventListener("click", () => toggleCommunityComments(button.dataset.communityComments)));
  document.querySelectorAll("[data-community-comment-form]").forEach(form => form.addEventListener("submit", submitCommunityComment));
  document.querySelectorAll("[data-profile-feature]").forEach(button => button.addEventListener("click", () => toggleProfileFeatured(button.dataset.profileFeature)));
  document.querySelectorAll("[data-community-delete]").forEach(button => button.addEventListener("click", () => deleteCommunityNote(button.dataset.communityDelete)));
}

async function loadProfileCommunityNotes() {
  const status = $("profileCommunityNotesStatus");
  const list = $("profileCommunityNotesList");
  if (!status || !list) return;
  status.textContent = "Loading public notes…";
  list.replaceChildren();
  try {
    const [currentNotes,legacyNotes] = await Promise.all([
      getDocs(query(collection(db,"publicNotes"),where("authorId","==",currentUser.uid),limit(12))),
      getDocs(query(collection(db,"publicNotes"),where("authorUid","==",currentUser.uid),limit(12)))
    ]);
    const snapshots = new Map([...currentNotes.docs,...legacyNotes.docs].map(item=>[item.id,item]));
    const ordered = [...snapshots.values()].sort((first,second)=>{
      const firstValue=first.data().createdAt;
      const secondValue=second.data().createdAt;
      const firstDate=firstValue?.toDate ? firstValue.toDate().getTime() : new Date(firstValue||0).getTime();
      const secondDate=secondValue?.toDate ? secondValue.toDate().getTime() : new Date(secondValue||0).getTime();
      return secondDate-firstDate;
    });
    profileOwnNotes = await Promise.all(ordered.map(decorateCommunityNote));
    const savedIds=[...new Set(state.archive.map(archivedCommunityNoteId).filter(Boolean))];
    const savedSnapshots=await Promise.all(savedIds.map(noteId=>getDoc(doc(db,"publicNotes",noteId))));
    profileSavedNotes=await Promise.all(savedSnapshots.filter(snapshot=>snapshot.exists()).map(decorateCommunityNote));
    renderProfileWritingTab(profileWritingTab);
  } catch (error) {
    status.textContent = "Could not load your public notes: " + error.message;
  }
}

function renderProfileWritingTab(tab) {
  profileWritingTab=tab;
  document.querySelectorAll("[data-profile-writing-tab]").forEach(button=>{
    const selected=button.dataset.profileWritingTab===tab;
    button.classList.toggle("active",selected);
    button.setAttribute("aria-selected",String(selected));
  });
  const status=$("profileCommunityNotesStatus");
  if(tab==="My Notes")communityNotes=profileOwnNotes;
  else if(tab==="Featured")communityNotes=profileOwnNotes.filter(note=>state.profile.featuredNoteIds?.includes(note.id));
  else communityNotes=profileSavedNotes;
  if(status)status.textContent=tab==="Saved"
    ?"Only you can see the notes you save."
    :communityNotes.length?""
    :tab==="Featured"?"No featured notes yet. Feature one of your notes to keep it here."
    :"You haven’t shared a public note yet.";
  renderCommunityNotes();
}

async function toggleProfileFeatured(noteId) {
  const featured=new Set(state.profile.featuredNoteIds||[]);
  if(featured.has(noteId))featured.delete(noteId);else featured.add(noteId);
  const featuredNoteIds=[...featured];
  try{
    await saveDocument("profile","main",{featuredNoteIds});
    state.profile={...state.profile,featuredNoteIds};
    renderProfileWritingTab(profileWritingTab);
  }catch(error){
    toast("Could not update featured notes: "+error.message);
  }
}

async function refreshCommunityNote(noteId) {
  const snapshot = await getDoc(doc(db, "publicNotes", noteId));
  if (!snapshot.exists()) {
    communityNotes = communityNotes.filter(note => note.id !== noteId);
  } else {
    const updated = await decorateCommunityNote(snapshot);
    const index = communityNotes.findIndex(note => note.id === noteId);
    if (index >= 0) communityNotes[index] = { ...communityNotes[index], ...updated };
  }
  renderCommunityNotes();
}

async function toggleCommunityLike(noteId) {
  const markerRef = pathFor("likedNotes", noteId);
  const legacyLikeRef = doc(db, "publicNotes", noteId, "likes", currentUser.uid);
  try {
    await runTransaction(db, async transaction => {
      const [marker, legacyLike] = await Promise.all([
        transaction.get(markerRef),
        transaction.get(legacyLikeRef)
      ]);
      if (marker.exists()) {
        const likeRef = doc(db, "publicNotes", noteId, "likes", marker.data().likeId);
        transaction.delete(likeRef);
        transaction.delete(markerRef);
        if (legacyLike.exists()) transaction.delete(legacyLikeRef);
      } else if (legacyLike.exists()) {
        transaction.delete(legacyLikeRef);
      } else {
        const likeId = crypto.randomUUID();
        transaction.set(doc(db, "publicNotes", noteId, "likes", likeId), { createdAt:serverTimestamp() });
        transaction.set(markerRef, { likeId, createdAt:serverTimestamp() });
      }
    });
    await refreshCommunityNote(noteId);
  } catch (error) {
    toast("Could not update your like: " + error.message);
  }
}

async function toggleCommunitySave(noteId) {
  const note = communityNotes.find(item => item.id === noteId);
  if (!note) return;
  const archiveId = `community-note-${note.id}`;
  try {
    if (note.saved) {
      await deleteDocument("archive", archiveId);
      state.archive = state.archive.filter(item => item.id !== archiveId);
    } else {
      const saved = { id:archiveId, kind:"community-note", sourceNoteId:note.id, title:note.title || `Note by ${note.displayName || "MAWAESU member"}`, body:note.body, poll:note.poll || null, savedAt:Date.now() };
      await saveDocument("archive", archiveId, saved);
      state.archive.unshift(saved);
    }
    note.saved = !note.saved;
    renderCommunityNotes();
  } catch (error) {
    toast("Could not update your saved notes: " + error.message);
  }
}

async function voteInCommunityPoll(noteId, optionIndex) {
  const note = communityNotes.find(item => item.id === noteId);
  if (!note || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= note.poll.options.length) return;
  const markerRef = pathFor("pollVotes", noteId);
  try {
    await runTransaction(db, async transaction => {
      const marker = await transaction.get(markerRef);
      if (marker.exists()) {
        const voteRef = doc(db, "publicNotes", noteId, "votes", marker.data().voteId);
        const vote = await transaction.get(voteRef);
        if (!vote.exists()) throw new Error("Your saved vote could not be found.");
        transaction.update(voteRef, { optionIndex, updatedAt:serverTimestamp() });
        transaction.update(markerRef, { optionIndex, updatedAt:serverTimestamp() });
      } else {
        const voteId = crypto.randomUUID();
        transaction.set(doc(db, "publicNotes", noteId, "votes", voteId), { optionIndex, createdAt:serverTimestamp() });
        transaction.set(markerRef, { voteId, optionIndex, createdAt:serverTimestamp() });
      }
    });
    await refreshCommunityNote(noteId);
  } catch (error) {
    toast("Could not save your vote: " + error.message);
  }
}

async function toggleCommunityComments(noteId) {
  const note = communityNotes.find(item => item.id === noteId);
  if (!note) return;
  note.commentsExpanded = !note.commentsExpanded;
  renderCommunityNotes();
  if (note.commentsExpanded && !note.commentsLoaded) await loadCommunityNoteComments(note);
}

async function loadCommunityNoteComments(note) {
  note.commentsLoading = true;
  note.commentsError = "";
  renderCommunityNotes();
  try {
    const snapshot = await getDocs(query(collection(db, "publicNotes", note.id, "comments"), orderBy("createdAt", "asc"), limit(50)));
    note.comments = await Promise.all(snapshot.docs.map(async item => {
      const data = item.data();
      const authorId = data.authorId || data.authorUid || data.userId || "";
      let profile = {};
      if (authorId === currentUser.uid) {
        profile = { displayName:state.profile.displayName || currentUser.displayName, handle:state.profile.publicHandle || "" };
      } else if (authorId && !data.displayName) {
        const profileSnapshot = await getDoc(doc(db,"publicProfiles",authorId));
        if (profileSnapshot.exists()) profile = profileSnapshot.data();
      }
      return {
        id:item.id,
        ...data,
        displayName:data.displayName || profile.displayName || "MAWAESU member",
        username:data.username || profile.handle || "",
        text:data.text || data.comment || data.body || ""
      };
    }));
    note.commentsLoaded = true;
  } catch (error) {
    note.commentsError = "Could not load comments: " + error.message;
  } finally {
    note.commentsLoading = false;
    renderCommunityNotes();
  }
}

async function submitCommunityComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const noteId = form.dataset.communityCommentForm;
  const input = form.elements.comment;
  const text = input.value.trim();
  if (!text || text.length > 500) return;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const commentRef = doc(collection(db, "publicNotes", noteId, "comments"));
    await setDoc(commentRef, {
      authorId:currentUser.uid,
      displayName:state.profile.displayName || currentUser.displayName || currentUser.email?.split("@")[0] || "MAWAESU member",
      username:state.profile.publicHandle || "",
      text,
      createdAt:serverTimestamp()
    });
    const note = communityNotes.find(item => item.id === noteId);
    if (note) {
      note.commentCount += 1;
      note.commentsLoaded = false;
      await loadCommunityNoteComments(note);
    }
  } catch (error) {
    toast("Could not add your comment: " + error.message);
  } finally {
    button.disabled = false;
  }
}

async function deleteCommunityNote(noteId) {
  const note = communityNotes.find(item => item.id === noteId);
  if (!note || note.authorId !== currentUser.uid || !confirm("Delete this public note and its comments?")) return;
  try {
    await deleteCommunityNoteChildren(noteId);
    await deleteDoc(doc(db, "publicNotes", noteId));
    const archiveId = `community-note-${noteId}`;
    if (state.archive.some(item => item.id === archiveId)) await deleteDocument("archive", archiveId);
    state.archive = state.archive.filter(item => item.id !== archiveId);
    communityNotes = communityNotes.filter(item => item.id !== noteId);
    renderCommunityNotes();
    toast("Note deleted");
  } catch (error) {
    toast("Could not delete the note: " + error.message);
  }
}

async function deleteRefsInBatches(refs) {
  for (let index = 0; index < refs.length; index += 400) {
    const batch = writeBatch(db);
    refs.slice(index, index + 400).forEach(reference => batch.delete(reference));
    await batch.commit();
  }
}

function renderDiscover() {
  routeContent.innerHTML = `${pageHeading("Understand yourself","Discover","Explore patterns, preferences, and possibilities without treating a result as a fixed identity.")}
    <section class="feature-grid">
      <a class="feature-card primary" href="#profile"><p class="eyebrow">Your saved results</p><h2>My Profile</h2><p>Return to your archetype, colour palette, room analysis, and profile details.</p></a>
      <a class="feature-card primary" href="#assessment"><p class="eyebrow">45-question reflection</p><h2>Personality assessment</h2><p>Use the existing MAWAESU interpretive framework. Results describe tendencies, not diagnoses or permanent identities.</p></a>
      <article class="feature-card"><p class="eyebrow">Emotional literacy</p><h2>Name what is present</h2><p>Identify emotions, needs, boundaries, and supportive next steps with reflective prompts.</p></article>
      <article class="feature-card"><p class="eyebrow">Color</p><h2>Explore palettes</h2><p>See subjective and design-oriented combinations. Color preferences are personal; color does not guarantee an emotional response.</p></article>
    </section>
    <section class="grid-two" style="margin-top:18px">
      <article class="panel"><h2>Interest Map</h2><p>Choose and connect your interests.</p><div id="interestMap" class="tag-list"></div></article>
      <article class="panel"><h2>How to read a result</h2><p>MAWAESU’s assessment is an original interpretive activity, not a clinical psychological test. Revisit it after experiences change; do not use it to label yourself or others.</p></article>
    </section>`;
  const interests=["Psychology","Architecture","Literature","History","Philosophy","Science","Art","Sociology"];
  $("interestMap").innerHTML=interests.map(x=>`<button data-interest="${x}" class="${(state.profile.interests||[]).includes(x)? "selected":""}">${x}</button>`).join("");
  $("interestMap").querySelectorAll("[data-interest]").forEach(button=>button.addEventListener("click",async()=>{
    const interests=state.profile.interests||[];const name=button.dataset.interest;
    state.profile.interests=interests.includes(name)?interests.filter(x=>x!==name):[...interests,name];
    button.classList.toggle("selected");await saveDocument("profile","main",{interests:state.profile.interests});
  }));
}

const socialAffirmations = affirmations.map(([text, category], index) => ({
  id: `affirmation-${index + 1}`,
  text,
  category
}));
function todayAffirmation() {
  return socialAffirmations[dailyIndex(socialAffirmations)];
}
const socialCollections = {
  requests: collection(db, "connectionRequests"),
  connections: collection(db, "connections"),
  shares: collection(db, "affirmationShares"),
  publications: collection(db, "publicAffirmations")
};
function publicProfile(handleSnapshot) {
  const data = handleSnapshot.data();
  return {
    uid: data.uid,
    handle: data.username,
    displayName: data.displayName,
    bio: data.bio || ""
  };
}
function socialProfile(profile) {
  return { uid: profile.uid, handle: profile.handle, displayName: profile.displayName, bio: profile.bio || "" };
}
async function renderConnections() {
  routeContent.innerHTML = `${pageHeading("A thoughtful social space","Connections","Find someone by their exact username, accept connections by choice, and share curated affirmations. MAWAESU has no private messaging.")}`
    + `<section class="panel connection-search"><h2>Find a person</h2><p>Search by exact handle. Their email, journal, assessment, and private information are never shown.</p><form id="connectionSearchForm" class="toolbar"><input id="connectionHandleInput" type="text" maxlength="20" placeholder="Their username" aria-label="Username to find" autocomplete="off"><button class="primary-button" type="submit">Find</button></form><div id="connectionSearchResult" aria-live="polite"></div></section>`
    + `<section class="panel connection-search"><h2>Your public profile</h2><p>Only your display name and optional bio are shared when someone looks up your exact handle. You can edit these in Profile &amp; settings.</p><p id="myPublicHandle" class="field-note"></p></section>`
    + `<section class="social-grid"><article class="panel"><h2>Connection requests</h2><div id="connectionRequestsList"></div></article><article class="panel"><h2>Your connections</h2><div id="connectionsList"></div></article></section>`
    + `<section class="panel social-sharing"><p class="eyebrow">Affirmation sharing</p><h2>Share today's affirmation</h2><p>Only this curated daily affirmation can be sent to a connection. There is no custom-message field.</p><blockquote id="dailySocialAffirmation" class="inbox-affirmation"></blockquote><div id="affirmationInbox"></div></section>`
    + `<section class="panel"><p class="eyebrow">Publish</p><h2>Community affirmations</h2><p>Publish today's curated affirmation to the MAWAESU community. No personal text is included; your latest publication replaces your previous one.</p><button id="publishAffirmationBtn" class="primary-button">Publish today's affirmation</button><div id="communityAffirmations" class="community-list"></div></section>`;

  const dailyAffirmation = todayAffirmation();
  $("dailySocialAffirmation").textContent = `“${dailyAffirmation.text}”`;
  const handle = state.profile.publicHandle || "";
  $("myPublicHandle").textContent = handle ? `Your handle: @${handle}` : "Set a username in Profile & settings before people can find you.";
  $("connectionSearchForm").addEventListener("submit", findConnectionProfile);
  $("publishAffirmationBtn").addEventListener("click", publishAffirmation);
  try {
    await refreshConnections();
  } catch (error) {
    const message = `Could not load connections: ${escapeHtml(error.message)}. Confirm that the updated Firestore rules have been deployed.`;
    $("connectionRequestsList").innerHTML = `<p class="form-error" role="alert">${message}</p>`;
    $("connectionsList").innerHTML = `<p class="form-error" role="alert">${message}</p>`;
    $("affirmationInbox").innerHTML = "";
    $("communityAffirmations").innerHTML = "";
  }
}

async function refreshConnections() {
  const uid = currentUser.uid;
  const [requestSnapshot, connectionSnapshot, shareSnapshot, publicationSnapshot] = await Promise.all([
    getDocs(query(socialCollections.requests, where("participantIds", "array-contains", uid))),
    getDocs(query(socialCollections.connections, where("memberIds", "array-contains", uid))),
    getDocs(query(socialCollections.shares, where("participantIds", "array-contains", uid))),
    getDocs(query(socialCollections.publications, orderBy("updatedAt", "desc"), limit(24)))
  ]);
  const requests = requestSnapshot.docs.map(item=>({id:item.id,...item.data()}));
  const connections = connectionSnapshot.docs.map(item=>({id:item.id,...item.data()}));
  const shares = shareSnapshot.docs.map(item=>({id:item.id,...item.data()}));
  const publications = publicationSnapshot.docs.map(item=>({id:item.id,...item.data()}));
  renderConnectionRequests(requests);
  renderConnectionList(connections);
  renderAffirmationInbox(shares);
  renderCommunityAffirmations(publications);
}

async function findConnectionProfile(event) {
  event.preventDefault();
  const result = $("connectionSearchResult");
  const handle = $("connectionHandleInput").value.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(handle)) {
    result.innerHTML = `<p class="form-error">Enter a username of 3–20 letters, numbers, periods, underscores, or hyphens.</p>`;
    return;
  }
  if (!state.profile.publicHandle) {
    result.innerHTML = `<p class="form-error">Set your username in Profile &amp; settings before sending connection requests.</p>`;
    return;
  }
  if (handle === state.profile.publicHandle) {
    result.innerHTML = `<p class="form-error">That is your own username.</p>`;
    return;
  }
  try {
    const snapshot = await getDoc(doc(db, "usernames", handle));
    if (!snapshot.exists()) {
      result.innerHTML = `<p>No profile was found for @${escapeHtml(handle)}.</p>`;
      return;
    }
    const profile = publicProfile(snapshot);
    if (profile.uid === currentUser.uid) {
      result.innerHTML = `<p>That is your own username.</p>`;
      return;
    }
    const [connectionSnapshot, existingRequest, incomingRequest] = await Promise.all([
      getDocs(query(socialCollections.connections, where("memberIds", "array-contains", currentUser.uid))),
      getDoc(doc(db, "connectionRequests", `${currentUser.uid}_${profile.uid}`)),
      getDoc(doc(db, "connectionRequests", `${profile.uid}_${currentUser.uid}`))
    ]);
    const alreadyConnected = connectionSnapshot.docs.some(item=>item.data().memberIds.includes(profile.uid));
    const request = existingRequest.exists() ? existingRequest.data() : null;
    const incoming = incomingRequest.exists() ? incomingRequest.data() : null;
    result.innerHTML = `<article class="public-profile"><p class="eyebrow">Public profile</p><h3>${escapeHtml(profile.displayName)}</h3><p>@${escapeHtml(profile.handle)}</p>${profile.bio?`<p>${escapeHtml(profile.bio)}</p>`:""}${alreadyConnected?`<p class="field-note">You are already connected.</p>`:request?.state==="pending"?`<p class="field-note">Your request is pending.</p>`:request?.state==="accepted"?`<p class="field-note">This person is already connected.</p>`:request?.state==="declined"?`<p class="field-note">Your previous request was declined.</p>`:incoming?.state==="pending"?`<p class="field-note">This person has already sent you a request. Review it in Connection requests.</p>`:`<button id="sendConnectionRequestBtn" class="primary-button">Send connection request</button>`}</article>`;
    $("sendConnectionRequestBtn")?.addEventListener("click",()=>sendConnectionRequest(profile));
  } catch (error) {
    result.innerHTML = `<p class="form-error">Could not look up that profile: ${escapeHtml(error.message)}</p>`;
  }
}

async function sendConnectionRequest(profile) {
  const sender = {
    uid: currentUser.uid,
    handle: state.profile.publicHandle,
    displayName: state.profile.displayName || currentUser.displayName || "MAWAESU member",
    bio: state.profile.publicBio || ""
  };
  const recipient = socialProfile(profile);
  const requestId = `${sender.uid}_${recipient.uid}`;
  const request = {
    senderId: sender.uid,
    recipientId: recipient.uid,
    participantIds: [sender.uid, recipient.uid],
    senderProfile: sender,
    recipientProfile: recipient,
    state: "pending",
    createdAt: serverTimestamp()
  };
  try {
    await setDoc(doc(db, "connectionRequests", requestId), request);
    toast("Connection request sent");
    $("connectionSearchResult").innerHTML = `<p class="field-note">Your request to @${escapeHtml(recipient.handle)} was sent.</p>`;
    await refreshConnections();
  } catch (error) {
    toast("Could not send request: " + error.message);
  }
}

function renderConnectionRequests(requests) {
  const incoming = requests.filter(item=>item.recipientId===currentUser.uid && item.state==="pending");
  const outgoing = requests.filter(item=>item.senderId===currentUser.uid && item.state==="pending");
  $("connectionRequestsList").innerHTML = incoming.length || outgoing.length
    ? `${incoming.map(item=>`<article class="social-item"><h3>${escapeHtml(item.senderProfile.displayName)}</h3><p>@${escapeHtml(item.senderProfile.handle)}</p>${item.senderProfile.bio?`<p>${escapeHtml(item.senderProfile.bio)}</p>`:""}<div class="social-actions"><button class="primary-button" data-accept-request="${item.id}">Accept</button><button class="secondary-button" data-decline-request="${item.id}">Decline</button></div></article>`).join("")}${outgoing.map(item=>`<p class="field-note">Request sent to @${escapeHtml(item.recipientProfile.handle)} · awaiting response</p>`).join("")}`
    : `<p class="field-note">No connection requests yet.</p>`;
  document.querySelectorAll("[data-accept-request]").forEach(button=>button.addEventListener("click",()=>respondToConnectionRequest(button.dataset.acceptRequest,true)));
  document.querySelectorAll("[data-decline-request]").forEach(button=>button.addEventListener("click",()=>respondToConnectionRequest(button.dataset.declineRequest,false)));
}

async function respondToConnectionRequest(requestId, accept) {
  try {
    const reference = doc(db, "connectionRequests", requestId);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists() || snapshot.data().recipientId !== currentUser.uid || snapshot.data().state !== "pending") {
      throw new Error("This request is no longer available.");
    }
    const request = snapshot.data();
    const batch = writeBatch(db);
    batch.update(reference, {state:accept?"accepted":"declined", updatedAt:serverTimestamp()});
    if (accept) {
      const connectionId = requestId;
      batch.set(doc(db, "connections", connectionId), {
        requestId,
        memberIds: request.participantIds,
        memberProfiles: [request.senderProfile, request.recipientProfile],
        createdAt: serverTimestamp()
      });
    }
    await batch.commit();
    toast(accept?"Connection accepted":"Request declined");
    await refreshConnections();
  } catch (error) {
    toast("Could not update request: " + error.message);
  }
}

function renderConnectionList(connections) {
  $("connectionsList").innerHTML = connections.length
    ? connections.map(connection=>{
      const friend = connection.memberProfiles.find(profile=>profile.uid!==currentUser.uid);
      return `<article class="social-item"><h3>${escapeHtml(friend?.displayName||"MAWAESU member")}</h3><p>@${escapeHtml(friend?.handle||"")}</p>${friend?.bio?`<p>${escapeHtml(friend.bio)}</p>`:""}<div class="social-actions"><button class="secondary-button" data-send-affirmation="${escapeHtml(friend?.uid||"")}" data-connection-id="${connection.id}">Send today's affirmation</button><button class="text-button" data-remove-connection="${connection.id}" data-request-id="${connection.requestId}">Remove connection</button></div></article>`;
    }).join("")
    : `<p class="field-note">Accepted connections will appear here. You can share only curated affirmations with them.</p>`;
  document.querySelectorAll("[data-send-affirmation]").forEach(button=>button.addEventListener("click",()=>sendAffirmation(button.dataset.connectionId,button.dataset.sendAffirmation)));
  document.querySelectorAll("[data-remove-connection]").forEach(button=>button.addEventListener("click",()=>removeConnection(button.dataset.connectionId,button.dataset.requestId)));
}

async function removeConnection(connectionId, requestId) {
  if (!confirm("Remove this connection? You will no longer be able to send affirmations to each other; previously received affirmations remain in your inbox.")) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db,"connections",connectionId));
    batch.delete(doc(db,"connectionRequests",requestId));
    await batch.commit();
    toast("Connection removed");
    await refreshConnections();
  } catch(error) {
    toast("Could not remove connection: " + error.message);
  }
}

async function sendAffirmation(connectionId, recipientId) {
  const affirmation = todayAffirmation();
  const share = {
    senderId: currentUser.uid,
    recipientId,
    participantIds: [currentUser.uid, recipientId],
    connectionId,
    affirmationId: affirmation.id,
    sentOn: localDateKey(),
    createdAt: serverTimestamp()
  };
  try {
    const shareId = `${connectionId}_${currentUser.uid}_${recipientId}_${localDateKey()}`;
    await setDoc(doc(db, "affirmationShares", shareId), share);
    toast("Affirmation sent");
    await refreshConnections();
  } catch (error) {
    toast("Could not send affirmation: " + error.message);
  }
}

function renderAffirmationInbox(shares) {
  const received = shares.filter(item=>item.recipientId===currentUser.uid)
    .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,8);
  $("affirmationInbox").innerHTML = `<h3>Affirmations sent to you</h3>${received.length?received.map(item=>{
    const affirmation = socialAffirmations.find(value=>value.id===item.affirmationId);
    return affirmation?`<blockquote class="inbox-affirmation">“${escapeHtml(affirmation.text)}”<cite>From a connection · ${escapeHtml(item.sentOn||"")}</cite></blockquote>`:`<p class="field-note">An affirmation from a connection is unavailable.</p>`;
  }).join(""):`<p class="field-note">Affirmations from your connections will appear here.</p>`}`;
}

function renderCommunityAffirmations(publications) {
  $("communityAffirmations").innerHTML = publications.length
    ? publications.map(item=>{
      const affirmation = socialAffirmations.find(value=>value.id===item.affirmationId);
      return affirmation?`<article class="community-item"><p class="eyebrow">@${escapeHtml(item.username||"member")} · ${escapeHtml(item.displayName||"MAWAESU member")}</p><blockquote>“${escapeHtml(affirmation.text)}”</blockquote>${item.authorId===currentUser.uid?`<button class="text-button" data-delete-publication="${item.id}">Remove my publication</button>`:""}</article>`:"";
    }).join("")
    : `<p class="field-note">No affirmations have been published yet.</p>`;
  document.querySelectorAll("[data-delete-publication]").forEach(button=>button.addEventListener("click",async()=>{
    try { await deleteDoc(doc(db,"publicAffirmations",button.dataset.deletePublication)); toast("Publication removed"); await refreshConnections(); }
    catch(error) { toast("Could not remove publication: " + error.message); }
  }));
}

async function publishAffirmation() {
  if (!state.profile.publicHandle) {
    toast("Set your username in Profile & settings before publishing");
    return;
  }
  const affirmation = todayAffirmation();
  try {
    await setDoc(doc(db,"publicAffirmations",currentUser.uid),{
      authorId:currentUser.uid,
      username:state.profile.publicHandle,
      displayName:state.profile.displayName||currentUser.displayName||"MAWAESU member",
      affirmationId:affirmation.id,
      updatedAt:serverTimestamp()
    });
    toast("Affirmation published to the community");
    await refreshConnections();
  } catch(error) {
    toast("Could not publish affirmation: " + error.message);
  }
}

function appAnalysisRoute(view) {
  const appRoutes = {
    resultPage:"#archetype",
    colorAnalysisPage:"#color-analysis",
    roomAnalysisPage:"#room-analysis"
  };
  return appRoutes[view] || "#assessment";
}

function renderAssessment() {
  let progress={};
  try{progress=JSON.parse(localStorage.getItem("mawaesuQuizProgress")||"{}");}catch{}
  const hasProgress=progress.route==="quiz"&&Number.isInteger(progress.index)&&progress.index>0;
  routeContent.innerHTML=`${pageHeading("45 questions · about 2 minutes","To know you, take this test.","This reflective activity connects your answers to an archetype, a colour palette, and room suggestions. It is not a clinical assessment or a permanent identity.")}
    <section class="assessment-start panel">
      <p>There are no right or wrong answers. Choose the response that feels closest to you today; you can retake the quiz whenever you like.</p>
      <button id="startAssessmentBtn" class="primary-button">${hasProgress?"Continue the quiz":"Start the quiz"}</button>
      ${hasProgress?`<button id="restartAssessmentBtn" class="secondary-button" type="button">Start over</button>`:""}
      ${state.profile.archetypeTopThree?.length?`<a class="secondary-button" href="#profile">Return to Profile</a>`:""}
    </section>`;
  $("startAssessmentBtn").addEventListener("click",()=>{
    if(!hasProgress){
      quizIndex=0;
      quizScore=0;
      quizAnswers=[];
      localStorage.removeItem("mawaesuQuizProgress");
    }
    location.hash="quiz";
  });
  $("restartAssessmentBtn")?.addEventListener("click",()=>{
    quizIndex=0;quizScore=0;quizAnswers=[];
    localStorage.removeItem("mawaesuQuizProgress");
    location.hash="quiz";
  });
}

function renderQuiz() {
  let savedProgress={};
  try{savedProgress=JSON.parse(localStorage.getItem("mawaesuQuizProgress")||"{}");}catch{}
  if(savedProgress.route==="quiz"&&Number.isInteger(savedProgress.index)&&savedProgress.index>=0&&savedProgress.index<assessmentQuestions.length){
    quizIndex=savedProgress.index;
    quizAnswers=Array.isArray(savedProgress.answers)?savedProgress.answers:[];
  }
  const progress=Math.round((quizIndex/assessmentQuestions.length)*100);
  routeContent.innerHTML=`${pageHeading("Self-discovery","Archetype Quiz","Choose one response for each question. Your answers are used to calculate your reflective result.")}
    <section class="panel quiz-panel">
      <div class="quiz-progress" role="progressbar" aria-label="Quiz progress" aria-valuenow="${quizIndex}" aria-valuemin="0" aria-valuemax="${assessmentQuestions.length}"><span style="width:${progress}%"></span></div>
      <p class="field-note">Question ${quizIndex+1} of ${assessmentQuestions.length}</p>
      <h2 id="assessmentQuestion">${escapeHtml(assessmentQuestions[quizIndex])}</h2>
      <div class="assessment-choices">${assessmentAnswerOptions[quizIndex].map((label,index)=>`<button type="button" class="assessment-choice" data-assessment-choice="${index}">${escapeHtml(label)}</button>`).join("")}</div>
      <div class="quiz-controls"><button id="previousQuestionBtn" class="secondary-button" type="button" ${quizIndex===0?"disabled":""}>Previous</button><button id="leaveQuizBtn" class="text-button" type="button">Save and leave</button></div>
    </section>`;
  document.querySelectorAll("[data-assessment-choice]").forEach(button=>button.addEventListener("click",()=>{
    quizAnswers[quizIndex]=assessmentChoiceScores[Number(button.dataset.assessmentChoice)];
    quizIndex+=1;
    if(quizIndex>=assessmentQuestions.length){completeAssessment();return;}
    localStorage.setItem("mawaesuQuizProgress",JSON.stringify({route:"quiz",index:quizIndex,answers:quizAnswers}));
    renderQuiz();
  }));
  $("previousQuestionBtn").addEventListener("click",()=>{
    if(quizIndex===0)return;
    quizIndex-=1;
    localStorage.setItem("mawaesuQuizProgress",JSON.stringify({route:"quiz",index:quizIndex,answers:quizAnswers}));
    renderQuiz();
  });
  $("leaveQuizBtn").addEventListener("click",()=>location.hash="assessment");
}

async function completeAssessment() {
  quizScore=quizAnswers.reduce((total,value)=>total+(Number.isInteger(value)?value:0),0);
  const score=Math.round(quizScore/(assessmentQuestions.length*3)*100);
  const archetype=assessmentArchetypes.reduce((closest,item,index)=>{
    return Math.abs(score-(index*5+2.5))<Math.abs(score-(closest.index*5+2.5))?{...item,index}:closest;
  },{...assessmentArchetypes[0],index:0});
  const result={name:archetype[0],desc:archetype[1]};
  const archetypeTopThree=[result];
  state.profile={...state.profile,archetypeTopThree,archetypeScore:String(score),onboardingComplete:true};
  localStorage.setItem("archetypeTopThree",JSON.stringify(archetypeTopThree));
  localStorage.setItem("archetypeScore",String(score));
  localStorage.removeItem("mawaesuQuizProgress");
  try{
    await setDoc(doc(db,"users",currentUser.uid),{
      archetypeTopThree,archetypeScore:String(score),onboardingComplete:true,updatedAt:serverTimestamp()
    },{merge:true});
  }catch(error){
    toast("Your result is ready, but could not be saved to your account: "+error.message);
  }
  location.hash="archetype";
}

function renderArchetypeResult() {
  let saved=state.profile.archetypeTopThree;
  if(!Array.isArray(saved)||!saved.length){
    try{saved=JSON.parse(localStorage.getItem("archetypeTopThree")||"[]");}catch{saved=[];}
  }
  const archetype=saved[0];
  if(!archetype){routeContent.innerHTML=`${pageHeading("Self-discovery","Your archetype","Take the reflection quiz to see your result.")}<a class="primary-button" href="#assessment">Start the quiz</a>`;return;}
  const details=(archetype.desc||"").split("\n").map(line=>line.split(": "));
  routeContent.innerHTML=`${pageHeading("Your archetype",escapeHtml(archetype.name),"An invitation to reflect—not a diagnosis, fixed identity, or prediction.")}
    <section class="panel archetype-result-panel">
      <p class="archetype-mantra">${escapeHtml((details.find(item=>item[0]==="Mantra")?.[1]||"").replace(/^['"]|['"]$/g,""))}</p>
      <dl>${details.filter(item=>item.length>1&&item[0]!=="Mantra").map(item=>`<div><dt>${escapeHtml(item[0])}</dt><dd>${escapeHtml(item.slice(1).join(": "))}</dd></div>`).join("")}</dl>
      <p>Your answers and saved results are private to your account. You can revisit or retake this reflection at any time.</p>
      <div class="profile-tool-links"><a class="primary-button" href="#color-analysis">Explore your colours</a><a class="secondary-button" href="#room-analysis">Explore your space</a><a class="text-button" href="#assessment">Retake the quiz</a><a class="text-button" href="#profile">Return to Profile</a></div>
    </section>`;
}

function renderColorAnalysisPage() {
  const score=Number(state.profile.archetypeScore??localStorage.getItem("archetypeScore"));
  const palette=savedColorProfiles.find(item=>Number.isFinite(score)&&score>=item.range[0]&&score<=item.range[1]);
  const archetype=state.profile.archetypeTopThree?.[0];
  if(!palette){routeContent.innerHTML=`${pageHeading("Colour psychology","Colour Analysis","Explore a tailored palette. Colour perception and preference differ across people, cultures, lighting, and displays.")}<a class="primary-button" href="#assessment">Take the quiz</a>`;return;}
  const swatches=(colors,group)=>colors.map((hex,index)=>`<button class="analysis-swatch" type="button" data-analysis-color="${hex}" aria-label="${group} colour ${index+1}, ${hex}" style="--swatch-color:${hex}"></button>`).join("");
  routeContent.innerHTML=`${pageHeading("Colour psychology","Colour Analysis","A tailored palette and notes for your archetype — core colours first, then supporting colours.")}
    <section class="analysis-page-grid">
      <article class="panel"><h2>${escapeHtml(palette.title)}</h2><p>${escapeHtml(palette.note)}</p><p class="field-note">Matched to ${escapeHtml(archetype?.name||"your saved reflection")}. These are design suggestions, not guaranteed emotional or health effects.</p></article>
      <article class="panel"><h2>Core palette</h2><div class="analysis-swatches">${swatches(palette.core,"Core")}</div></article>
      <article class="panel"><h2>Supporting colours</h2><div class="analysis-swatches">${swatches(palette.support,"Supporting")}</div></article>
      <article id="analysisColorDetail" class="panel"><h2>Tap a colour</h2><p>Select a swatch to view its HEX value and description.</p></article>
      <div class="profile-tool-links"><a class="secondary-button" href="#archetype">Back to archetype</a><a class="primary-button" href="#room-analysis">Next: room analysis</a></div>
    </section>`;
  document.querySelectorAll("[data-analysis-color]").forEach(button=>button.addEventListener("click",()=>{
    const color=button.dataset.analysisColor;
    $("analysisColorDetail").innerHTML=`<h2>${escapeHtml(color)}</h2><div class="analysis-color-preview" style="background:${escapeHtml(color)}"></div><p>This colour is part of your saved ${escapeHtml(palette.title)} palette. Its appearance and associations can vary with context.</p><button class="text-button" type="button" data-copy-analysis-color="${escapeHtml(color)}">Copy HEX</button>`;
    $("analysisColorDetail").querySelector("[data-copy-analysis-color]").addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(color);toast(`${color} copied`);}catch(error){toast("Could not copy the colour code: "+error.message);}
    });
  }));
}

function renderRoomAnalysisPage() {
  const archetype=state.profile.archetypeTopThree?.[0];
  routeContent.innerHTML=`${pageHeading("Environmental design","Room Analysis","A starting point for considering how your space works for you. These suggestions are design prompts, not clinical or guaranteed effects.")}
    <section class="analysis-page-grid">
      <article class="panel"><h2>Your reflection</h2><p>${archetype?`<strong>${escapeHtml(archetype.name)}</strong><br>${escapeHtml(archetype.desc||"")}`:"Complete the self-discovery quiz to see your saved reflection."}</p></article>
      <article class="panel"><h2>Start with your needs</h2><ul><li>Keep a clear, comfortable route through the room.</li><li>Choose lighting that is adjustable and suits the task.</li><li>Make frequently used items reachable and storage practical.</li><li>Adapt suggestions to your access needs, budget, culture, climate, and living arrangements.</li></ul></article>
      <article class="panel"><h2>Plan a room</h2><p>Describe a room and explore practical ideas for light, atmosphere, storage, and circulation. You can save the plan privately.</p><a class="primary-button" href="#spaces">Open room description planner</a></article>
      <div class="profile-tool-links"><a class="secondary-button" href="#color-analysis">Back to colour analysis</a><a class="secondary-button" href="#profile">Back to Profile</a></div>
    </section>`;
}

const savedColorProfiles = [
  {range:[0,5],title:"Muted Earth",note:"Soft grounding tones for sensitivity and quiet reflection.",core:["#B2BEB5","#C4AEAD","#E5E5E5","#A9B3BC","#C7D3C4"],support:["#FFF5E1","#F6D1D1","#FFD9B3","#A3C4F3","#D3F0E1"]},
  {range:[6,10],title:"Twilight Bloom",note:"Dusky violet and dreamy tones for an imaginative palette.",core:["#7B5E87","#C68FA7","#2E3A59","#708090","#BFA0C9"],support:["#D6C3E0","#A3C4F3","#FFF9C4","#BFF0D4","#FFBFA3"]},
  {range:[11,15],title:"Gentle Shelter",note:"Cool protective hues with soft warmth and steady neutrals.",core:["#8C9BA5","#2E5266","#B1A7A6","#5A6A7B","#4B4B4B"],support:["#E6D7B9","#CDE7F0","#FFD6C2","#A8C1A3","#F7D594"]},
  {range:[16,20],title:"Rainwater Calm",note:"Reflective greys and softened neutrals.",core:["#4F5B66","#6B7B8C","#A9A49B","#5C5C5C","#B4A7B1"],support:["#FFE4B2","#F7D1D1","#BDE0EB","#D6C3E0","#D8E3D0"]},
  {range:[21,25],title:"Explorer Map",note:"Cartographic and curiosity-led tones.",core:["#BCC0C0","#609EA2","#D3C5A9","#4E6E8E","#A3988A"],support:["#A7E6AF","#A3C4F3","#FFF9B3","#FFAB91","#E6D0F0"]},
  {range:[26,30],title:"Motion Ember",note:"Energetic warm neutrals with contrasting cool accents.",core:["#D98E50","#C75D5D","#607D8B","#5C5C5C","#B1A7A6"],support:["#FF7F50","#FFE066","#A3E4C6","#A3C4F3","#F7D594"]},
  {range:[31,35],title:"Controlled Fire",note:"Deep reds and grounded darks with bright accents.",core:["#D33F49","#800020","#4B4B4B","#D98352","#8B3A3A"],support:["#FFC069","#3EC1CD","#F7D594","#8ABF8C","#A3C4F3"]},
  {range:[36,40],title:"Healing Grove",note:"Botanical greens, soft blues, and warm neutrals.",core:["#A3BFA8","#7FB7B7","#B2D4E1","#F5F1E3","#D8A7A7"],support:["#FFDAB3","#FFF9B3","#E6D0F0","#A3C4F3","#B7D3B3"]},
  {range:[41,45],title:"Mountain Path",note:"Stone-inspired hues with deep teal and warm brown.",core:["#7A7A7A","#356B6B","#8C5E4F","#BFC1C2","#2E3A59"],support:["#FFD966","#B3E0C3","#A3C4F3","#FFB6A3","#D6C3E0"]},
  {range:[46,50],title:"Broken Prism",note:"Soft blush and reflective tones.",core:["#F3C6C6","#C5C5C5","#D7C7E1","#EDE0D4","#BFDCE7"],support:["#FFBFA3","#FFE066","#BDE0D4","#A3C4F3","#FFDAB3"]},
  {range:[51,55],title:"Sunrise Discipline",note:"Amber and oak tones with deep charcoal and navy.",core:["#B65A4C","#4B4B4B","#2E3A59","#A89F91","#708238"],support:["#FFD966","#A3C4F3","#FF7F50","#FFDAB3","#F7D594"]},
  {range:[56,60],title:"Cloudlight Hope",note:"Pastel sky tones with soft warm accents.",core:["#A3C4F3","#D6C3E0","#FFDAB3","#B3E0C3","#F5F1E3"],support:["#FFF066","#FFB6A3","#BDE0D4","#EADCF7","#F7D1D1"]},
  {range:[61,65],title:"Joy Horizon",note:"Bright colours for a lively, expressive palette.",core:["#FFE066","#FF7F50","#A3C4F3","#E6D0F0","#FFF5E1"],support:["#FFD966","#B3E0C3","#FFDAB3","#F7D1D1","#BDE0D4"]},
  {range:[66,70],title:"Bravery Gold",note:"Warm gold and red paired with grounded neutrals.",core:["#E1A93C","#C75D5D","#4B4B4B","#B89F91","#356B6B"],support:["#A3C4F3","#FF7F50","#BDE0D4","#F7D594","#FFE066"]},
  {range:[71,75],title:"Creative Inferno",note:"High-energy reds and warm accents with deep plum.",core:["#D33F49","#9B2C60","#D98352","#4B4B4B","#6F2B6F"],support:["#FF7F50","#FFF066","#B3E0C3","#E6D0F0","#FFDAB3"]},
  {range:[76,80],title:"Wisdom Candle",note:"Warm parchment and calm neutrals.",core:["#356B6B","#A3BFA8","#7B8C99","#4B4B4B","#F5F1E3"],support:["#A3C4F3","#FFD966","#FFDAB3","#E6D0F0","#B3E0C3"]},
  {range:[81,85],title:"Cosmic Vision",note:"Expansive blue-violet shades with bright highlights.",core:["#4A90E2","#9B59B6","#7FD8D8","#FFF5B3","#C5C5C5"],support:["#FF7F50","#B3E0C3","#A3C4F3","#FFD966","#E6D0F0"]},
  {range:[86,90],title:"Visible Voice",note:"Expressive coral and red paired with teal and soft neutrals.",core:["#FF7F50","#D33F49","#356B6B","#4B4B4B","#FFDAB3"],support:["#A3C4F3","#B3E0C3","#FFE066","#E6D0F0","#FFF5E1"]},
  {range:[91,95],title:"Loving Flame",note:"Warm reds and apricot balanced by gentle complementary shades.",core:["#E74C3C","#FF7F50","#F7D1D1","#FFDAB3","#BDE0D4"],support:["#A3C4F3","#FFE066","#E6D0F0","#B3E0C3","#F7D594"]},
  {range:[96,100],title:"Luminous Peace",note:"Bright soft neutrals with sky, lilac, and green accents.",core:["#FFE4B2","#FFF5E1","#CDE7F0","#E6D0F0","#B3E0C3"],support:["#FFB6A3","#FFD966","#A3C4F3","#FFDAB3","#F7D1D1"]}
];

function renderInlineColorAnalysis(score, archetype) {
  const numericScore = score===null||score===undefined||score==="" ? NaN : Number(score);
  const palette = Number.isFinite(numericScore)
    ? savedColorProfiles.find(item=>numericScore>=item.range[0]&&numericScore<=item.range[1])
    : null;
  if (!palette) {
    return `<article class="profile-result-card color-analysis-card"><h2>Colour Analysis</h2><p>Complete the quiz to see your colour analysis.</p><a class="text-button" href="#assessment">Take the quiz →</a></article>`;
  }
  const swatches = palette.core.map(hex=>`<span class="profile-color-swatch" style="--swatch-color:${hex}" aria-label="${hex}"></span>`).join("");
  return `<article class="profile-result-card color-analysis-card">
    <h2>Colour Analysis</h2><p><strong>${escapeHtml(palette.title)}</strong><br>${escapeHtml(palette.note)}</p>
    <div class="profile-color-palette" aria-label="Core colour palette">${swatches}</div>
    <a class="text-button" href="${appAnalysisRoute("colorAnalysisPage")}">View full colour analysis →</a>
  </article>`;
}

function renderProfile() {
  let stored = state.profile.archetypeTopThree;
  if (!Array.isArray(stored) || !stored.length) {
  try { stored = JSON.parse(localStorage.getItem("archetypeTopThree") || "[]"); }
  catch { stored = []; }
  }
  const archetype = stored?.[0];
  const score = state.profile.archetypeScore ?? localStorage.getItem("archetypeScore");
  const displayName=state.profile.displayName||currentUser?.displayName||currentUser?.email?.split("@")[0]||"Friend";
  const {text:dailyAffirmation,category:affirmationCategory}=todayAffirmation();
  const profileAffirmation=archetype?.name?.includes("The Quiet Fighter")
    ? "I can make my environment support the way I want to feel. I will offer myself the understanding I deserve."
    : dailyAffirmation;
  const affirmationFor=archetype?.name||affirmationCategory;
  routeContent.innerHTML = `<a class="profile-brand" href="#home"><img src="logo.png" alt=""><span>MAWAESU</span></a>
    <header class="profile-page-heading"><h1>Your Profile</h1></header>
    <section class="profile-layout profile-video-layout">
      <article class="profile-editor panel">
        <div class="profile-photo-stage" id="profileAvatar">
            <img id="profileAvatarImage" alt="" ${state.profile.avatarUrl?"":"hidden"} />
            <span id="profileAvatarPlaceholder"><span id="profileAvatarSymbol" hidden></span><span id="profileAvatarInitial" class="profile-avatar-initial">${escapeHtml(displayName[0]?.toUpperCase()||"M")}</span><span id="profileAvatarPrompt">Add a photo</span></span>
        </div>
        <label class="profile-photo-choice" for="profileAvatarInput">Choose Photo</label>
        <input id="profileAvatarInput" class="profile-avatar-input" type="file" accept="image/*" />
        <div class="profile-avatar-presets" aria-label="Choose a profile illustration">${profileAvatarSymbols.map(symbol=>`<button type="button" data-profile-avatar="${symbol}" aria-label="Choose ${symbol}" aria-pressed="${state.profile.avatarSymbol===symbol}">${symbol}</button>`).join("")}</div>
        <h2 id="profileHeadingName">${escapeHtml(displayName)}</h2>
        <p id="profileHeadingHandle" class="profile-handle">${state.profile.publicHandle?`@${escapeHtml(state.profile.publicHandle)}`:""}</p>
        <form id="profilePageForm">
          <label>Display name<input id="profileDisplayName" type="text" maxlength="80" autocomplete="name" required /></label>
          <label>Username<input id="profileUsername" type="text" minlength="3" maxlength="20" pattern="[a-z0-9._-]{3,20}" autocomplete="off" /></label>
          <label>Bio or quote<textarea id="profileBio" maxlength="500" placeholder="Write your quote or bio..."></textarea></label>
          <p id="profileError" class="form-error" role="alert"></p>
          <button class="primary-button" type="submit">Save Profile</button>
        </form>
        <p id="profileUsernameNote" class="field-note"></p>
        <details class="profile-extra-settings">
          <summary>More profile settings</summary>
          <label>Short public bio (optional)<textarea id="profilePublicBio" maxlength="120" placeholder="Visible to people who look up your username"></textarea></label>
          <label>Interface theme<select id="profileTheme"><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
          <label class="profile-checkbox"><input id="profileLargeText" type="checkbox" /> Use larger interface text</label>
          <p class="field-note profile-privacy-note">Your journal, goals, and personal notes remain private. Only your username, display name, and optional short public bio are shown to people who look up your username.</p>
        </details>
      </article>
      <section class="profile-results">
        <article class="profile-result-card profile-public-notes">
          <h2>Your writing</h2>
          <div class="profile-writing-tabs" role="tablist" aria-label="Your writing">
            <button type="button" role="tab" data-profile-writing-tab="My Notes" aria-selected="false">My Notes</button>
            <button type="button" role="tab" data-profile-writing-tab="Featured" aria-selected="false">Featured</button>
            <button type="button" role="tab" data-profile-writing-tab="Saved" aria-selected="false">Saved</button>
          </div>
          <div id="profileCommunityNotesStatus" class="field-note" role="status" aria-live="polite">Loading public notes…</div>
          <div id="profileCommunityNotesList" class="community-notes-list"></div>
        </article>
        <article class="profile-result-card profile-tools-card">
          <h2>Your MAWAESU tools</h2>
          <div class="profile-tool-links">
            <a class="primary-button" href="#assessment">Take the quiz</a>
            <a class="secondary-button" href="${appAnalysisRoute("resultPage")}">View your results</a>
            <a class="primary-button" href="#spaces">Room description planner</a>
            <button class="secondary-button" id="profileTodayAffirmationBtn" type="button">Today's affirmation</button>
          </div>
        </article>
        ${archetype?`<article class="profile-result-card profile-archetype-card"><h2>Archetype</h2><p><strong>${escapeHtml(archetype.name||"Archetype")}</strong><br>${escapeHtml(archetype.desc||"Explore the full interpretation and its reflective questions.")}</p>${stored.length>1?`<h3>Other patterns to reflect on</h3><div class="archetype-alternates">${stored.slice(1).map(item=>`<div><strong>${escapeHtml(item.name||"")}</strong><p>${escapeHtml(item.desc||"")}</p></div>`).join("")}</div>`:""}<a class="text-button" href="${appAnalysisRoute("resultPage")}">View full archetype reveal →</a></article>`:`<article class="profile-result-card profile-archetype-card"><h2>Archetype</h2><p>No archetype saved yet.</p><a class="text-button" href="#assessment">Take the quiz →</a></article>`}
        ${renderInlineColorAnalysis(score,archetype)}
        <article class="profile-result-card"><h2>Room Analysis</h2>${archetype?`<p><strong>${escapeHtml(archetype.name||"")}</strong><br>${escapeHtml(archetype.desc||"")}</p>`:`<p>No room guidance available yet.</p>`}<a class="text-button" href="${appAnalysisRoute("roomAnalysisPage")}">View full room analysis →</a>${state.rooms.length?`<h3>Your saved room concepts</h3><div class="saved-profile-rooms">${state.rooms.map(room=>`<p><strong>${escapeHtml(room.name||room.title||"Room concept")}</strong>${room.style?` · ${escapeHtml(room.style)}`:""}</p>`).join("")}</div>`:""}</article>
        <article class="profile-result-card profile-daily-affirmation" id="profileDailyAffirmation">
          <h2>Your daily affirmation</h2>
          <blockquote>${escapeHtml(profileAffirmation)}</blockquote>
          <p class="field-note">Chosen for ${escapeHtml(affirmationFor)}</p>
          <button class="secondary-button" id="showProfileAffirmationBtn" type="button">Show today's affirmation</button>
          <p class="field-note">This affirmation is picked for you once a day. You can send it to any of your connections from the community.</p>
        </article>
        <article class="profile-result-card profile-account-card">
          <h2>Account</h2>
          <div class="profile-actions">
            <button id="profileSignOutBtn" class="secondary-button" type="button">Sign out</button>
            <button id="profileDeactivateBtn" class="secondary-button" type="button">Deactivate account</button>
            <button id="profileRequestDeletionBtn" class="danger-button" type="button">Request account deletion</button>
            <button id="profileDeleteResultsBtn" class="secondary-button" type="button">Reset quiz results</button>
          </div>
          <details class="profile-extra-account-actions"><summary>More account actions</summary>
            <button id="profileExportBtn" class="secondary-button" type="button">Export my data</button>
            <button id="profileDeleteAccountBtn" class="danger-button" type="button">Delete account</button>
          </details>
        </article>
      </section>
    </section>`;
  applyProfilePreferences();
  $("profilePageForm").addEventListener("submit",saveProfilePage);
  $("profileAvatarInput").addEventListener("change",uploadProfileAvatar);
  $("profileSignOutBtn").addEventListener("click",signOutUser);
  $("profileDeactivateBtn").addEventListener("click",()=>requestAccountChange("deactivation"));
  $("profileRequestDeletionBtn").addEventListener("click",()=>requestAccountChange("deletion"));
  $("profileExportBtn").addEventListener("click",exportUserData);
  $("profileDeleteResultsBtn").addEventListener("click",deleteAssessmentResults);
  $("profileDeleteAccountBtn").addEventListener("click",deleteAccount);
  $("profileTodayAffirmationBtn").addEventListener("click",()=>$("profileDailyAffirmation").scrollIntoView({behavior:"smooth",block:"center"}));
  $("showProfileAffirmationBtn").addEventListener("click",()=>location.hash="connections");
  renderProfileWritingTab(profileWritingTab);
  document.querySelectorAll("[data-profile-writing-tab]").forEach(button=>button.addEventListener("click",()=>renderProfileWritingTab(button.dataset.profileWritingTab)));
  document.querySelectorAll("[data-profile-avatar]").forEach(button=>button.addEventListener("click",()=>selectProfileAvatar(button.dataset.profileAvatar)));
  loadProfileCommunityNotes();
}

function renderProfileAvatar() {
  const image=$("profileAvatarImage"),placeholder=$("profileAvatarPlaceholder");
  if(!image||!placeholder)return;
  const avatar=state.profile.avatarUrl||state.profile.profileState?.avatar;
  const symbol=state.profile.avatarSymbol||"";
  if(avatar){
    image.src=avatar;
    image.hidden=false;
    placeholder.hidden=true;
  }else{
    image.removeAttribute("src");
    image.hidden=true;
    placeholder.hidden=false;
    $("profileAvatarSymbol").hidden=!symbol;
    $("profileAvatarSymbol").textContent=symbol;
    $("profileAvatarInitial").hidden=!!symbol;
    $("profileAvatarPrompt").hidden=!!symbol;
  }
  document.querySelectorAll("[data-profile-avatar]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.profileAvatar===symbol)));
}

async function selectProfileAvatar(symbol) {
  const profileState={...(state.profile.profileState||{}),avatar:null};
  state.profile={...state.profile,avatarUrl:"",avatarSymbol:symbol,profileState};
  renderProfileAvatar();
  try{
    await saveDocument("profile","main",{avatarUrl:null,avatarSymbol:symbol,profileState});
    toast("Profile illustration updated");
  }catch(error){
    $("profileError").textContent="Could not save your profile illustration: "+error.message;
  }
}

async function saveProfilePage(event) {
  event.preventDefault();
  $("profileError").textContent="";
  const displayName=$("profileDisplayName").value.trim();
  const publicHandle=$("profileUsername").value.trim().toLowerCase();
  if(!displayName){$("profileError").textContent="Enter a display name.";return;}
  if(!state.profile.publicHandle&&publicHandle&&!/^[a-z0-9._-]{3,20}$/.test(publicHandle)){
    $("profileError").textContent="Choose a username of 3–20 letters, numbers, periods, underscores, or hyphens.";
    return;
  }
  const profileState={
    bio:$("profileBio").value.trim(),
    avatar:state.profile.avatarUrl||state.profile.profileState?.avatar||null,
    username:state.profile.publicHandle||publicHandle||""
  };
  const data={
    displayName,
    publicHandle:state.profile.publicHandle||publicHandle||"",
    username:state.profile.publicHandle||publicHandle||"",
    bio:profileState.bio,
    publicBio:$("profilePublicBio").value.trim(),
    profileState,
    avatarSymbol:state.profile.avatarSymbol||"",
    theme:$("profileTheme").value,
    largeText:$("profileLargeText").checked
  };
  try{
    const batch=writeBatch(db);
    batch.set(doc(db,"users",currentUser.uid),{...data,updatedAt:serverTimestamp()},{merge:true});
    batch.set(doc(db,"publicProfiles",currentUser.uid),{
      uid:currentUser.uid,handle:data.publicHandle,displayName,bio:data.publicBio,updatedAt:serverTimestamp()
    },{merge:true});
    if(data.publicHandle){
      batch.set(doc(db,"usernames",data.publicHandle),{
        uid:currentUser.uid,username:data.publicHandle,displayName,bio:data.publicBio,updatedAt:serverTimestamp()
      },{merge:true});
    }
    await batch.commit();
    state.profile={...state.profile,...data};
    applyProfilePreferences();
    $("profileHeadingName").textContent=displayName;
    $("profileHeadingHandle").textContent=data.publicHandle?`@${data.publicHandle}`:"Set a username to connect with people.";
    toast("Profile saved");
    try { await updateProfile(currentUser,{displayName}); }
    catch(error) { toast("Profile saved, but the sign-in display name could not be updated: "+error.message); }
  }catch(error){
    $("profileError").textContent="Could not save your profile: "+error.message;
  }
}

async function uploadProfileAvatar(event) {
  const file=event.target.files?.[0];
  if(!file)return;
  if(!file.type.startsWith("image/")||file.size>5*1024*1024){
    $("profileError").textContent="Choose an image smaller than 5 MB.";
    event.target.value="";
    return;
  }
  const extension=file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g,"")||"image";
  const path=`avatars/${currentUser.uid}/${crypto.randomUUID()}.${extension}`;
  const imageRef=storageRef(storage,path);
  $("profileError").textContent="";
  try{
    await uploadBytes(imageRef,file,{contentType:file.type});
    const avatarUrl=await getDownloadURL(imageRef);
    const profileState={...(state.profile.profileState||{}),bio:state.profile.bio||"",username:state.profile.publicHandle||"",avatar:avatarUrl};
    await setDoc(doc(db,"users",currentUser.uid),{avatarUrl,avatarSymbol:"",avatarPath:path,profileState,updatedAt:serverTimestamp()},{merge:true});
    state.profile={...state.profile,avatarUrl,avatarSymbol:"",avatarPath:path,profileState};
    renderProfileAvatar();
    toast("Profile photo updated");
  }catch(error){
    $("profileError").textContent="Could not upload profile photo: "+error.message;
  }
}

async function exportUserData() {
  try {
    const [likedNotes, pollVotes, accountRequests, postsByAuthor, postsByLegacyAuthor, commentsByAuthor, commentsByLegacyAuthor] = await Promise.all([
      getDocs(collection(db,"users",currentUser.uid,"likedNotes")),
      getDocs(collection(db,"users",currentUser.uid,"pollVotes")),
      getDocs(collection(db,"users",currentUser.uid,"accountRequests")),
      getDocs(query(collection(db,"publicNotes"),where("authorId","==",currentUser.uid))),
      getDocs(query(collection(db,"publicNotes"),where("authorUid","==",currentUser.uid))),
      getDocs(query(collectionGroup(db,"comments"),where("authorId","==",currentUser.uid))),
      getDocs(query(collectionGroup(db,"comments"),where("authorUid","==",currentUser.uid)))
    ]);
    const authoredNotes = [...new Map([...postsByAuthor.docs,...postsByLegacyAuthor.docs].map(item=>[item.id,item])).values()];
    const authoredComments = [...new Map([...commentsByAuthor.docs,...commentsByLegacyAuthor.docs].map(item=>[item.ref.path,item])).values()];
    const downloadable={
      profile:state.profile,entries:state.entries,intentions:state.intentions,captures:state.captured,
      goals:state.goals,drafts:state.drafts,books:state.books,rooms:state.rooms,archive:state.archive,
      accountRequests:accountRequests.docs.map(item=>({id:item.id,...item.data()})),
      community:{
        authoredNotes:authoredNotes.map(item=>({id:item.id,...item.data()})),
        comments:authoredComments.map(item=>({id:item.id,noteId:item.ref.parent.parent?.id,...item.data()})),
        likedNotes:likedNotes.docs.map(item=>({noteId:item.id,...item.data()})),
        pollVotes:pollVotes.docs.map(item=>({noteId:item.id,...item.data()}))
      }
    };
    const blob=new Blob([JSON.stringify(downloadable,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="mawaesu-data.json";link.click();URL.revokeObjectURL(url);
  } catch(error) {
    toast("Could not export your data: " + error.message);
  }
}

async function requestAccountChange(type) {
  const action=type==="deactivation"?"deactivation":"account deletion";
  if(!confirm(`Submit a request for ${action}? Your account will remain active until a MAWAESU administrator processes the request.`))return;
  try{
    await setDoc(doc(db,"users",currentUser.uid,"accountRequests",type),{
      type,status:"requested",requestedAt:serverTimestamp()
    });
    toast(`Your ${action} request has been recorded.`);
  }catch(error){
    toast(`Could not record your ${action} request: `+error.message);
  }
}

async function deleteAssessmentResults() {
  if(!confirm("Delete your saved archetype, colour and room results? Your account, profile, and other data will remain. You can retake the assessment later."))return;
  try{
    await setDoc(doc(db,"users",currentUser.uid),{
      archetypeTopThree:null,archetypeScore:null,onboardingComplete:false,updatedAt:serverTimestamp()
    },{merge:true});
    state.profile={...state.profile,archetypeTopThree:null,archetypeScore:null,onboardingComplete:false};
    localStorage.removeItem("archetypeTopThree");
    localStorage.removeItem("archetypeScore");
    toast("Assessment results deleted");
    location.hash="assessment";
  }catch(error){
    toast("Could not delete assessment results: "+error.message);
  }
}

async function deleteAccount() {
  if(!confirm("Delete your MAWAESU account? This cannot be undone."))return;
  try{
    await deleteOwnCommunityData();
    const accountRequests=await getDocs(collection(db,"users",currentUser.uid,"accountRequests"));
    await Promise.all(accountRequests.docs.map(item=>deleteDoc(item.ref)));
    for(const type of ["entries","intentions","captures","goals","drafts","books","rooms","archive"]){
      const items=await loadCollection(type);
      await Promise.all(items.map(item=>deleteDoc(pathFor(type,item.id))));
    }
    for(const name of ["connectionRequests","connections","affirmationShares"]){
      const snapshot=await getDocs(query(collection(db,name),where("participantIds","array-contains",currentUser.uid)));
      await Promise.all(snapshot.docs.map(item=>deleteDoc(item.ref)));
    }
    await deleteDoc(doc(db,"publicAffirmations",currentUser.uid));
    await deleteDoc(doc(db,"publicProfiles",currentUser.uid));
    if(state.profile.publicHandle)await deleteDoc(doc(db,"usernames",state.profile.publicHandle));
    if(state.profile.avatarPath)await deleteDoc(storageRef(storage,state.profile.avatarPath));
    await deleteDoc(doc(db,"users",currentUser.uid));
    await deleteUser(currentUser);
    toast("Account deleted");
  }catch(error){
    toast(error.code==="auth/requires-recent-login"?"For security, sign out and sign back in before deleting your account.":"Account deletion could not be completed: "+error.message);
  }
}

async function deleteOwnCommunityData() {
  const uid = currentUser.uid;
  const [likedNotes, pollVotes, postsByAuthor, postsByLegacyAuthor, commentsByAuthor, commentsByLegacyAuthor] = await Promise.all([
    getDocs(collection(db,"users",uid,"likedNotes")),
    getDocs(collection(db,"users",uid,"pollVotes")),
    getDocs(query(collection(db,"publicNotes"),where("authorId","==",uid))),
    getDocs(query(collection(db,"publicNotes"),where("authorUid","==",uid))),
    getDocs(query(collectionGroup(db,"comments"),where("authorId","==",uid))),
    getDocs(query(collectionGroup(db,"comments"),where("authorUid","==",uid)))
  ]);
  const posts = [...new Map([...postsByAuthor.docs,...postsByLegacyAuthor.docs].map(item=>[item.id,item])).values()];
  const comments = [...new Map([...commentsByAuthor.docs,...commentsByLegacyAuthor.docs].map(item=>[item.ref.path,item])).values()];
  for (const marker of likedNotes.docs) {
    const likeId = marker.data().likeId;
    const batch = writeBatch(db);
    if (likeId) batch.delete(doc(db,"publicNotes",marker.id,"likes",likeId));
    batch.delete(marker.ref);
    await batch.commit();
  }
  for (const marker of pollVotes.docs) {
    const voteId = marker.data().voteId;
    const batch = writeBatch(db);
    if (voteId) batch.delete(doc(db,"publicNotes",marker.id,"votes",voteId));
    batch.delete(marker.ref);
    await batch.commit();
  }
  const authoredNoteIds = new Set(posts.map(item=>item.id));
  const commentsOnOtherNotes = comments
    .filter(item=>!authoredNoteIds.has(item.ref.parent.parent?.id))
    .map(item=>item.ref);
  await deleteRefsInBatches(commentsOnOtherNotes);
  for (const post of posts) {
    await deleteCommunityNoteChildren(post.id);
    await deleteDoc(post.ref);
  }
}

function renderLearn() {
  const categories=["Psychology and Human Behaviour","Philosophy and Critical Thinking","History and Civilizations","Literature and Language","Science and the Natural World","Mathematics, Logic and Economics","Architecture, Design and Environmental Psychology","Sociology, Anthropology and Society","Law, Justice and Human Rights","Politics, Government and International Relations","Art, Aesthetics and Visual Culture","Music, Sound and Performing Arts","Medicine, Health and Human Well-being","Technology, Computing and Artificial Intelligence","Geography, Earth and Environment","Education, Learning and Intellectual Development","Business, Entrepreneurship and Finance","Communication, Media and Journalism","Culture, Religion, Mythology and Civilization","Mathematics, Statistics and Applied Logic","Astronomy, Space and Cosmology","Relationships, Family and Everyday Life","Practical Life Skills and Personal Development","Philosophy of Life, Creativity and Future Thinking"];
  routeContent.innerHTML=`${pageHeading("Explore the world","Learn","An expanding knowledge universe. Each published module is a starting point for inquiry, not a substitute for expert or academic guidance.")}
    <section class="learn-intro"><div><p class="eyebrow">Knowledge Universe</p><h2>Follow a question<br>wherever it leads.</h2><p>Search a subject, explore a lesson, and keep the topics you want to return to.</p><p>The first 20 Psychology and Human Behaviour lessons are now written with references. The 1,000-topic curriculum is being published category by category; a listed topic is not presented as a completed lesson.</p></div><div class="orbit-art" aria-hidden="true"><i></i><i></i><i></i><b>LEARN</b></div></section>
    <div class="toolbar"><input id="learnSearch" type="search" placeholder="Search topics" aria-label="Search learning topics" /><select id="learnFilter" aria-label="Filter by subject"><option value="">All subjects</option>${categories.map(category=>`<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}</select><select id="learnLevel" aria-label="Filter by difficulty"><option value="">All levels</option><option>Beginner</option><option>Intermediate</option></select></div>
    <p id="learnCount" class="learn-count"></p><section id="learnList" class="feature-grid"></section>`;
  const articles=[
    {category:categories[0],title:"Introduction to Psychology",level:"Beginner",minutes:6,intro:"Psychology is the scientific study of behaviour and mental processes. It includes many perspectives and methods; no single theory explains every person or situation.",lesson:"Psychologists investigate questions with observations, experiments, surveys, interviews, and other methods. Findings describe patterns across groups and must be interpreted with attention to the sample, context, and limits of a study. A correlation between two things does not by itself show that one caused the other.",concepts:["Behaviour","Mental processes","Research methods","Correlation and causation"],example:"A student notices they remember vocabulary better after short practice sessions. A careful investigation would compare methods and account for time spent studying, not assume a single cause from one experience.",source:"American Psychological Association: Psychology topics",url:"https://www.apa.org/topics",related:["How Human Memory Works","The Science of Emotions","Cognitive Biases and Their Influence"]},
    {category:categories[0],title:"How Human Memory Works",level:"Beginner",minutes:7,intro:"Memory is not a perfect recording. It involves encoding, retaining, and retrieving information, and each stage can be affected by context and attention.",lesson:"Researchers distinguish processes such as working memory and long-term memory. Retrieval is constructive: remembering can be influenced by cues, later information, and expectations. Repeated practice with spacing can support learning, while confidence alone is not proof that a memory is accurate.",concepts:["Encoding","Storage","Retrieval","Working memory"],example:"When revising a subject, trying to recall key ideas before checking notes can reveal what is accessible and what needs another learning pass.",source:"National Institute of Neurological Disorders and Stroke",url:"https://www.ninds.nih.gov/health-information/disorders/memory-disorders",related:["The Science of Attention","Active Recall","Spaced Repetition"]},
    {category:categories[0],title:"The Science of Emotions",level:"Beginner",minutes:6,intro:"Emotions are experiences involving interacting bodily, cognitive, and social processes. People can experience and describe the same situation differently.",lesson:"Emotion research uses multiple theories and measurement methods. Naming an emotion may help a person reflect on a situation, but emotion labels are not diagnoses and do not determine what someone should do. Cultural context, personal history, and immediate circumstances can all matter.",concepts:["Emotion","Affect","Appraisal","Emotional vocabulary"],example:"Before responding to a difficult conversation, a person might identify whether they feel hurt, worried, or frustrated and consider what information they still need.",source:"American Psychological Association: Emotions",url:"https://www.apa.org/topics/emotions",related:["Emotional Intelligence","Understanding Empathy","Self-compassion"]},
    {category:categories[0],title:"Cognitive Biases and Their Influence",level:"Intermediate",minutes:8,intro:"A cognitive bias is a systematic pattern that can influence judgment. Learning about biases is useful, but it does not make anyone immune to them.",lesson:"People use mental shortcuts because attention and information are limited. A shortcut can be helpful in one setting and misleading in another. Critical thinking means checking evidence, considering alternative explanations, and noticing when a conclusion is stronger than the available information.",concepts:["Heuristic","Confirmation bias","Availability","Evidence quality"],example:"When comparing two news claims, look for the original source and independent corroboration rather than relying only on whichever claim is easiest to recall.",source:"Stanford Encyclopedia of Philosophy: Bias",url:"https://plato.stanford.edu/",related:["Critical Thinking and Logical Fallacies","Media Literacy","The Psychology of Decision-Making"]},
    {category:categories[0],title:"How Habits Are Formed",level:"Beginner",minutes:6,intro:"A habit is a learned pattern that can become more automatic in a recurring context. Habits differ between people and are influenced by environments and resources.",lesson:"Repeated actions in similar situations can strengthen a cue-response pattern. Changing a routine may involve adjusting the context, making a desired action easier, and planning for obstacles. There is no universal number of days in which a habit forms.",concepts:["Cue","Routine","Context","Repetition"],example:"Leaving a book beside a usual resting place can make reading easier to remember, while keeping the plan small can make it more practical on busy days.",source:"National Institute of Mental Health",url:"https://www.nimh.nih.gov/health",related:["The Psychology of Motivation","Sustainable Habits","Personal Organization"]},
    {category:categories[0],title:"Understanding Personality",level:"Beginner",minutes:8,intro:"Personality describes patterns in how people tend to think, feel, and act. These patterns are not complete descriptions of a person and can vary with relationships, culture, roles, and circumstances.",lesson:"Psychologists study personality using different theories and measurement approaches. Trait models describe dimensions rather than fixed boxes; a score is an estimate based on a particular tool, not a diagnosis or a prediction of every future choice. Self-report can be useful, but it is affected by context and how questions are understood. Personality language is most helpful when it invites reflection without limiting someone's possibilities.",concepts:["Traits","Personality measures","Context","Individual differences"],example:"Someone who describes themself as reserved may speak readily with trusted friends, showing why a tendency should not be mistaken for an unchanging rule.",source:"OpenStax Psychology 2e: Personality",url:"https://openstax.org/books/psychology-2e/pages/11-introduction",related:["Nature versus Nurture","The Psychology of First Impressions","Understanding Human Behaviour"]},
    {category:categories[0],title:"The Psychology of First Impressions",level:"Beginner",minutes:7,intro:"People form quick impressions using limited information, such as a first conversation or a brief introduction. Those impressions can be useful starting guesses, but they are incomplete and sometimes inaccurate.",lesson:"Social judgments are influenced by the setting, expectations, previous experiences, and visible cues. A first impression is not reliable proof of someone's character, intentions, or ability. People can also update their judgments when they learn more. Taking time, seeking context, and separating observation from interpretation can reduce the risk of treating a snap judgment as fact.",concepts:["Thin-slice judgments","Attribution","Context","Updating beliefs"],example:"Notice the difference between 'They arrived late today' (an observation) and 'They are careless' (a conclusion that needs more evidence).",source:"OpenStax Psychology 2e: Social Psychology",url:"https://openstax.org/books/psychology-2e/pages/12-introduction",related:["Social Psychology and Group Behaviour","Cognitive Biases and Their Influence","Understanding Human Behaviour"]},
    {category:categories[0],title:"Emotional Intelligence",level:"Beginner",minutes:8,intro:"Emotional intelligence is a term used in several models for perceiving, understanding, and responding to emotion. Researchers do not use one universally accepted definition or measure.",lesson:"Some approaches emphasize recognizing emotions in oneself and others; others include skills such as regulating a response or using emotional information when reasoning. These abilities are not a guarantee of good judgment, and reading another person's feelings is uncertain. Curiosity, listening, and checking an interpretation directly are more respectful than assuming that a facial expression reveals exactly what someone feels.",concepts:["Emotion recognition","Emotional vocabulary","Regulation","Perspective-taking"],example:"In a tense conversation, you might say, 'I may have misunderstood—would you tell me what matters most to you here?' rather than claiming to know the other person's feelings.",source:"American Psychological Association: Emotion",url:"https://www.apa.org/topics/emotions",related:["The Science of Emotions","Understanding Empathy","Active Listening in Relationships"]},
    {category:categories[0],title:"The Psychology of Motivation",level:"Beginner",minutes:8,intro:"Motivation refers to processes that energize and direct action. It can involve interests, needs, goals, expectations, social conditions, and practical constraints.",lesson:"Motivation is not simply a matter of willpower. Different theories examine incentives, expectations of success, personal values, and autonomy. A goal can feel important but still be hard to act on when time, money, health, safety, or support are limited. A useful plan connects an action to a reason that matters to the person and makes room for changing circumstances.",concepts:["Intrinsic motivation","Extrinsic motivation","Goals","Autonomy and context"],example:"If learning a language matters to you, choose a manageable activity that fits your day and access to resources instead of treating missed practice as a character flaw.",source:"American Psychological Association: Motivation",url:"https://www.apa.org/topics/motivation",related:["How Habits Are Formed","Why People Procrastinate","Setting Realistic Goals"]},
    {category:categories[0],title:"Understanding Human Behaviour",level:"Beginner",minutes:8,intro:"Human behaviour is shaped by many interacting influences, including individual learning, relationships, culture, institutions, physical environments, and chance events.",lesson:"A single action rarely reveals a complete motive. Psychologists use observations and research methods to test explanations, while considering alternative causes and the limits of available evidence. Behaviour can differ across situations, and patterns observed in one group or context may not apply to everyone. Asking what conditions were present is often more informative than assigning a fixed label to a person.",concepts:["Behaviour","Learning","Situation and context","Multiple causes"],example:"If someone is quiet in a meeting, possible explanations include the group dynamic, language confidence, fatigue, or a preference to listen; more information is needed before drawing a conclusion.",source:"American Psychological Association: Psychology topics",url:"https://www.apa.org/topics",related:["Social Psychology and Group Behaviour","The Psychology of First Impressions","Understanding Personality"]},
    {category:categories[0],title:"How Childhood Experiences Influence Development",level:"Beginner",minutes:9,intro:"Child development reflects an ongoing interaction between biology, relationships, culture, and the environments children grow up in. Experiences matter, but no single event determines a person's whole future.",lesson:"Developmental research studies change across physical, cognitive, emotional, and social domains. Supportive relationships and safe, responsive environments can contribute to well-being; stressors and resources vary across families and communities. Development is not identical for every child, and observations should not be used to diagnose a child or blame a caregiver. When there are concerns, qualified local health or education professionals can provide individualized guidance.",concepts:["Developmental domains","Caregiving relationships","Protective factors","Variation in development"],example:"Two children may respond differently to the same transition. Listening to each child and considering their needs, supports, and context is more useful than comparing them against a rigid timetable.",source:"Harvard Center on the Developing Child",url:"https://developingchild.harvard.edu/science/key-concepts/",related:["Attachment Theory","Understanding Human Behaviour","The Science of Emotions"]},
    {category:categories[0],title:"Attachment Theory",level:"Intermediate",minutes:9,intro:"Attachment theory began as a framework for understanding children's relationships with caregivers and has since been applied in several research areas. Attachment concepts are not a simple test of someone's worth or a permanent label.",lesson:"Researchers study how early relationships can contribute to expectations about support and closeness, while recognizing that development is shaped by many relationships and circumstances. Popular descriptions of adult 'attachment styles' can oversimplify a complex field and should not be used to diagnose a partner or explain every conflict. People may experience relationships differently across time and contexts; respectful communication and appropriate professional support can help when needed.",concepts:["Caregiver-child relationship","Security and exploration","Relationship context","Limits of typologies"],example:"Rather than deciding that a friend has a particular attachment style, ask what they prefer when making plans and discuss how each of you can communicate clearly.",source:"American Psychological Association: Attachment",url:"https://www.apa.org/topics/parenting/attachment",related:["How Childhood Experiences Influence Development","Attachment and Adult Relationships","Understanding Healthy Relationships"]},
    {category:categories[0],title:"Social Psychology and Group Behaviour",level:"Beginner",minutes:9,intro:"Social psychology studies how people's thoughts, feelings, and actions relate to other people and social situations. Groups can offer identity and support as well as pressure and disagreement.",lesson:"Research examines influence, cooperation, roles, norms, and how people interpret one another. Group behaviour depends on membership and setting; it should not be reduced to the idea that individuals always act alike. Social psychology has also faced important questions about research ethics, sampling, and whether findings from one population generalize to others. Considering who was studied and under what conditions is part of reading evidence responsibly.",concepts:["Social influence","Group norms","Roles","Research generalizability"],example:"A group meeting can make one option seem unanimous even when members have reservations; inviting each person to respond independently can reveal views that were not yet voiced.",source:"OpenStax Psychology 2e: Social Psychology",url:"https://openstax.org/books/psychology-2e/pages/12-introduction",related:["Social Conformity","Groupthink and Its Consequences","The Psychology of First Impressions"]},
    {category:categories[0],title:"The Psychology of Decision-Making",level:"Beginner",minutes:9,intro:"Decision-making includes identifying a choice, considering information, and selecting a course of action. People use both deliberate reasoning and quick judgments, depending on the situation.",lesson:"Choices are shaped by available options, uncertainty, time, values, emotion, and the way information is presented. A decision process can be improved by clarifying what matters, identifying what is known and unknown, and comparing realistic alternatives. There is no single framework that makes every decision correct; small everyday choices and high-stakes choices call for different amounts of research and support.",concepts:["Heuristics","Risk and uncertainty","Framing","Values and trade-offs"],example:"When choosing a course, list what you hope to learn, practical constraints such as cost and schedule, and questions you still need answered before committing.",source:"OpenStax Psychology 2e: Thinking and Intelligence",url:"https://openstax.org/books/psychology-2e/pages/7-introduction",related:["Cognitive Biases and Their Influence","The Psychology of Motivation","Introduction to Probability"]},
    {category:categories[0],title:"Why People Procrastinate",level:"Beginner",minutes:8,intro:"Procrastination is delaying an intended action despite expecting that the delay may make things harder. It can have many causes and is not, by itself, proof that someone is lazy.",lesson:"A task may feel unclear, overwhelming, unpleasant, or disconnected from immediate priorities. Stress, competing responsibilities, health, and available support can also affect starting. Helpful responses often make the next step specific and small, reduce avoidable friction, and treat setbacks as information rather than a reason for shame. Persistent distress or impairment may warrant support from a qualified professional.",concepts:["Task avoidance","Emotion and delay","Task clarity","Self-compassion"],example:"Instead of planning to 'finish the project,' identify a first action that takes a few minutes, such as opening the document and writing a question the project must answer.",source:"American Psychological Association: Procrastination",url:"https://www.apa.org/topics/procrastination",related:["The Psychology of Motivation","How Habits Are Formed","Personal Organization"]},
    {category:categories[0],title:"Understanding Empathy",level:"Beginner",minutes:7,intro:"Empathy is commonly used for understanding or responding to another person's experience. It may include perspective-taking and emotional resonance, but people do not need to feel exactly alike to care.",lesson:"An empathic response starts with listening and remains open to correction. A person's assumptions about another's experience can be wrong, even when well-intended. Compassionate action can coexist with boundaries, and understanding someone does not require agreeing with every choice. Cultural and personal differences matter, so it is often better to ask what support is wanted than to guess.",concepts:["Perspective-taking","Emotional resonance","Compassion","Boundaries"],example:"You might say, 'I want to understand—would listening help, or would you prefer practical support?' and accept the answer.",source:"Greater Good Science Center: Empathy",url:"https://greatergood.berkeley.edu/topic/empathy",related:["Emotional Intelligence","The Science of Emotions","Active Listening in Relationships"]},
    {category:categories[0],title:"The Psychology of Confidence",level:"Beginner",minutes:7,intro:"Confidence is a person's sense of trust in their ability to approach a task or situation. It can differ across areas of life and is not the same as competence or self-worth.",lesson:"Expectations are influenced by experience, feedback, resources, and how risks are understood. Confidence can grow through practice and useful support, but feeling certain does not guarantee that a judgment is accurate. It is also reasonable to seek guidance, prepare carefully, or decide that a situation is not right for you. Confidence should not be treated as a requirement to ignore real barriers or safety concerns.",concepts:["Self-efficacy","Practice","Feedback","Confidence and competence"],example:"Before a presentation, prepare one section, ask for constructive feedback from someone you trust, and identify what you want the audience to understand.",source:"American Psychological Association: Self-efficacy",url:"https://dictionary.apa.org/self-efficacy",related:["The Psychology of Motivation","Understanding Personality","Learning Through Failure"]},
    {category:categories[0],title:"How Perception Shapes Reality",level:"Beginner",minutes:8,intro:"Perception is how people organize and interpret sensory information. It is influenced by attention, context, prior experience, and the limits of our senses.",lesson:"Perception is active, not a direct copy of the outside world. Two people may notice different details or interpret an ambiguous event differently. That does not mean every account is equally accurate: evidence, measurement, and checking with others can help distinguish what was observed from what was inferred. Perception also varies with culture and personal experience, so curiosity is preferable to treating one's own view as the only possible one.",concepts:["Sensation and perception","Attention","Context","Interpretation"],example:"In a busy room, one person may focus on a conversation while another notices background music; compare what each actually heard before deciding what happened.",source:"OpenStax Psychology 2e: Sensation and Perception",url:"https://openstax.org/books/psychology-2e/pages/5-introduction",related:["The Science of Emotions","Cognitive Biases and Their Influence","The Psychology of First Impressions"]},
    {category:categories[0],title:"The Psychology of Creativity",level:"Beginner",minutes:8,intro:"Creativity can involve producing ideas or work that are both original and useful within a particular context. It appears in many fields and is not limited to people who identify as artists.",lesson:"Creative work can draw on knowledge, practice, curiosity, collaboration, and time to explore alternatives. Different tasks call for different kinds of originality, and ideas are shaped by culture and available materials. A rough draft or experiment is not a failure; it is one way to make an idea visible and learn what to try next. There is no single personality type or guaranteed technique that makes someone creative.",concepts:["Originality","Usefulness and context","Exploration","Iteration"],example:"To improve a room layout, sketch several alternatives before choosing one; comparing options can reveal possibilities that were not obvious at first.",source:"American Psychological Association: Creativity",url:"https://www.apa.org/topics/creativity",related:["Imagination and Human Progress","Design Thinking in Everyday Life","Learning Through Failure"]},
    {category:categories[0],title:"Nature versus Nurture",level:"Beginner",minutes:9,intro:"The phrase 'nature versus nurture' describes a long-running question about how biological influences and experience relate to human development. Modern research generally examines their interaction rather than treating them as competing, isolated causes.",lesson:"Genes, environments, learning, relationships, culture, and life events can influence development in complex ways. The contribution of a factor may differ between traits and populations, and genetic influence does not mean that an outcome is fixed or inevitable. Findings about groups cannot predict an individual with certainty. Care is needed not to use this debate to excuse discrimination or blame families for circumstances shaped by wider conditions.",concepts:["Genes and environment","Gene-environment interaction","Development","Limits of prediction"],example:"A person's interest in music may reflect exposure, access to instruments, encouragement, practice, and individual differences together—not a single inherited cause.",source:"National Human Genome Research Institute: Genetics",url:"https://www.genome.gov/genetics-glossary",related:["Understanding Personality","How Childhood Experiences Influence Development","The Science of Human Development"]},
    {category:categories[1],title:"What Is Philosophy?",level:"Beginner",minutes:6,intro:"Philosophy examines fundamental questions about knowledge, reality, reasoning, value, and how people should live together.",lesson:"Philosophical inquiry clarifies concepts, evaluates arguments, and considers objections. Different traditions and thinkers offer competing positions; a useful introduction presents those positions in context rather than treating one answer as universally settled.",concepts:["Argument","Premise","Conclusion","Objection"],example:"For the question 'What makes a decision fair?', first define fairness, state a reason for a proposed answer, then consider who might be disadvantaged by it.",source:"Stanford Encyclopedia of Philosophy",url:"https://plato.stanford.edu/",related:["Socrates and the Art of Questioning","The Philosophy of Justice","Critical Thinking"]},
    {category:categories[1],title:"Stoicism and Everyday Life",level:"Beginner",minutes:7,intro:"Stoicism is an ancient philosophical tradition with diverse texts and interpretations. It explores judgment, virtue, responsibility, and how to respond to circumstances.",lesson:"Stoic writers distinguish what is within a person's agency from what is not, while emphasizing ethical action and consideration of other people. This is a philosophical practice, not a promise to suppress emotions or a substitute for mental-health care.",concepts:["Virtue","Judgment","Agency","Ethical action"],example:"Before a challenging task, someone might separate the preparation they can do from an outcome they cannot fully control, then decide what responsible next step to take.",source:"Stanford Encyclopedia of Philosophy: Stoicism",url:"https://plato.stanford.edu/entries/stoicism/",related:["The Philosophy of Happiness","Emotional Awareness","Ethics of Everyday Choices"]},
    {category:categories[2],title:"The Indus Valley Civilization",level:"Beginner",minutes:7,intro:"The Indus Valley, or Harappan, civilization flourished in parts of what are now Pakistan and northwestern India during the third and early second millennium BCE.",lesson:"Archaeological sites such as Harappa and Mohenjo-daro reveal planned settlements, craft production, and long-distance connections. The Indus script remains undeciphered, so many interpretations of political and social life remain uncertain. Archaeological evidence should be distinguished from speculation.",concepts:["Archaeology","Urban planning","Material culture","Undeciphered script"],example:"A drainage feature at an excavated site can support a claim about infrastructure, but by itself cannot tell us exactly how every resident understood civic life.",source:"Harappa Archaeological Research Project",url:"https://www.harappa.com/",related:["Ancient Trade Routes","History of Mathematics","Urban Planning"]},
    {category:categories[3],title:"Understanding Poetry",level:"Beginner",minutes:6,intro:"Poetry uses sound, rhythm, imagery, line, and compression in many different cultural and literary traditions.",lesson:"A close reading begins with what is on the page: repeated sounds, word choice, images, line breaks, and shifts in voice. Interpretations can differ, but strong readings connect their claims to details in the poem and its context. No single checklist applies to every poetic form.",concepts:["Imagery","Lineation","Rhythm","Speaker"],example:"If a poem repeats a particular image, consider how its meaning changes across the poem before deciding what it represents.",source:"Poetry Foundation: Learning",url:"https://www.poetryfoundation.org/learn",related:["Literary Devices","Metaphors and Symbols","Creative Writing"]},
    {category:categories[4],title:"The Science of Sleep",level:"Beginner",minutes:7,intro:"Sleep is a recurring biological state important to health. Sleep patterns and needs vary with age, health, work, culture, and individual circumstances.",lesson:"Sleep includes multiple stages that cycle across the night. Circadian timing and accumulated sleep pressure both influence sleep. Educational information cannot diagnose sleep disorders; persistent difficulties that affect daily life are a reason to consult a qualified health professional.",concepts:["Circadian rhythm","Sleep stages","Sleep pressure","Sleep hygiene"],example:"A regular wind-down routine may be helpful for some people, but shift work, caregiving, health, and living conditions can limit what is practical.",source:"National Heart, Lung, and Blood Institute: Sleep",url:"https://www.nhlbi.nih.gov/health/sleep",related:["Human Nervous System","Science of Stress","Health Literacy"]},
    {category:categories[6],title:"Biophilic Design",level:"Beginner",minutes:7,intro:"Biophilic design explores ways to connect built environments with nature. Approaches can include daylight, views, natural materials, and plant life when suitable and accessible.",lesson:"Design strategies should respond to climate, maintenance, allergies, accessibility, cost, and the people who use a place. Research on environmental preferences does not guarantee a particular health outcome for every person or project.",concepts:["Nature connection","Daylight","Access","Context-sensitive design"],example:"A renter might add a low-maintenance plant or use a view to an outdoor area, while someone with plant allergies might choose natural imagery or simply prioritize fresh air and daylight.",source:"U.S. General Services Administration: Biophilic design",url:"https://www.gsa.gov/real-estate/design-and-construction/landscape-architecture/biophilic-design",related:["Environmental Psychology","Lighting and Human Well-being","Sustainable Architecture"]},
    {category:categories[14],title:"The Science of Climate Change",level:"Beginner",minutes:8,intro:"Earth's climate changes naturally, and human activities—especially greenhouse-gas emissions—are the dominant cause of the warming observed since the mid-20th century.",lesson:"Climate science combines observations, physical theory, and models. Scientists distinguish weather from climate and communicate uncertainty as a range, not as evidence that nothing is known. Impacts differ by region and interact with infrastructure, ecosystems, and social conditions.",concepts:["Greenhouse effect","Climate and weather","Emissions","Climate impacts"],example:"A local heat-risk plan can combine temperature records, shade access, public health information, and community knowledge rather than relying on one global average.",source:"NASA: Climate change evidence",url:"https://climate.nasa.gov/evidence/",related:["Renewable Energy","Environmental Studies","Sustainable Cities"]}
  ];
  function renderArticles(){
    const q=$("learnSearch").value.toLowerCase(),filter=$("learnFilter").value,level=$("learnLevel").value;
    const matching=articles.filter(a=>(!filter||a.category===filter)&&(!level||a.level===level)&&(!q||`${a.category} ${a.title} ${a.intro}`.toLowerCase().includes(q)));
    $("learnCount").textContent=`${matching.length} published learning modules · ${articles.length} total across ${new Set(articles.map(article=>article.category)).size} subjects`;
    $("learnList").innerHTML=matching.map(a=>`<article class="feature-card learning-card"><p class="eyebrow">${escapeHtml(a.category)}</p><h2>${escapeHtml(a.title)}</h2><p>${escapeHtml(a.intro)}</p><div class="lesson-meta"><span>${a.minutes} min</span><span>${a.level}</span></div><div class="lesson-actions"><button class="text-button" data-open-topic="${escapeHtml(a.title)}">Open module →</button><button class="text-button" data-save-topic="${escapeHtml(a.title)}" aria-label="Save ${escapeHtml(a.title)}">♡ Save</button></div></article>`).join("")||`<article class="panel"><p>No published modules match these filters yet. Try another subject or search.</p></article>`;
    document.querySelectorAll("[data-open-topic]").forEach(button=>button.addEventListener("click",()=>renderLesson(articles.find(a=>a.title===button.dataset.openTopic))));
    document.querySelectorAll("[data-save-topic]").forEach(button=>button.addEventListener("click",async()=>{const article=articles.find(a=>a.title===button.dataset.saveTopic);const item={id:`topic-${article.title.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,title:article.title,category:article.category,kind:"learning-topic",url:article.url};await saveDocument("archive",item.id,item);state.archive.unshift(item);toast("Topic saved to your archive");}));
  }
  function renderLesson(article){
    routeContent.innerHTML=`<button id="backToTopics" class="text-button">← All topics</button>${pageHeading(escapeHtml(article.category),escapeHtml(article.title),`${article.minutes} minute read · ${article.level}`)}
      <article class="lesson-layout"><div class="lesson-main"><section class="lesson-section"><p class="eyebrow">Introduction</p><p>${escapeHtml(article.intro)}</p></section><section class="lesson-section"><p class="eyebrow">Explore the idea</p><p>${escapeHtml(article.lesson)}</p></section><section class="lesson-section"><p class="eyebrow">Key concepts</p><ul>${article.concepts.map(term=>`<li><strong>${escapeHtml(term)}</strong></li>`).join("")}</ul></section><section class="lesson-section"><p class="eyebrow">Everyday example</p><p>${escapeHtml(article.example)}</p></section><section class="lesson-section"><details><summary>Optional knowledge check</summary><p>Try answering these in your own words. This reflection is not graded.</p><ol><li>How would you explain ${escapeHtml(article.title)} in one or two sentences?</li><li>Which two key concepts from this lesson are most useful, and why?</li><li>What example from your own experience connects to this topic?</li><li>What evidence would help you check an assumption about this topic?</li><li>What question would you like to explore next?</li></ol></details></section><section class="lesson-section"><p class="eyebrow">Further reading</p><p>This introduction is a starting point. Consult the linked reference and related topics for deeper exploration.</p><a class="tile-link" href="${article.url}" target="_blank" rel="noopener">Reference: ${escapeHtml(article.source)} ↗</a></section></div><aside class="lesson-aside"><p class="eyebrow">Continue exploring</p>${article.related.map(title=>`<button class="related-topic" data-related="${escapeHtml(title)}">${escapeHtml(title)} →</button>`).join("")}<button id="completeTopicBtn" class="primary-button">Mark as explored</button></aside></article>`;
    $("backToTopics").addEventListener("click",renderLearn);
    $("completeTopicBtn").addEventListener("click",async()=>{const item={id:`learned-${article.title.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,title:article.title,category:article.category,kind:"completed-reading",completedAt:Date.now()};await saveDocument("archive",item.id,item);state.archive.unshift(item);toast("Added to your learning history");});
    document.querySelectorAll("[data-related]").forEach(button=>button.addEventListener("click",()=>{const related=articles.find(item=>item.title===button.dataset.related);if(related)renderLesson(related);else toast("That module is not published yet");}));
  }
  $("learnSearch").addEventListener("input",renderArticles);$("learnFilter").addEventListener("change",renderArticles);$("learnLevel").addEventListener("change",renderArticles);renderArticles();
}

function renderJournal() {
  routeContent.innerHTML=`${pageHeading("Your private thoughts","Journal","Stored in your account and private by default.")}
    <div class="toolbar"><input id="journalSearch" type="search" placeholder="Search entries"><select id="journalCategory"><option value="">All categories</option><option>Reflection</option><option>Memory</option><option>Ideas</option><option>Learning</option><option>Gratitude</option></select><button id="newEntryBtn" class="primary-button">New entry</button></div>
    <section id="journalArea"></section>`;
  $("newEntryBtn").addEventListener("click",()=>openEntryEditor());
  $("journalSearch").addEventListener("input",renderEntries);$("journalCategory").addEventListener("change",renderEntries);renderEntries();
  function renderEntries(){
    const q=$("journalSearch").value.toLowerCase(),category=$("journalCategory").value;
    const filtered=state.entries.filter(e=>(!category||e.category===category)&&(!q||`${e.title} ${e.body}`.toLowerCase().includes(q))).sort((a,b)=>(b.updated||0)-(a.updated||0));
    $("journalArea").innerHTML=filtered.length?`<div class="entry-list">${filtered.map(e=>`<article class="entry-card" data-entry="${e.id}"><h3>${escapeHtml(e.title||"Untitled")}</h3><p>${escapeHtml((e.body||"").slice(0,180))}</p><small>${escapeHtml(e.category||"Reflection")}</small></article>`).join("")}</div>`:`<article class="panel"><h2>A quiet page</h2><p>Create a journal entry when you are ready.</p></article>`;
    document.querySelectorAll("[data-entry]").forEach(card=>card.addEventListener("click",()=>openEntryEditor(state.entries.find(e=>e.id===card.dataset.entry))));
  }
  function openEntryEditor(entry={}) {
    $("journalArea").innerHTML=`<section class="editor"><label>Title<input id="entryTitle" value="${escapeHtml(entry.title||"")}"></label><label>Category<select id="entryCategory"><option ${entry.category==="Reflection"?"selected":""}>Reflection</option><option ${entry.category==="Memory"?"selected":""}>Memory</option><option ${entry.category==="Ideas"?"selected":""}>Ideas</option><option ${entry.category==="Learning"?"selected":""}>Learning</option><option ${entry.category==="Gratitude"?"selected":""}>Gratitude</option></select></label><textarea id="entryBody" aria-label="Journal entry">${escapeHtml(entry.body||"")}</textarea><div class="dialog-actions"><button id="deleteEntryBtn" class="danger-button" ${entry.id?"":"hidden"}>Delete</button><button id="cancelEntryBtn" class="secondary-button">Back</button><button id="saveEntryBtn" class="primary-button">Save entry</button></div></section>`;
    let timer; $("entryBody").addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>saveEntry(false),900)});
    $("saveEntryBtn").addEventListener("click",()=>saveEntry(true));$("cancelEntryBtn").addEventListener("click",renderEntries);
    $("deleteEntryBtn").addEventListener("click",async()=>{if(!confirm("Delete this private entry?"))return;await deleteDocument("entries",entry.id);state.entries=state.entries.filter(e=>e.id!==entry.id);renderEntries();});
    async function saveEntry(show){const data={id:entry.id||crypto.randomUUID(),title:$("entryTitle").value.trim(),category:$("entryCategory").value,body:$("entryBody").value,updated:Date.now(),created:entry.created||Date.now()};await saveDocument("entries",data.id,data);const index=state.entries.findIndex(e=>e.id===data.id);index>=0?state.entries[index]=data:state.entries.push(data);entry=data;if(show){toast("Entry saved");renderEntries();}}
  }
}

function renderCreate() {
  routeContent.innerHTML=`${pageHeading("Your creative workspace","Create","Give unfinished ideas somewhere to live.")}
    <div class="toolbar"><input id="draftSearch" type="search" placeholder="Search drafts"><button id="newDraftBtn" class="primary-button">New project</button></div><section id="draftArea" class="entry-list"></section>`;
  $("newDraftBtn").addEventListener("click",()=>openDraft({}));
  $("draftSearch").addEventListener("input",()=>renderDrafts());renderDrafts();
  function renderDrafts(){const q=$("draftSearch").value.toLowerCase();const filtered=state.drafts.filter(d=>`${d.title} ${d.body}`.toLowerCase().includes(q));$("draftArea").innerHTML=filtered.length?filtered.map(d=>`<article class="entry-card" data-draft="${d.id}"><h3>${escapeHtml(d.title||"Untitled project")}</h3><p>${escapeHtml((d.body||"").slice(0,180))}</p></article>`).join(""):`<article class="panel"><h2>Start with a shape</h2><p>A poem, story, essay, or collection of ideas can begin with a few lines.</p></article>`;document.querySelectorAll("[data-draft]").forEach(card=>card.addEventListener("click",()=>openDraft(state.drafts.find(d=>d.id===card.dataset.draft))));}
  function openDraft(draft){
    $("draftArea").innerHTML=`<section class="editor"><label>Project title<input id="draftTitle" value="${escapeHtml(draft.title||"")}"></label><label>Format<select id="draftFormat"><option ${draft.format==="Poetry"?"selected":""}>Poetry</option><option ${draft.format==="Story"?"selected":""}>Story</option><option ${draft.format==="Essay"?"selected":""}>Essay</option><option ${draft.format==="Brainstorm"?"selected":""}>Brainstorm</option></select></label><textarea id="draftBody" aria-label="Creative text">${escapeHtml(draft.body||"")}</textarea><div class="dialog-actions"><button id="deleteDraftBtn" class="danger-button" ${draft.id?"":"hidden"}>Delete</button><button id="cancelDraftBtn" class="secondary-button">Back</button><button id="saveDraftBtn" class="primary-button">Save draft</button></div></section>`;
    $("saveDraftBtn").addEventListener("click",async()=>{const data={id:draft.id||crypto.randomUUID(),title:$("draftTitle").value.trim(),format:$("draftFormat").value,body:$("draftBody").value,updated:Date.now()};await saveDocument("drafts",data.id,data);const i=state.drafts.findIndex(d=>d.id===data.id);i>=0?state.drafts[i]=data:state.drafts.push(data);toast("Draft saved");renderDrafts();});
    $("cancelDraftBtn").addEventListener("click",renderDrafts);$("deleteDraftBtn").addEventListener("click",async()=>{await deleteDocument("drafts",draft.id);state.drafts=state.drafts.filter(d=>d.id!==draft.id);renderDrafts();});
  }
}

function renderSpaces() {
  routeContent.innerHTML=`${pageHeading("Your physical environment","Spaces","Practical design ideas for renters, shared homes, small rooms, and different budgets.")}`
    +`<section class="panel"><h2>Room concept</h2><form id="roomForm" class="room-form"><label>Room type<select id="roomType"><option>Bedroom</option><option>Study</option><option>Living room</option><option>Kitchen</option><option>Shared space</option></select></label><label>Approximate dimensions<input id="roomSize" placeholder="e.g. 4 × 3 metres"></label><label>Natural light<select id="roomLight"><option>Low</option><option>Moderate</option><option>Bright</option></select></label><label>Preferred atmosphere<select id="roomAtmosphere"><option>Calm</option><option>Focused</option><option>Social</option><option>Restful</option></select></label><label>Budget range<select id="roomBudget"><option>Low cost</option><option>Mid range</option><option>Flexible</option></select></label><label>Key need<input id="roomNeed" placeholder="Storage, accessibility, quiet..."></label></form><button id="saveRoomBtn" class="primary-button" style="margin-top:16px">Save room concept</button><div id="roomResult" class="room-result"></div></section>`;
  $("saveRoomBtn").addEventListener("click",async()=>{const data={id:crypto.randomUUID(),type:$("roomType").value,size:$("roomSize").value,light:$("roomLight").value,atmosphere:$("roomAtmosphere").value,budget:$("roomBudget").value,need:$("roomNeed").value,updated:Date.now()};await saveDocument("rooms",data.id,data);state.rooms.push(data);renderRoomResult(data);toast("Room concept saved");});
  if(state.rooms.length)renderRoomResult(state.rooms[state.rooms.length-1]);
  function renderRoomResult(room){$("roomResult").innerHTML=`<article class="panel"><h3>${escapeHtml(room.type)} concept</h3><p><strong>Light:</strong> ${escapeHtml(room.light)}. Use glare control and one warm ambient layer. Keep any strong lighting claim separate from guaranteed physiological effects.</p><p><strong>Atmosphere:</strong> ${escapeHtml(room.atmosphere)}. Consider a clear circulation path, flexible storage, and materials that suit the existing building.</p><p><strong>Budget:</strong> ${escapeHtml(room.budget)}. Prioritize movable, repairable changes you are allowed to make.</p><div class="palette"><span style="background:#f4f0e6"></span><span style="background:#aebca8"></span><span style="background:#17382b"></span><span style="background:#b86f52"></span></div></article>`;}
}

function renderGrowth() {
  routeContent.innerHTML=`${pageHeading("Personal development","My Growth","Goals and reflection are optional. Missed intentions do not need to become a measure of worth.")}<div class="toolbar"><input id="goalTitle" placeholder="A goal to work toward"><button id="addGoalBtn" class="primary-button">Add goal</button></div><section id="goalList" class="entry-list"></section><section class="panel" style="margin-top:18px"><h2>Weekly reflection</h2><p>What did you learn? What did you try? What would feel useful next week?</p><textarea id="weeklyReflection" placeholder="A short, private summary">${escapeHtml(state.profile.weeklyReflection||"")}</textarea><button id="saveWeeklyBtn" class="primary-button" style="margin-top:8px">Save reflection</button></section>`;
  $("addGoalBtn").addEventListener("click",async()=>{const title=$("goalTitle").value.trim();if(!title)return;const goal={id:crypto.randomUUID(),title,completed:false,updated:Date.now()};await saveDocument("goals",goal.id,goal);state.goals.push(goal);renderGoals();});
  $("saveWeeklyBtn").addEventListener("click",async()=>{state.profile.weeklyReflection=$("weeklyReflection").value;await saveDocument("profile","main",{weeklyReflection:$("weeklyReflection").value});toast("Weekly reflection saved");});renderGoals();
  function renderGoals(){ $("goalList").innerHTML=state.goals.length?state.goals.map(g=>`<article class="intention ${g.completed?"complete":""}"><input type="checkbox" data-goal-check="${g.id}" ${g.completed?"checked":""}><label>${escapeHtml(g.title)}</label><button data-goal-delete="${g.id}" aria-label="Remove goal">×</button></article>`).join(""):`<article class="panel"><h2>No goal yet</h2><p>A goal can be learning, reading, organizing, creating, resting, or caring for something important.</p></article>`;document.querySelectorAll("[data-goal-check]").forEach(box=>box.addEventListener("change",async()=>{const g=state.goals.find(x=>x.id===box.dataset.goalCheck);g.completed=box.checked;await saveDocument("goals",g.id,g);renderGoals();}));document.querySelectorAll("[data-goal-delete]").forEach(btn=>btn.addEventListener("click",async()=>{await deleteDocument("goals",btn.dataset.goalDelete);state.goals=state.goals.filter(g=>g.id!==btn.dataset.goalDelete);renderGoals();}));}
}

function renderArchive() {
  routeContent.innerHTML=`${pageHeading("Your personal universe","My Archive","Saved affirmations, ideas, memories, and completed work.")}<div class="toolbar"><input id="archiveSearch" type="search" placeholder="Search archive"></div><section id="archiveGrid" class="archive-grid"></section>`;
  $("archiveSearch").addEventListener("input",renderItems);renderItems();
  function renderItems(){const q=$("archiveSearch").value.toLowerCase();const items=[...state.archive,...state.captured.map(x=>({...x,title:"Captured idea",kind:"idea"})),...state.rooms.map(x=>({...x,title:`${x.type} room concept`,kind:"room"}))].filter(i=>`${i.title||i.text||""} ${i.body||""} ${i.poll?.question||""} ${i.category||i.kind||""}`.toLowerCase().includes(q));$("archiveGrid").innerHTML=items.length?items.map(i=>`<article class="archive-item"><p class="eyebrow">${escapeHtml(i.category||i.kind||"Saved")}</p><h3>${escapeHtml(i.title||i.text||"Saved item")}</h3>${i.body?`<p>${escapeHtml(i.body)}</p>`:""}${i.poll?`<p><strong>Poll:</strong> ${escapeHtml(i.poll.question)} · ${i.poll.options.map(escapeHtml).join(" / ")}</p>`:""}</article>`).join(""):`<article class="panel"><h2>Nothing saved yet</h2><p>Affirmations, room concepts, and quick captures will appear here.</p></article>`;}
}

const renderers={home:renderHome,discover:renderDiscover,profile:renderProfile,learn:renderLearn,connections:renderConnections,journal:renderJournal,create:renderCreate,spaces:renderSpaces,growth:renderGrowth,archive:renderArchive,assessment:renderAssessment,quiz:renderQuiz,archetype:renderArchetypeResult,"color-analysis":renderColorAnalysisPage,"room-analysis":renderRoomAnalysisPage};

$("profileBtn").addEventListener("click",()=>location.hash="profile");
$("moreBtn").addEventListener("click",()=>{$("moreDialog").showModal();});
document.querySelectorAll(".more-grid a").forEach(link=>link.addEventListener("click",()=>$("moreDialog").close()));
$("brandHome").addEventListener("click",()=>location.hash="home");$("mobileBrand").addEventListener("click",()=>location.hash="home");
$("collapseBtn").addEventListener("click",()=>{$("sidebar").classList.toggle("collapsed");$("mainContent").classList.toggle("sidebar-collapsed");});

onAuthStateChanged(auth,async(user)=>{
  currentUser=user;
  if(!user){$("loadingScreen").hidden=true;$("appView").hidden=true;$("authView").hidden=false;authMode("login");return;}
  $("authView").hidden=true;$("appView").hidden=true;
  try {
    await loadState();
  } catch (error) {
    $("loadingScreen").hidden=true;
    toast("Could not restore your profile: " + error.message);
    return;
  }
  const hasCompletedAssessment = state.profile.onboardingComplete === true
    || (Array.isArray(state.profile.archetypeTopThree) && state.profile.archetypeTopThree.length > 0);
  $("loadingScreen").hidden=true;$("appView").hidden=false;
  if(!hasCompletedAssessment&&(!location.hash||location.hash==="#home"))location.hash="assessment";
  navigate();
});
