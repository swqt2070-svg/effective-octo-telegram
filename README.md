# Local Signal-like E2E Messenger (Web + Multi-device)

This project is a local Telegram-web-like messenger with end-to-end encryption using the Signal Protocol (libsignal-protocol).
It supports:
- Login/password auth
- First user becomes Admin automatically
- Invite codes for further registrations
- Admin panel (users + invites)
- Multi-device (each user can register multiple devices)
- E2E encryption per device (fan-out to each recipient device)
- QR login (desktop shows QR, phone approves)

## Requirements (Ubuntu 22.04)
- Docker + docker compose plugin
- Node.js 20+ (recommended via nvm)
- npm

## 1) Start Postgres
```bash
cd signal-web-local
docker compose up -d
```

## 2) Backend setup
```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Backend will run on: http://localhost:3001

## 3) Frontend setup
```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

Frontend will run on: http://localhost:5173

## First run flow
1. Open the frontend and register the first user (no invite code needed). This user becomes **Admin**.
2. Go to **Admin** and create invite codes.
3. Register friends with invite codes.
4. Each device prompts to create a device profile and generates Signal keys locally.
5. Start a chat by username or user id.

## Notes / Security
- The server stores only encrypted message envelopes. Plaintext never leaves the client.
- If you lose the browser storage for a device, that device loses its identity keys and will look like a new device.
- Verify identities (safety numbers) are not implemented in UI (can be added).

## Useful commands
Backend:
- `npm run dev` - dev server
- `npm run start` - prod
- `npm run prisma:studio` - DB UI

Frontend:
- `npm run dev` - dev server
- `npm run build` - production build

## Production (Docker)
Create a `.env` file in the repo root based on `deploy.env.example`, then run:
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

Frontend will be on port 80, backend on port 3001.
