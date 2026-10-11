# PulseChat

A full-stack real-time messaging application built with React, Node.js, Express, Socket.IO, MongoDB, and WebRTC.

> **Status:** Phase 2 complete — authentication, user profiles, and user search are working.

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| MongoDB Atlas | Free tier account |
| Cloudinary | Free tier account (Phase 5+) |

---

### 1. Clone and install

```bash
git clone <repo-url>
cd pulsechat
npm install           # installs root + client + server via workspaces
cd server && npm install
cd ../client && npm install
```

---

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Open `server/.env` and fill in:

```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/pulsechat?retryWrites=true&w=majority
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```

**Getting a MongoDB Atlas URI:**
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free cluster (M0)
3. Database Access → Add user with read/write permissions
4. Network Access → Add IP `0.0.0.0/0` for development
5. Connect → Drivers → copy the connection string

---

### 3. Run in development

Open two terminals:

```bash
# Terminal 1 — backend
cd server
npm run dev

# Terminal 2 — frontend
cd client
npm run dev
```

Or from the root:

```bash
npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend:**  http://localhost:5000
- **Health check:** http://localhost:5000/health

---

## Architecture

```
Browser ──HTTP/WS──► Vite Dev Server (proxy) ──► Express + Socket.IO
                                                         │
                                               MongoDB Atlas (Mongoose)
                                                         │
                                               Cloudinary (file storage)
```

- REST API for persistent data (auth, conversations, messages)
- Socket.IO for real-time events (messaging, presence, typing, calls)
- JWT in HTTP-only cookies — no token in JS/localStorage
- Cloudinary for all file storage

---

## Feature Progress

| Feature | Status |
|---------|--------|
| Project structure & design system | ✅ Complete |
| Light/dark theme | ✅ Complete |
| Registration & login | ✅ Complete |
| JWT HTTP-only cookie auth | ✅ Complete |
| Session restoration on refresh | ✅ Complete |
| Profile editing | ✅ Complete |
| Avatar upload | ✅ Complete (Cloudinary) |
| User search | ✅ Complete |
| Protected routes (frontend + backend) | ✅ Complete |
| Direct messaging (real-time) | ✅ Complete |
| Group chats | ✅ Complete |
| Typing indicators & presence | ✅ Complete |
| Read receipts & unread counts | ✅ Complete |
| Message reactions | ✅ Complete |
| Edit & delete messages | ✅ Complete |
| File sharing (images + documents) | ✅ Complete (Cloudinary) |
| In-app notifications | ✅ Complete |
| Browser notifications | ✅ Complete (permission required) |
| Toast notifications | ✅ Complete |
| Voice & video calls | ✅ Complete (WebRTC + Socket.IO signaling) |
| Deployment | 🔜 Phase 8 |

---

## API Reference

### Auth

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/v1/auth/register` | No | Create account |
| POST | `/api/v1/auth/login` | No | Sign in, sets cookie |
| POST | `/api/v1/auth/logout` | Yes | Clear cookie |
| GET | `/api/v1/auth/me` | Yes | Get current user (session restore) |
| GET | `/api/v1/auth/socket-token` | Yes | Get JWT for Socket.IO handshake |

### Users

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/v1/users/search?q=` | Yes | Search users |
| GET | `/api/v1/users/me` | Yes | Get own profile |
| PATCH | `/api/v1/users/me` | Yes | Update profile |
| POST | `/api/v1/users/me/avatar` | Yes | Upload avatar |
| GET | `/api/v1/users/:id` | Yes | Get user by ID |

### Conversations

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/v1/conversations` | Yes | List all conversations |
| POST | `/api/v1/conversations` | Yes | Create direct or group conversation |
| GET | `/api/v1/conversations/:id` | Member | Get single conversation |
| PATCH | `/api/v1/conversations/:id` | Admin | Update group name/description |
| POST | `/api/v1/conversations/:id/members` | Admin | Add members to group |
| DELETE | `/api/v1/conversations/:id/members/:userId` | Member/Admin | Leave or remove member |
| PATCH | `/api/v1/conversations/:id/members/:userId/role` | Admin | Promote/demote member |

