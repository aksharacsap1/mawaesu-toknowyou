# MAWAESU-TKY
To know you, To be a Better you.  

## GitHub Pages deployment

The GitHub Actions workflow deploys the static site in `public/` after every
push to `main`. In the repository settings, enable **Pages** with **GitHub
Actions** as the build and deployment source.

Set the repository variable `SITE_URL` to the public HTTPS site URL before
deploying (for example, `https://OWNER.github.io/REPOSITORY/` or the custom
domain). The workflow uses it to generate `public/robots.txt` and
`public/sitemap.xml`. The canonical and social metadata in
`public/index.html` also use `https://your-domain.com/` placeholders; replace
those URLs with the same production URL before launch. Add `public/logo.png`
for the favicon and social sharing image.

To publish, commit and push your changes to `main`; each push starts a Pages
deployment. The existing Firebase Hosting workflow is retained and will also
deploy on pushes to `main`.
