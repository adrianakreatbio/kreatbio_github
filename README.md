# KreatBio Website (Export)

This repository contains:

- `kreatbio-public-v4/` (current public site)
- `.github/workflows/deploy-kreatbio-pages.yml` (GitHub Pages deploy workflow)

## Deploy

The workflow deploys the `kreatbio-public-v4` folder to GitHub Pages.

-----

| Step                             | Where                                               | Role                                          |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| 1. Upload latest `index.html`    | Website hosting root folder                         | Updates the actual website content            |
| 2. Keep Google verification file | Same folder as `index.html`                         | Keeps Search Console ownership verified       |
| 3. Request indexing              | Search Console → URL Inspection                     | Tells Google to re-check the homepage         |
| 4. Submit sitemap                | Search Console → Sitemaps                           | Helps Google find website pages               |
| 5. Check crawled page            | Search Console → URL Inspection → View Crawled Page | Confirms what Google actually sees            |
| 6. Update business profile       | Google Business Profile                             | Updates right-side Google company panel       |
| 7. Wait for search update        | Google Search                                       | Google refreshes title/snippet after crawling |
