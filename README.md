# CampusCare

CampusCare is a campus service reporting and complaint-tracking app for Dhaanish I Tech College.

## Run locally

1. Install [Node.js](https://nodejs.org/).
2. From this directory, run `npm install`.
3. Run `node server.js`.
4. Open <http://127.0.0.1:3000>.

Locally, complaint and rating data is stored in `data/` and excluded from Git. On Vercel, connect a **private Vercel Blob store** to the project so records are stored durably and privately. The API intentionally returns only limited complaint details.

## Deploy to Vercel

Import this GitHub repository into Vercel. In the Vercel project, create and connect a **private** Blob store for Production and Preview, then redeploy. The API is served as Vercel Functions; static pages and assets are served directly by Vercel.
