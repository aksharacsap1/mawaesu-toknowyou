<p align="center">
  <img src="https://[your-firebase-app-name].web.app/logo.png" width="200" alt="Mawaesu Logo">
</p>

# Mawaesu

## About the Project

Mawaesu explores the intersection of Architectural Psychology and Digital Space, including how digital layouts, interfaces, and virtual environments can influence cognition, emotion, and behaviour. The project creates a digital experience for self-discovery and personal growth.

The application includes a persistent Firebase sign-in, a first-login self-discovery assessment, and separate Home, Discover, Learn, Connections, Journal, Create, Spaces, My Growth, My Archive, and Profile destinations. The Profile page includes account details, avatar and bio editing, preferences, and the saved archetype, colour palette, and room analysis. Learning modules are source-linked and designed to distinguish educational interpretation from clinical or scientific certainty. The first 20 Psychology and Human Behaviour lessons have been written and referenced. The complete 1,000-topic curriculum is being developed in sourced category batches; only finished modules are currently presented as lessons.

Key areas of exploration include:
* Spatial cognition: How users navigate, map, and perceive boundaries within a digital environment.
* Environmental affect: The emotional impact of digital layouts, scale, and visual hierarchy.

## Creator

Charitha Sai Akshara Pokuri

## Usage

Mawaesu is hosted on Firebase at [mawaesu-toknowyou.web.app](https://mawaesu-toknowyou.web.app/). The GitHub Actions workflow deploys the static site in `public/` to Firebase Hosting after a push to `main`.

The SEO generation script uses `SITE_URL` when set and otherwise defaults to the production URL. It generates `public/robots.txt` and `public/sitemap.xml`.

The assessment, quiz, archetype result, colour analysis, and room analysis are rendered as routes within the main application shell. Former assessment-page URLs are normalized to their matching in-app routes, and requests for `/legacy.html` redirect into the application. The archetype result includes a share-card preview with image download and native sharing where supported; colour swatches reveal accessible design notes and copyable HEX values, while room analysis adapts its wall, flooring, furniture, lighting, and four-part sensory profile to each of the 20 archetypes. Room guidance is offered as flexible design inspiration, not a prediction or clinical claim. Firebase Auth uses browser-local persistence; a user's first authenticated visit opens the assessment until a result is saved. Firestore and Storage rules are maintained in `firestore.rules` and `storage.rules`; deploy them to Firebase when publishing rule changes.

The Home page includes a public-notes feed where signed-in members can publish notes or polls, react, save notes to their private archive, and comment. Poll selections are stored without profile identifiers. These community posts are public to signed-in members and are separate from the private Journal.

Connections show bounded username-only suggestions after two characters, including prefix, contained, and close-spelling matches; selecting a result opens its public profile before an explicit request can be sent. Public profiles expose only a username, display name, and optional short bio. Connection sharing is limited to the curated daily affirmation; there is no chat, private-message, or custom-message feature. A user may also publish that daily affirmation to the signed-in MAWAESU community. The corresponding Firestore rules must be deployed before notes, polls, or social features are available in production.

Profile includes the account editor and built-in avatar choices, My Notes / Featured / Saved writing tabs, assessment tools, archetype, colour and room summaries, a daily affirmation, and account controls. Display name, bio, and selected built-in avatar are saved together. Usernames can be changed up to twice in any rolling 30-day period, enforced by Firestore rules. Saved community notes remain private to the signed-in user; Featured selections are also private. Full assessment and colour/room analyses open from the corresponding Profile links. Deactivation and deletion requests are recorded privately for administrator processing; they do not immediately deactivate or delete the account. Profile remains a full application destination, with navigation available on mobile and the MAWAESU home link on desktop.

## License

This project is proprietary. See the [LICENSE](LICENSE) file for details.
