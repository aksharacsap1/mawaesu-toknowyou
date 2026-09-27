# MAWAESU-TKY
To know you, To be a Better you.  

## Firebase Hosting deployment

The GitHub Actions workflow deploys the static site in `public/` to Firebase
Hosting after every push to `main`. The production URL is
`https://mawaesu-toknowyou.web.app/`.

The SEO generation script uses `SITE_URL` when set and otherwise defaults to
the production URL. It generates `public/robots.txt` and `public/sitemap.xml`.
The canonical and social metadata in `public/index.html` use the same
production URL. The favicon and social sharing image are `public/logo.png`.

Commit and push changes to `main` to trigger deployment.
