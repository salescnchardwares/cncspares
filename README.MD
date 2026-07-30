# CNC Spares Sell

CNC Spares Sell is a small Node.js / Express web application for selling CNC machine spare parts, handling enquiries, and managing an admin dashboard. It serves EJS views from the `views/` folder and stores data in JSON files under `data/`.

## Features

- Public site with home, products, contact, and enquiry pages
- Admin login and dashboard for managing spares, orders, and company settings
- File upload support for contact enquiry attachments
- Email notifications via SMTP when enquiries are submitted
- Order export to CSV for admin users

## Requirements

- Node.js 18 or newer
- npm
- Git (optional)

## Installation

1. Clone or download the repository.
2. Open a terminal in the project root.
3. Install dependencies:

```bash
npm install
```

## Run Locally

Start the app with:

```bash
npm run dev
```

Then open `http://localhost:3000` in your browser.

## Vercel Deployment

This app can be hosted on Vercel as a Serverless Node.js app.

### Recommended setup

1. Ensure you have a Vercel account and the Vercel CLI installed.
2. In the project root, create a `vercel.json` file if needed for custom configuration (optional).
3. Deploy with:

```bash
vercel --prod
```

### Environment variables

Set the following environment variables in Vercel for production use:

- `SESSION_SECRET` — secret for session cookies
- `SMTP_HOST` — SMTP hostname for email delivery
- `SMTP_PORT` — SMTP port, default `587`
- `SMTP_SECURE` — `true` or `false`
- `SMTP_USER` — SMTP username
- `SMTP_PASS` — SMTP password
- `MAIL_FROM` — sender email address
- `ADMIN_PASSWORD` — admin password for dashboard login
- `CLOUDINARY_CLOUD_NAME` — Cloudinary cloud name if using remote image uploads
- `CLOUDINARY_UPLOAD_PRESET` — Cloudinary upload preset

> Note: The app writes JSON files to `data/` at runtime. For production deployments, use an external database or persistent storage integration when needed.

## Single Command for Frontend and Backend

This repository is a single Express application serving both frontend and backend from one codebase. Use the same command to run everything locally:

```bash
npm run dev
```

## Project Structure

- `server.js` — application entrypoint
- `package.json` — project metadata and scripts
- `views/` — EJS templates for pages and admin views
- `public/` — static assets and CSS
- `data/` — JSON files for settings, spares, and enquiries

## Notes

- The app uses file-based JSON storage and is best for prototypes or small deployments.
- Update the `data/settings.json` values or set environment variables to configure company details, emails, and Cloudinary integration.
