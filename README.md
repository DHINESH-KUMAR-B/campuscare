# CampusCare

CampusCare is a campus service reporting and complaint-tracking app for Dhaanish I Tech College.

The separate college portal is available at `/college.html`. Its student area links to concern submission and tracking; the college overview reads aggregate complaint and rating totals from the API. The portal currently has no sign-in, so its staff overview is public and read-only, with no individual report details. Do not use it as a private staff case-management system until authentication and role-based access are implemented.

## Run locally

1. Install [Node.js](https://nodejs.org/).
2. From this directory, run `npm install`.
3. Run `npm start`.
4. Open <http://127.0.0.1:3000>.

Locally, complaint and rating data is stored in `data/` and excluded from Git. On Vercel, connect a **private Vercel Blob store** to the project so records are stored durably and privately. The API intentionally returns only limited complaint details.

## Deploy to Vercel

Import this GitHub repository into Vercel. In the Vercel project, create and connect a **private** Blob store for Production and Preview, then redeploy. The API is served as Vercel Functions; static pages and assets are served directly by Vercel.
