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

After saving a profile, signed-in members land on a notes-first home feed with bottom tabs for Home, Search, Chats, and Profile. Profiles persist a display name, username, bio, and selectable illustrated avatar. Search returns username-prefix suggestions, opens public profiles with Notes and Featured tabs, and supports mutual connection requests; there are no follower or following lists. Notes have an optional title, reading-focused body, author identity, and timestamp; polls, likes, and comments are supported. Photo/video uploads are intentionally not offered, so the app does not require Firebase Storage. Members can save privately or feature another member's note without changing its original ownership; saved notes are only rendered in the signed-in member's own profile. Direct messages are encrypted in the browser with ECDH P-256, HKDF-SHA-256, and AES-256-GCM before being sent to Firebase. Accepted connections can open encrypted one-to-one chats. Blocking and written-detail safety reports are supported; reports and appeals require manual review.

The profile page contains the member's own notes, featured notes, and privately saved notes, plus shortcuts to the self-discovery quiz, results, private room-description planner, and daily affirmation. Deactivation hides access until the member signs in again, which reactivates the account. Account deletion is handled through a support email request for manual processing.

The community uses a light sage-and-ivory theme with the supplied meadow and pond images as decorative accents. The original image files are copied unchanged into `public/images/`.

Message private keys are non-extractable browser keys kept in IndexedDB on the current device; they are not backed up or synchronized. Clearing browser data or changing devices can make old conversations unreadable. Members should compare the displayed key fingerprints through another trusted channel to detect key substitution. Firebase receives ciphertext and metadata for direct chats, not their plaintext. Public notes and their comments, reactions, and polls are visible to signed-in community members.

The app serves an archetype-informed affirmation once per UTC day. The room planner uses the user's chosen archetype and a room description to build a practical, paced task plan in the browser; the description is neither uploaded nor stored with the plan. The plan and task progress are saved to the signed-in user's private Firestore subcollection. The planner does not scan images, use Vertex AI, or claim to visually assess the room.

## Firebase Spark deployment

The app does not deploy or call Cloud Functions, Firebase Storage, or Vertex AI. Core profile, username search, mutual connection, encrypted direct-chat, notes, polls, blocking, report submission, and deactivation workflows use Firebase Auth, Firestore client transactions, and Firestore Security Rules. Firebase Spark can host this configuration subject to the plan's current quotas. No service can guarantee unlimited free usage.

Deploy Hosting, rules, and indexes after configuring the Firebase project:

```sh
npx firebase-tools deploy --only hosting,firestore:rules,firestore:indexes --project mawaesu-toknowyou
```

Important Spark-plan limitations: anonymous matching is not offered; direct messaging is limited to accepted connections. Reports and appeals are stored for manual review; report thresholds, temporary suspensions, and bans are not applied automatically. Account deletion opens a support email request for manual processing. Client-side rules protect ordinary writes, but a client-only deployment cannot provide trusted rate limits or automated moderation. Reports accept written details only, not uploaded screenshots. The app uses no Firebase Storage or third-party media hosting.

Appeals are stored in Firestore for review and can also be emailed to [mawaesu.toknowyou@gmail.com](mailto:mawaesu.toknowyou@gmail.com). Moderation is performed manually from Firebase's administrative tools; there is no automated outbound email service or in-app moderation console in this repository.

## License

This project is proprietary. See the [LICENSE](LICENSE) file for details.
