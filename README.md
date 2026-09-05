# Paddle & Chill

Paddle & Chill is a pickleball court booking web app for managing court reservations, displaying live availability, and handling admin review and booking management. The application is built as a static front-end with serverless API routes for shared data access and protected admin operations.

## Overview

The platform supports:

- Public booking for court selection and time reservations
- Shared booking visibility across devices through server-backed data access
- Admin authentication with a secure password and token flow
- Booking status updates and removal from the admin dashboard
- Payment method and proof upload support during booking
- Schedule and day view for checking court availability

## Project structure

- `index.html` — public booking interface
- `admin.html` — admin login and booking dashboard
- `script.js` — public site logic, slot selection, calendar, and booking sync
- `admin.js` — admin authentication, table rendering, and management actions
- `styles.css` — core UI styling and responsive layout
- `api/` — Vercel serverless endpoints for shared booking data and admin actions

## Core API routes

The project uses server-side endpoints to avoid browser-local inconsistency and to ensure all devices see the same booking state.

- `api/bookings.js` — returns all booking records from Supabase
- `api/admin-login.js` — validates admin password and issues a token
- `api/admin-delete-booking.js` — deletes a single booking by ID
- `api/admin-update-status.js` — updates a booking status
- `api/_auth.js` — admin token creation and verification
- `api/_supabase.js` — service-role Supabase requests

## Environment variables

Set the following variables in the Vercel environment for production deployment:

- `ADMIN_PASSWORD` — password for admin login
- `ADMIN_TOKEN_SECRET` — secret used to sign admin tokens
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key for server-side operations

The app also expects the Supabase project table `bookings` to exist with the relevant fields used by the form and admin dashboard.

## Local development

This project is intended to run in a Vercel-compatible environment because the booking API routes live under `api/` and rely on server-side execution.

Recommended flow:

1. Install Vercel CLI if needed:
   ```bash
   npm install -g vercel
   ```
2. Run the project locally:
   ```bash
   vercel dev
   ```
3. Open the local app URL shown by Vercel.

Do not use a plain static file server for the full app, as the `/api/*` routes will not work there.

## Deployment

Deploy the project to Vercel with the required environment variables configured. The application will serve the public booking UI and the admin portal through the same project.

## Notes

- Booking state is intentionally synchronized from the server instead of relying on local storage as the source of truth.
- Admin actions are scoped to a specific booking ID to ensure only the selected record is changed or removed.
- Booking duration is calculated from the selected hours the user actually intends to play.
