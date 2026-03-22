# 🎮 XOX ARENA ENHANCED — Complete Setup Guide

## 📋 Table of Contents
- [Quick Start](#quick-start)
- [Features Overview](#features-overview)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Mobile Build](#mobile-build)
- [Deployment](#deployment)
- [Admin Panel](#admin-panel)

---

## ⚡ Quick Start (2 minutes)

### Option 1: JSON Mode (Development)
```bash
git clone <repo>
cd xox-arena-enhanced
npm install
npm start
```
→ Open http://localhost:3000

### Option 2: PostgreSQL Mode (Production)
```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://user:password@localhost:5432/xox_arena"

npm install
npm start
```

---

## ✨ Features Overview

### 🔐 SECURITY
- **Rate Limiting**: 5 auth attempts / 15 min, 30 API calls / min
- **Input Sanitization**: XSS/SQL injection prevention
- **JWT Authentication**: 30-day token expiry
- **Helmet.js**: Security headers
- **CORS Hardening**: Configurable origin

### 📊 ELO RANKING SYSTEM
- **Dynamic Rating**: K-factor 32 (standard chess)
- **Elo Formula**: Based on player skill difference
- **Leaderboard**: Sorted by Elo (not just trophies)
- **League System**: Bronze → Silver → Gold → Diamond → Legend

### 👥 SOCIAL FEATURES
- **Friends System**: Add/accept/remove friends
- **Clans**: Create clans, manage members
- **In-Game Chat**: 1-on-1 and clan chat
- **Profiles**: View player stats and achievements

### 📈 ADMIN PANEL
- **User Management**: Ban/unban, view stats
- **Report System**: Players can report rule violations
- **Match History**: Filter and analyze matches
- **Dashboard**: Real-time stats and activity

### ⚡ GAME MODES
- **Normal Mode** (30 sec/move): Standard trophy gain
- **Rapid Mode** (15 sec/move): 1.5x Elo swing
- **Blitz Mode** (5 sec/move): 2x Elo swing, fastest games

### 🎯 ACHIEVEMENTS & QUESTS
- **Achievements**: Unlockable badges (First Win, Century, Undefeated, etc.)
- **Daily Quests**: Win 3 games, Play 5 matches, etc.
- **Seasonal Rewards**: End-of-season rank rewards

### 🌍 15 LANGUAGES
Turkish, English, Spanish, French, German, Italian, Portuguese, Russian, Arabic, Japanese, Korean, Chinese, Vietnamese, Thai, and more

---

## 🛠️ Installation

### Prerequisites
- **Node.js** 14+ 
- **npm** or **yarn**
- **PostgreSQL** 12+ (optional, for production)

### Step 1: Clone & Install
```bash
git clone <repository>
cd xox-arena-enhanced
npm install
```

### Step 2: Create .env File
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
JWT_SECRET=your-secret-key-here
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development

# For PostgreSQL (optional):
DATABASE_URL=postgresql://user:password@localhost:5432/xox_arena
```

### Step 3: Run Server
```bash
# Development
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000`

---

## 🗄️ Database Setup

### Option A: JSON Mode (Built-in, No Setup)
Default mode. Data stored in `database.json`

**Pros:**
- Zero configuration
- Mac/Windows compatible
- Perfect for development

**Cons:**
- Not suitable for 10k+ users
- No concurrent write safety

### Option B: PostgreSQL (Production)

#### Step 1: Install PostgreSQL
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# Windows
# Download from https://www.postgresql.org/download/windows/
```

#### Step 2: Create Database
```bash
psql postgres
```

```sql
CREATE DATABASE xox_arena;
CREATE USER xox_user WITH PASSWORD 'your_secure_password';
ALTER ROLE xox_user SET client_encoding TO 'utf8';
ALTER ROLE xox_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE xox_user SET default_transaction_deferrable TO on;
ALTER ROLE xox_user SET default_transaction_read_committed TO on;
GRANT ALL PRIVILEGES ON DATABASE xox_arena TO xox_user;
\c xox_arena
GRANT USAGE ON SCHEMA public TO xox_user;
GRANT CREATE ON SCHEMA public TO xox_user;
```

#### Step 3: Configure .env
```env
DATABASE_URL=postgresql://xox_user:your_secure_password@localhost:5432/xox_arena
NODE_ENV=production
```

#### Step 4: Migrate from JSON (if needed)
```bash
npm run migrate-to-postgres
```

#### Step 5: Start Server
```bash
npm start
```

Server will auto-create tables on first run.

---

## 📱 Mobile Build (Capacitor)

### Prerequisites
- Xcode 12+ (for iOS)
- Android Studio 4.1+ (for Android)
- CocoaPods (macOS)

### Step 1: Setup Capacitor
```bash
npm install @capacitor/core @capacitor/cli

# Add iOS platform
npx cap add ios

# Add Android platform
npx cap add android
```

### Step 2: Build Web Assets
```bash
npm run build  # If using build tool

# OR manually:
# Ensure your HTML/JS is in ./public folder
```

### Step 3: Sync to Native Projects
```bash
npx cap sync
```

### Step 4: Build iOS
```bash
npx cap open ios

# In Xcode:
# 1. Select "XOX Arena" target
# 2. Product → Build
# 3. Connect your iPhone
# 4. Product → Run
```

### Step 5: Build Android
```bash
npx cap open android

# In Android Studio:
# 1. Build → Build APK
# 2. Waiting for build completion...
# 3. Android Studio suggests running app on emulator

# For release APK:
# Build → Build Bundle(s) / APK(s) → Build APK(s)
```

### iOS App Store Submission
```bash
# Create archive in Xcode
# Product → Archive
# Upload to App Store Connect
```

### Android Google Play Submission
```bash
# In Android Studio:
# Build → Generate Signed Bundle/APK
# Use release key (create if not exists)
# Upload to Google Play Console
```

---

## 🚀 Deployment

### Option 1: Heroku (Easiest)
```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create xox-arena-app

# Add PostgreSQL
heroku addons:create heroku-postgresql:standard-0

# Set env vars
heroku config:set JWT_SECRET=your-secret-key
heroku config:set CORS_ORIGIN=https://xox-arena-app.herokuapp.com

# Deploy
git push heroku main

# Check logs
heroku logs --tail
```

### Option 2: Docker (Any Cloud)
```bash
# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
EOF

# Build image
docker build -t xox-arena .

# Run locally
docker run -p 3000:3000 -e DATABASE_URL=... xox-arena

# Push to Docker Hub
docker tag xox-arena username/xox-arena:latest
docker push username/xox-arena:latest
```

### Option 3: AWS EC2
```bash
# Launch Ubuntu 22.04 LTS instance

# SSH into instance
ssh -i key.pem ubuntu@your-instance-ip

# Install Node & PostgreSQL
sudo apt update
sudo apt install nodejs npm postgresql postgresql-contrib

# Clone repo
git clone <repo>
cd xox-arena-enhanced

# Setup .env with RDS endpoint
nano .env

# Install & start
npm install
pm2 start server.js
pm2 save
pm2 startup
```

### Option 4: Railway.app (Recommended for Small Projects)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize
railway init

# Create PostgreSQL plugin in dashboard

# Deploy
git push origin main  # Auto-deploys from GitHub
```

---

## 👨‍💼 Admin Panel

### Access Admin Panel
1. **Register** as normal user
2. **Database manipulation** (or SQL):
   ```sql
   UPDATE users SET is_admin = true WHERE username = 'your_username';
   ```
3. Navigate to `/admin-panel.html`

### Admin Features
- ✅ View all users (Elo, wins, losses, ban status)
- ✅ Ban/unban players
- ✅ Review player reports
- ✅ Dashboard with live stats
- ✅ Match history analysis
- ✅ Clan management

### Admin API Endpoints
```
GET  /api/admin/users                 - List all users
POST /api/admin/ban-user              - Ban a user
GET  /api/admin/reports               - View reports
POST /api/admin/resolve-report        - Resolve report
GET  /api/admin/matches               - Match history
GET  /api/admin/stats                 - Server stats
```

---

## 🔧 Development

### Project Structure
```
xox-arena-enhanced/
├── server.js                 # Main server (722 lines)
├── public/
│   ├── index.html           # Main game UI
│   ├── admin-panel.html     # Admin dashboard
│   └── translations.js      # 15 languages
├── scripts/
│   └── migrate-json-to-pg.js # JSON → PostgreSQL migration
├── database.json            # JSON database (dev)
├── package.json             # Dependencies
├── .env.example             # Environment template
├── .env                     # Your config (git-ignored)
├── capacitor.config.json    # Mobile config
└── README.md
```

### Running Tests
```bash
npm test
```

### Debugging
```bash
# With verbose logging
DEBUG=xox:* npm start

# With Node inspector
node --inspect server.js
# Open chrome://inspect in Chrome
```

---

## 📊 Monitoring

### Log Important Events
- User registrations
- Match results
- Admin actions
- Errors

### View Logs
```bash
# On Heroku
heroku logs --tail

# With PM2
pm2 logs

# Local file
tail -f logs/server.log
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process on port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

### PostgreSQL Connection Error
```bash
# Test connection
psql postgresql://user:password@localhost:5432/xox_arena

# Check DATABASE_URL in .env
echo $DATABASE_URL
```

### CORS Error in Browser
Make sure `CORS_ORIGIN` matches your frontend URL:
```env
# If running on localhost:5000
CORS_ORIGIN=http://localhost:5000

# If running on yoursite.com
CORS_ORIGIN=https://yoursite.com
```

---

## 📞 Support

- **GitHub Issues**: Report bugs
- **Email**: support@xoxarena.com
- **Discord**: https://discord.gg/xoxarena

---

## 📄 License

MIT License - See LICENSE file

---

## 🎉 Next Steps

1. ✅ Install & run locally
2. ✅ Create admin account
3. ✅ Test game modes (Normal/Rapid/Blitz)
4. ✅ Try admin panel features
5. ✅ Set up PostgreSQL for production
6. ✅ Deploy to Heroku/Railway/AWS
7. ✅ Build iOS/Android apps

**Good luck! 🚀**