### Messages

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/v1/conversations/:id/messages` | Member | Get messages (cursor pagination) |
| POST | `/api/v1/conversations/:id/messages` | Member | Send message (REST fallback) |
| PATCH | `/api/v1/conversations/:id/messages/:msgId` | Sender | Edit own message |
| DELETE | `/api/v1/conversations/:id/messages/:msgId` | Sender/Admin | Delete message |
| POST | `/api/v1/conversations/:id/messages/:msgId/react` | Member | Add/toggle emoji reaction |
| POST | `/api/v1/conversations/:id/attachments` | Member | Upload files (multipart, max 5) |

### Notifications

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/v1/notifications` | Yes | List notifications + unread count |
| PATCH | `/api/v1/notifications/read-all` | Yes | Mark all notifications read |
| PATCH | `/api/v1/notifications/:id/read` | Yes | Mark one notification read |
| DELETE | `/api/v1/notifications/:id` | Yes | Delete a notification |

### Socket.IO Events

| Direction | Event | Payload | Description |
|-----------|-------|---------|-------------|
| C→S | `conversation:join` | `{ conversationId }` | Join a conversation room |
| C→S | `conversation:leave` | `{ conversationId }` | Leave a conversation room |
| C→S | `message:send` | `{ conversationId, text, clientMsgId?, replyTo? }` | Send a message |
| C→S | `message:edit` | `{ messageId, conversationId, text }` | Edit own message |
| C→S | `message:delete` | `{ messageId, conversationId }` | Delete message |
| C→S | `message:react` | `{ messageId, conversationId, emoji }` | Toggle reaction |
| C→S | `message:typing_start` | `{ conversationId }` | User started typing |
| C→S | `message:typing_stop` | `{ conversationId }` | User stopped typing |
| C→S | `message:read` | `{ conversationId }` | Mark messages read |
| S→C | `message:new` | `{ message }` | New message broadcast |
| S→C | `message:updated` | `{ message }` | Message edited/reacted |
| S→C | `message:deleted` | `{ messageId, conversationId }` | Message deleted |
| S→C | `message:typing` | `{ conversationId, userId, typing }` | Typing indicator |
| S→C | `message:read_receipt` | `{ conversationId, userId, lastReadAt }` | Read receipt |
| S→C | `conversation:updated` | `{ conversationId, lastMessage, lastActivity }` | Sidebar refresh |
| S→C | `presence:init` | `{ onlineUserIds }` | Initial online users list |
| S→C | `presence:online` | `{ userId }` | User came online |
| S→C | `presence:offline` | `{ userId, lastSeen }` | User went offline |
| S→C | `notification:new` | `{ notification }` | New notification |

---

## Deployment

See Phase 8 for full deployment instructions.

- **Frontend:** Vercel (set `VITE_API_URL` env var to backend URL)
- **Backend:** Render (WebSocket-compatible, set all `.env` vars)
- **Database:** MongoDB Atlas (update `MONGODB_URI`)

---

## Interview Notes

- **Why HTTP-only cookies for JWT?** Prevents XSS attacks from reading the token via `document.cookie`. The trade-off is needing `withCredentials: true` on every Axios request.
- **Why Socket.IO over raw WebSockets?** Automatic reconnection, room management, fallback to polling, and a clean event-based API.
- **Why MongoDB?** Flexible document schema suits chat (messages have varying shapes — attachments, reactions, replies). Atlas gives us managed hosting with free tier.
- **clientMsgId (idempotency key):** Client generates a UUID before sending; server uses a sparse unique index to reject duplicates on retry, preventing duplicate messages.
- **Why Cloudinary for files?** Files are streamed directly from memory to Cloudinary without being written to disk. Private files are served from CDN with transformation support. Credentials stay server-side only.
- **How do notifications work?** When a message is saved, the server creates a `Notification` document for each recipient not in the room, then pushes it via `notification:new` to their personal `user:<id>` socket room. The client also shows a browser notification if the tab is hidden and permission was granted.
- **How does presence handle multiple tabs?** The server counts remaining sockets in `user:<id>` room on disconnect. `presence:offline` is only emitted when that count reaches 0, so closing one tab while another is open keeps the user online.
