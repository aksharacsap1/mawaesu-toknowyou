<p align="center">
  <img src="https://[your-firebase-app-name].web.app/logo.png" width="200" alt="Mawaesu Logo">
</p>

# Mawaesu

## About the Project

Mawaesu explores the intersection of Architectural Psychology and Digital Space, including how digital layouts, interfaces, and virtual environments can influence cognition, emotion, and behaviour. The project creates a digital experience for self-discovery and personal growth.

Key areas of exploration include:
* Spatial cognition: How users navigate, map, and perceive boundaries within a digital environment.
* Environmental affect: The emotional impact of digital layouts, scale, and visual hierarchy.

## Creator

Charitha Sai Akshara Pokuri

## Usage

Mawaesu is hosted on Firebase at [mawaesu-toknowyou.web.app](https://mawaesu-toknowyou.web.app/). The GitHub Actions workflow deploys the static site in `public/` to Firebase Hosting after a push to `main`.

The SEO generation script uses `SITE_URL` when set and otherwise defaults to the production URL. It generates `public/robots.txt` and `public/sitemap.xml`.

## Community features

After saving a profile, signed-in members land on a notes-first home feed with bottom tabs for Home, Search, Chats, and Profile. Profiles persist a display name, username, bio, and selectable illustrated avatar. Search returns username-prefix suggestions, opens public profiles with Notes and Featured tabs, and supports connection requests; there are no follower or following lists. Notes have an optional title, reading-focused body, author identity, and timestamp; polls, likes, and comments are supported. Photo/video uploads are intentionally not offered, so the app does not require Firebase Storage. Members can save privately or feature another member's note without changing its original ownership; saved notes are only rendered in the signed-in member's own profile. Chats show the latest locally decrypted message and timestamp, with a private read marker for unread status. Direct and anonymous-chat messages are encrypted in the browser with ECDH P-256, HKDF-SHA-256, and AES-256-GCM before being sent to Firebase. Random chats use temporary aliases and expire after five minutes. Blocking, written-detail reports, temporary random-chat restrictions, bans, and in-app appeals are enforced by Firebase Functions and Security Rules.

The profile page contains the member's own notes, featured notes, and privately saved notes, plus shortcuts to the self-discovery quiz, results, private room-description planner, and daily affirmation. Deactivation hides the public profile and pauses use until the member signs in again; an owner-only status check lets the app reactivate on a different device without calling Functions for every ordinary sign-in. Account deletion requires a recent sign-in and removes the member's profile, authored notes, saved/featured notes, reactions and poll votes, direct chats, and related connections; submitted safety reports may be retained for moderation.

The community uses a light sage-and-ivory theme with the supplied meadow and pond images as decorative accents. The original image files are copied unchanged into `public/images/`.

Message private keys are non-extractable browser keys kept in IndexedDB on the current device; they are not backed up or synchronized. Clearing browser data or changing devices can make old conversations unreadable. Members should compare the displayed key fingerprints through another trusted channel to detect key substitution. Firebase receives ciphertext and metadata for direct and random chats, not their plaintext. Public notes and their comments, reactions, polls, and media are public to signed-in community members.

The app serves an archetype-informed affirmation once per UTC day. The room planner uses the user's chosen archetype and a room description to build a practical, paced task plan in the browser; the description is neither uploaded nor stored with the plan. The plan and task progress are saved to the signed-in user's private Firestore subcollection. The planner does not scan images, use Vertex AI, or claim to visually assess the room.

## Firebase deployment

Social features require Cloud Functions, Firestore, and Firestore indexes in addition to Hosting. The app uses no Firebase Storage or third-party media hosting. Reports collect written details rather than screenshot uploads. Configure the Firebase project and billing for Cloud Functions, then install the function dependencies and deploy the backend:

```sh
npm install --prefix functions
npx firebase-tools deploy --only hosting,functions,firestore:rules,firestore:indexes --project mawaesu-toknowyou
```

The existing merge workflow deploys Hosting; deploy the backend and rules before making the social UI available. Account restrictions are shown in the app when a member signs in. Appeals are recorded in Firestore for review and can also be emailed to [mawaesu.toknowyou@gmail.com](mailto:mawaesu.toknowyou@gmail.com). An administrator must have the Firebase Auth `admin` custom claim to review an in-app appeal and reinstate or uphold an account restriction. Automated outbound email delivery requires a separately configured mail service; none is configured in this repository.

## License

This project is proprietary. See the [LICENSE](LICENSE) file for details.
