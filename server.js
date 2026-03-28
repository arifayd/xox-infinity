// ═══════════════════════════════════════════════════════════
//  XOX Infinity — Strategy Arena
//  🔐 Security + 📊 Elo + 👥 Social + 📈 Admin + ⚡ Fast Mode
//  Database: PostgreSQL (fallback: JSON)
// ═══════════════════════════════════════════════════════════

try { require('dotenv').config(); } catch(e) {} // optional .env support

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const cors = require('cors');

// ── FIREBASE ADMIN ───────────────────────────────────────
let firebaseAdmin = null;
try {
  const admin = require('firebase-admin');
  
  // 1. Önce Railway'deki JSON değişkenine bak (Canlı ortam için)
  if (process.env.FIREBASE_KEY_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseAdmin = admin;
    console.log('✅ Firebase Admin (Railway JSON üzerinden) başlatıldı');
  } 
  // 2. Eğer o yoksa, bilgisayardaki dosyaya bak (Senin bilgisayarın için)
  else {
    const keyPath = process.env.FIREBASE_KEY_PATH || './firebase-key.json';
    const fs = require('fs');
    if (fs.existsSync(keyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      firebaseAdmin = admin;
      console.log('✅ Firebase Admin (Yerel dosya üzerinden) başlatıldı');
    } else {
      console.log('⚠️ firebase-key.json not found - Firebase auth disabled');
    }
  }
} catch (e) {
  console.log('⚠️ Firebase başlatılamadı:', e.message);
}
const app = express();
app.set('trust proxy', 1); // Railway'in proxy'sine güven ve gerçek kullanıcı IP'sini al
const server = http.createServer(app);
// ── MIDDLEWARE (SIRALAMA DÜZELTİLDİ - EN ÖNEMLİ KISIM) ─────
app.use(cors()); // Pop-up ve socket için geniş izin
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: "unsafe-none" }, // Pop-up'ın kapanması için şart!
  crossOriginEmbedderPolicy: false,
  hsts: false
}));

// JSON Parser artık POST rotalarından önce! (idToken hatasını bu çözer)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
const io = new Server(server, {
  cors: { 
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 10000,
  pingInterval: 5000
});

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5, // 5 attempts
  message: 'Too many attempts, try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 min
  max: 30,
});

app.use('/api/auth/', authLimiter);
app.use('/api/', apiLimiter);
app.use(express.static(path.join(__dirname, 'public')));

// Google OAuth popup page for Android WebView
app.get('/auth/google-popup', (req, res) => {
  let googleClientId = '';
  let firebaseConfig = {};
  try {
    const configContent = require('fs').readFileSync(path.join(__dirname, 'public', 'firebase-config.js'), 'utf8');
    const m = (k) => { const r = configContent.match(new RegExp(k + '\\s*:\\s*"([^"]+)"')); return r ? r[1] : ''; };
    googleClientId = m('googleClientId');
    firebaseConfig = { apiKey: m('apiKey'), authDomain: m('authDomain'), projectId: m('projectId'), storageBucket: m('storageBucket'), messagingSenderId: m('messagingSenderId'), appId: m('appId') };
  } catch(e) {}

  res.send(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"><\/script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"><\/script>
<style>body{background:#0a0a12;color:#f0f0f8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:40px}.spin{border:4px solid #333;border-top:4px solid #4cc9f0;border-radius:50%;width:40px;height:40px;animation:s 1s linear infinite;margin:20px auto}@keyframes s{to{transform:rotate(360deg)}}</style>
</head><body><div class="box"><div class="spin"></div><p id="msg">Google hesabina yonlendiriliyorsun...</p></div>
<script>
var clientId = '${googleClientId}';
var cfg = ${JSON.stringify(firebaseConfig)};

// Check if we have access_token in URL hash (returning from Google)
var hash = window.location.hash;
if(hash && hash.indexOf('access_token') !== -1){
  // Parse token from hash
  var params = new URLSearchParams(hash.substring(1));
  var accessToken = params.get('access_token');
  if(accessToken && cfg.apiKey){
    document.getElementById('msg').textContent='Giris yapiliyor...';
    var app = firebase.initializeApp(cfg, 'gpopup');
    var auth = firebase.auth(app);
    var credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
    auth.signInWithCredential(credential).then(function(result){
      return result.user.getIdToken().then(function(idToken){
        var displayName = result.user.displayName || result.user.email.split('@')[0];
        document.getElementById('msg').textContent='Giris basarili! Oyuna donuluyor...';
        // Send token via localStorage (works across tabs in same origin)  
        localStorage.setItem('google_auth_token', JSON.stringify({idToken:idToken, displayName:displayName}));
        // Also try postMessage
        try{ if(window.opener) window.opener.postMessage({type:'google-auth',idToken:idToken,displayName:displayName},'*'); }catch(e){}
        setTimeout(function(){try{window.close()}catch(e){}},1000);
      });
    }).catch(function(e){
      document.getElementById('msg').textContent='Hata: '+e.message;
    });
  }
} else {
  // No token yet - redirect to Google OAuth
  if(!clientId){
    document.getElementById('msg').textContent='Google Client ID bulunamadi';
  } else {
    var redirectUri = window.location.origin + '/auth/google-popup';
    var url = 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?client_id=' + encodeURIComponent(clientId)
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&response_type=token'
      + '&scope=email%20profile'
      + '&prompt=select_account';
    window.location.href = url;
  }
}
<\/script></body></html>`);
});

const JWT_SECRET = process.env.JWT_SECRET || 'xox-infinity-secret-change-in-production';
const DB_FILE = path.join(__dirname, 'database.json');

// ── DATABASE LAYER ───────────────────────────────────────
let db = {
  users: [],
  matches: [],
  clans: [],
  chats: [],
  achievements: [],
  quests: [],
  reports: [],
  friendships: [],
  blocks: []
};

let usePostgreSQL = false;
let pgPool = null;

// Check PostgreSQL connection
async function initDatabase() {
  const hasPostgres = process.env.DATABASE_URL;
  
  if (hasPostgres) {
    try {
      const { Pool } = require('pg');
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      
      await pgPool.query('SELECT NOW()');
      usePostgreSQL = true;
      console.log('✅ PostgreSQL connected');
      await createPostgresTables();
    } catch (err) {
      console.warn('⚠️ PostgreSQL failed, using JSON fallback:', err.message);
      loadJSONDB();
    }
  } else {
    loadJSONDB();
  }
}

function loadJSONDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(data);
    }
  } catch (error) {
    console.error('❌ DB load error:', error);
    db = { users: [], matches: [], clans: [], chats: [], achievements: [], quests: [], reports: [], friendships: [], blocks: [] };
  }
}

function saveJSONDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('❌ DB save error:', error);
  }
}

// PostgreSQL Schema
async function createPostgresTables() {
  if (!usePostgreSQL) return;
  
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      trophies INT DEFAULT 0,
      elo INT DEFAULT 1500,
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      draws INT DEFAULT 0,
      language VARCHAR(5) DEFAULT 'en',
      avatar VARCHAR(50) DEFAULT '⚔️',
      clan_id INT,
      is_admin BOOLEAN DEFAULT false,
      is_banned BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      player1_id INT NOT NULL,
      player2_id INT NOT NULL,
      winner_id INT,
      reason VARCHAR(50),
      duration INT,
      mode VARCHAR(20),
      elo_change_p1 INT,
      elo_change_p2 INT,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY(player1_id) REFERENCES users(id),
      FOREIGN KEY(player2_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS clans (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      leader_id INT NOT NULL,
      description TEXT,
      member_count INT DEFAULT 1,
      level INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY(leader_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      from_user INT NOT NULL,
      to_user INT,
      clan_id INT,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY(from_user) REFERENCES users(id),
      FOREIGN KEY(to_user) REFERENCES users(id),
      FOREIGN KEY(clan_id) REFERENCES clans(id)
    )`,
    `CREATE TABLE IF NOT EXISTS achievements (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(100) NOT NULL,
      description TEXT,
      badge VARCHAR(10),
      progress INT DEFAULT 0,
      max_progress INT,
      completed BOOLEAN DEFAULT false,
      completed_at TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS quests (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(100) NOT NULL,
      reward INT DEFAULT 100,
      progress INT DEFAULT 0,
      target INT DEFAULT 1,
      completed BOOLEAN DEFAULT false,
      completed_at TIMESTAMP,
      expires_at TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INT NOT NULL,
      reported_user_id INT NOT NULL,
      reason VARCHAR(100) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY(reporter_id) REFERENCES users(id),
      FOREIGN KEY(reported_user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user1_id INT NOT NULL,
      user2_id INT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY(user1_id) REFERENCES users(id),
      FOREIGN KEY(user2_id) REFERENCES users(id),
      UNIQUE(user1_id, user2_id)
    )`
  ];
  
  for (const query of queries) {
    try {
      await pgPool.query(query);
    } catch (err) {
      console.warn('Table creation error:', err.message);
    }
  }
}

// ── UTILITY FUNCTIONS ─────────────────────────────────────
function sanitizeInput(str) {
  return validator.escape(validator.trim(str));
}

function calculateEloChange(winner_elo, loser_elo, isDraw = false) {
  const K = 32; // K-factor
  const expected_winner = 1 / (1 + Math.pow(10, (loser_elo - winner_elo) / 400));
  
  if (isDraw) {
    return {
      winner: Math.round(K * (0.5 - expected_winner)),
      loser: Math.round(K * (0.5 - (1 - expected_winner)))
    };
  }
  
  return {
    winner: Math.round(K * (1 - expected_winner)),
    loser: Math.round(K * (0 - (1 - expected_winner)))
  };
}

function getAchievements(wins, losses, trophies) {
  const achievements = [];
  
  if (wins === 1) achievements.push({ title: 'First Win', badge: '🎯' });
  if (wins === 10) achievements.push({ title: 'Victory x10', badge: '🏆' });
  if (wins === 100) achievements.push({ title: 'Centennial', badge: '👑' });
  if (trophies >= 500) achievements.push({ title: 'Trophy Hunter', badge: '💎' });
  if (losses === 0 && wins >= 5) achievements.push({ title: 'Undefeated', badge: '⚡' });
  
  return achievements;
}

// ── AUTH ROUTES ───────────────────────────────────────────

// Firebase Auth — main auth method
app.post('/api/auth/firebase', async (req, res) => {
  try {
    // req.body kontrolü (Hata almanı engeller)
    if (!req.body || !req.body.idToken) {
      return res.status(400).json({ error: 'idToken required' });
    }

    const { idToken, username, language } = req.body;
    if (!firebaseAdmin) return res.status(500).json({ error: 'Firebase not configured' });

    console.log('[FIREBASE AUTH] Token doğrulanıyor...');
    const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
    const firebaseUid = decoded.uid;
    const email = decoded.email;
    const signInProvider = decoded.firebase?.sign_in_provider || '';
    
    // Email verification check (skip for Google sign-in — always verified)
    if (signInProvider === 'password' && !decoded.email_verified) {
      return res.status(403).json({ error: 'E-posta doğrulanmamış. Lütfen e-postanı kontrol et.' });
    }
    
    // Find existing game user by firebase_uid
    let user = usePostgreSQL
      ? (await pgPool.query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid])).rows[0]
      : db.users.find(u => u.firebase_uid === firebaseUid);
    
    let isNewUser = false;
    
    if (!user) {
      isNewUser = true;
      // First login — create game user
      // Priority: 1) username from request body, 2) displayName from Firebase profile, 3) email prefix
      let displayName = username;
      if (!displayName) {
        try {
          const fbUserRecord = await firebaseAdmin.auth().getUser(firebaseUid);
          displayName = fbUserRecord.displayName;
        } catch(e) {}
      }
      if (!displayName) displayName = email.split('@')[0];
      
      // Check username uniqueness
      const nameExists = usePostgreSQL
        ? (await pgPool.query('SELECT id FROM users WHERE username = $1', [displayName])).rows[0]
        : db.users.find(u => u.username === displayName);
      
      const finalName = nameExists ? displayName + '_' + Math.floor(Math.random()*1000) : displayName;
      
      user = {
        id: usePostgreSQL ? null : (db.users.length + 1),
        firebase_uid: firebaseUid,
        username: finalName,
        email: email,
        
        trophies: 0,
        elo: 1500, elo_normal: 1500, elo_rapid: 1500, elo_blitz: 1500,
        wins: 0, losses: 0, draws: 0,
        language: req.body.language || 'en',
        avatar: '⚔️', clan_id: null,
        is_admin: false, is_banned: false,
        created_at: new Date().toISOString()
      };
      
      if (usePostgreSQL) {
        const result = await pgPool.query(
          `INSERT INTO users (firebase_uid, username, email, language, avatar, elo, elo_normal, elo_rapid, elo_blitz)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $6, $6) RETURNING id`,
          [firebaseUid, user.username, email, user.language, user.avatar, user.elo]
        );
        user.id = result.rows[0].id;
      } else {
        db.users.push(user);
        saveJSONDB();
      }
      
      console.log(`[NEW USER] ${user.username} (Firebase: ${firebaseUid})`);
      
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      const { password_hash, firebase_uid: fuid, ...safeUser } = user;
      return res.json({ success: true, token, user: safeUser, isNewUser: true });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'Account banned' });
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    const { password_hash, firebase_uid: fuid2, ...safeUser } = user;
    res.json({ success: true, token, user: safeUser, isNewUser: false });
    
  } catch (error) {
    console.error('Firebase auth error:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Local Auth fallback (when Firebase not configured)
app.post('/api/auth/register', async (req, res) => {
  try {
    let { username, password, language } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = sanitizeInput(username);
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers, _, - only' });
    
    const existingUser = usePostgreSQL 
      ? await pgPool.query('SELECT id FROM users WHERE username = $1', [username])
      : db.users.find(u => u.username === username);
    
    if ((usePostgreSQL && existingUser.rows.length > 0) || (!usePostgreSQL && existingUser)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      id: usePostgreSQL ? null : (db.users.length + 1),
      username, password_hash: hashedPassword,
      trophies: 0, elo: 1500, elo_normal: 1500, elo_rapid: 1500, elo_blitz: 1500,
      wins: 0, losses: 0, draws: 0,
      language: language || 'en', avatar: '⚔️', clan_id: null,
      is_admin: false, is_banned: false, created_at: new Date().toISOString()
    };
    
    if (usePostgreSQL) {
      const result = await pgPool.query(
        `INSERT INTO users (username, password_hash, language, avatar, elo, elo_normal, elo_rapid, elo_blitz) 
         VALUES ($1, $2, $3, $4, $5, $5, $5, $5) RETURNING id`,
        [user.username, user.password_hash, user.language, user.avatar, user.elo]
      );
      user.id = result.rows[0].id;
    } else {
      db.users.push(user);
      saveJSONDB();
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    const { password_hash, ...userWithoutPassword } = user;
    res.status(201).json({ success: true, token, user: userWithoutPassword });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = usePostgreSQL
      ? (await pgPool.query('SELECT * FROM users WHERE username = $1', [username])).rows[0]
      : db.users.find(u => u.username === username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'Account banned' });
    }
    
    const passwordHash = user.password_hash || user.password;
    
    if (!passwordHash) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Use the Google button.' });
    }
    
    const validPassword = await bcrypt.compare(password, passwordHash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    
    const { password_hash, password: _, ...userWithoutPassword } = user;
    res.json({ success: true, token, user: userWithoutPassword });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── CHANGE USERNAME ──────────────────────────────────────
app.post('/api/auth/change-username', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token required' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    let { username } = req.body;
    
    username = sanitizeInput(username);
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers, _, - only' });
    
    const existing = usePostgreSQL
      ? (await pgPool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, decoded.userId])).rows[0]
      : db.users.find(u => u.username === username && u.id !== decoded.userId);
    
    if (existing) return res.status(400).json({ error: 'Username already taken' });
    
    if (usePostgreSQL) {
      await pgPool.query('UPDATE users SET username = $1 WHERE id = $2', [username, decoded.userId]);
    } else {
      const user = db.users.find(u => u.id === decoded.userId);
      if (user) { user.username = username; saveJSONDB(); }
    }
    
    res.json({ success: true, username });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── LEADERBOARD ROUTES ────────────────────────────────────

app.get('/api/leaderboard/elo', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const mode = req.query.mode || 'normal'; // #6 — Normal/Rapid/Blitz sekme desteği
    const eloField = mode === 'rapid' ? 'elo_rapid' : (mode === 'blitz' ? 'elo_blitz' : 'elo_normal');
    
    let users;
    if (usePostgreSQL) {
      const result = await pgPool.query(
        `SELECT id, username, elo_normal, elo_rapid, elo_blitz, wins, losses, trophies, avatar FROM users ORDER BY ${eloField} DESC LIMIT $1`,
        [limit]
      );
      users = result.rows;
    } else {
      users = db.users
        .map(({ password, password_hash, ...u }) => u)
        .sort((a, b) => {
          return (b[eloField]||1500) - (a[eloField]||1500);
        })
        .slice(0, limit);
    }
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/leaderboard/trophies', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    
    let users;
    if (usePostgreSQL) {
      const result = await pgPool.query(
        'SELECT id, username, trophies, wins, losses, avatar FROM users ORDER BY trophies DESC LIMIT $1',
        [limit]
      );
      users = result.rows;
    } else {
      users = db.users
        .map(({ password, password_hash, ...u }) => u)
        .sort((a, b) => b.trophies - a.trophies)
        .slice(0, limit);
    }
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── SOCIAL ROUTES ─────────────────────────────────────────

app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { targetUserId, targetUsername } = req.body;
    const userId = req.user.userId;
    
    let targetId = targetUserId;
    
    if (!targetId && targetUsername) {
      if (usePostgreSQL) {
        const result = await pgPool.query('SELECT id FROM users WHERE username = $1', [targetUsername]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        targetId = result.rows[0].id;
      } else {
        const target = db.users.find(u => u.username === targetUsername);
        if (!target) return res.status(404).json({ error: 'User not found' });
        targetId = target.id;
      }
    }
    
    if (userId === targetId) {
      return res.status(400).json({ error: 'Cannot friend yourself' });
    }
    
    const existing = db.friendships.find(f =>
      (f.user1_id === userId && f.user2_id === targetId) ||
      (f.user1_id === targetId && f.user2_id === userId)
    );
    if (existing) {
      return res.status(400).json({ error: 'Already friends or request pending' });
    }
    
    const friendship = {
      id: db.friendships.length + 1,
      user1_id: userId,
      user2_id: targetId,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    db.friendships.push(friendship);
    saveJSONDB();
    
    res.json({ success: true, friendship });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    // Get online user IDs — scan ALL currently connected sockets directly
    const onlineUserIds = new Set();
    for (const [, sock] of io.sockets.sockets) {
      if (sock.connected && players[sock.id]) {
        onlineUserIds.add(players[sock.id].userId);
      }
    }
    
    if (usePostgreSQL) {
      const result = await pgPool.query(
        `SELECT u.id, u.username, u.elo, u.wins, u.losses FROM friendships f
         JOIN users u ON (CASE WHEN f.user1_id = $1 THEN f.user2_id ELSE f.user1_id END) = u.id
         WHERE (f.user1_id = $1 OR f.user2_id = $1) AND f.status = 'accepted'`,
        [userId]
      );
      const friends = result.rows.map(f => ({...f, online: onlineUserIds.has(f.id)}));
      res.json({ success: true, friends });
    } else {
      const friendships = db.friendships.filter(f =>
        (f.user1_id === userId || f.user2_id === userId) && f.status === 'accepted'
      );
      const friends = friendships.map(f => {
        const friendId = f.user1_id === userId ? f.user2_id : f.user1_id;
        const user = db.users.find(u => u.id === friendId);
        if (!user) return null;
        return { id: user.id, username: user.username, online: onlineUserIds.has(user.id) };
      }).filter(Boolean);
      
      res.json({ success: true, friends });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/friends/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    if (usePostgreSQL) {
      const result = await pgPool.query(
        `SELECT f.id as friendship_id, u.id, u.username, u.elo FROM friendships f
         JOIN users u ON f.user1_id = u.id
         WHERE f.user2_id = $1 AND f.status = 'pending'`,
        [userId]
      );
      res.json({ success: true, pending: result.rows });
    } else {
      const pending = db.friendships
        .filter(f => f.user2_id === userId && f.status === 'pending')
        .map(f => {
          const user = db.users.find(u => u.id === f.user1_id);
          if (!user) return null;
          return { friendship_id: f.id, id: user.id, username: user.username, elo: user.elo };
        }).filter(Boolean);
      
      res.json({ success: true, pending });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { friendshipId } = req.body;
    const userId = req.user.userId;
    
    if (usePostgreSQL) {
      await pgPool.query(
        `UPDATE friendships SET status = 'accepted' WHERE id = $1 AND user2_id = $2`,
        [friendshipId, userId]
      );
    } else {
      const f = db.friendships.find(f => f.id === friendshipId && f.user2_id === userId);
      if (!f) return res.status(404).json({ error: 'Request not found' });
      f.status = 'accepted';
      saveJSONDB();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/friends/reject', authenticateToken, async (req, res) => {
  try {
    const { friendshipId } = req.body;
    const userId = req.user.userId;
    
    if (usePostgreSQL) {
      await pgPool.query(
        `DELETE FROM friendships WHERE id = $1 AND user2_id = $2`,
        [friendshipId, userId]
      );
    } else {
      const idx = db.friendships.findIndex(f => f.id === friendshipId && f.user2_id === userId);
      if (idx === -1) return res.status(404).json({ error: 'Request not found' });
      db.friendships.splice(idx, 1);
      saveJSONDB();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/friends/remove', authenticateToken, async (req, res) => {
  try {
    const friendId = parseInt(req.body.friendId);
    const userId = req.user.userId;
    
    if (!friendId) return res.status(400).json({ error: 'friendId required' });
    
    if (usePostgreSQL) {
      await pgPool.query(
        `DELETE FROM friendships WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
        [userId, friendId]
      );
    } else {
      const idx = db.friendships.findIndex(f =>
        (f.user1_id === userId && f.user2_id === friendId) ||
        (f.user1_id === friendId && f.user2_id === userId)
      );
      if (idx === -1) return res.status(404).json({ error: 'Friendship not found' });
      db.friendships.splice(idx, 1);
      saveJSONDB();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/clans', async (req, res) => {
  try {
    const clans = usePostgreSQL
      ? (await pgPool.query('SELECT * FROM clans ORDER BY member_count DESC LIMIT 50')).rows
      : db.clans.sort((a, b) => b.member_count - a.member_count).slice(0, 50);
    
    res.json({ success: true, clans });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── ACHIEVEMENTS ROUTES ───────────────────────────────────

app.get('/api/achievements/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    let achievements;
    if (usePostgreSQL) {
      const result = await pgPool.query(
        'SELECT * FROM achievements WHERE user_id = $1',
        [userId]
      );
      achievements = result.rows;
    } else {
      achievements = db.achievements.filter(a => a.user_id === userId);
    }
    
    res.json({ success: true, achievements });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── ADMIN ROUTES ──────────────────────────────────────────

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

async function isAdmin(req, res, next) {
  try {
    const userId = req.user.userId;
    const user = usePostgreSQL
      ? (await pgPool.query('SELECT is_admin FROM users WHERE id = $1', [userId])).rows[0]
      : db.users.find(u => u.id === userId);
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}

app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    let users;
    if (usePostgreSQL) {
      const result = await pgPool.query(
        'SELECT id, username, trophies, elo, wins, losses, is_banned, created_at FROM users ORDER BY created_at DESC'
      );
      users = result.rows;
    } else {
      users = db.users.map(u => {
        const { password, password_hash, ...rest } = u;
        return rest;
      });
    }
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/ban-user', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId, reason } = req.body;
    
    if (usePostgreSQL) {
      await pgPool.query(
        'UPDATE users SET is_banned = true WHERE id = $1',
        [userId]
      );
    } else {
      const user = db.users.find(u => u.id === userId);
      if (user) user.is_banned = true;
      saveJSONDB();
    }
    
    res.json({ success: true, message: `User ${userId} banned` });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/reports', authenticateToken, isAdmin, async (req, res) => {
  try {
    let reports;
    if (usePostgreSQL) {
      const result = await pgPool.query(
        'SELECT * FROM reports WHERE status = $1 ORDER BY created_at DESC',
        ['pending']
      );
      reports = result.rows;
    } else {
      reports = db.reports.filter(r => r.status === 'pending');
    }
    
    res.json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GAME LOGIC ────────────────────────────────────────────
const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

const waitingQueue = [];
const rooms = {};
const players = {};

function checkWinner(board) {
  for (const [a, b, c] of WIN_COMBOS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], combo: [a, b, c] };
    }
  }
  return null;
}

function createRoom(p1Socket, p2Socket, gameMode = 'normal') {
  const roomId = Math.random().toString(36).substr(2, 8).toUpperCase();
  const p1 = players[p1Socket.id];
  const p2 = players[p2Socket.id];
  
  let p1Symbol = 'X';
  let p2Symbol = 'O';
  
  if (p1.lastSymbol) {
    p1Symbol = p1.lastSymbol === 'X' ? 'O' : 'X';
    p2Symbol = p1Symbol === 'X' ? 'O' : 'X';
  }
  
  p1.lastSymbol = p1Symbol;
  p2.lastSymbol = p2Symbol;
  
  const timeLimit = gameMode === 'blitz' ? 5 : (gameMode === 'rapid' ? 15 : 30);
  const eloField = gameMode === 'rapid' ? 'elo_rapid' : (gameMode === 'blitz' ? 'elo_blitz' : 'elo_normal');
  
  rooms[roomId] = {
    id: roomId,
    gameMode,
    players: [
      { socketId: p1Socket.id, userId: p1.userId, username: p1.username, elo: p1[eloField] || p1.elo || 1500, symbol: p1Symbol },
      { socketId: p2Socket.id, userId: p2.userId, username: p2.username, elo: p2[eloField] || p2.elo || 1500, symbol: p2Symbol },
    ],
    board: Array(9).fill(null),
    xQueue: [],
    oQueue: [],
    currentPlayer: 'X',
    timer: null,
    timeLeft: timeLimit,
    timeLeftX: timeLimit,
    timeLeftO: timeLimit,
    timeLimit,
    startTime: Date.now(),
    rematchRequests: new Set(),
    gameEnded: false,
  };
  
  p1.roomId = roomId;
  p2.roomId = roomId;
  
  p1Socket.join(roomId);
  p2Socket.join(roomId);
  
  return rooms[roomId];
}

// #12 — Server-based timestamp timer (no setInterval drift)
function startRoomTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  clearInterval(room.timer);
  
  // Initialize per-symbol time tracking if not present
  if (room.timeLeftX === undefined) room.timeLeftX = room.timeLimit;
  if (room.timeLeftO === undefined) room.timeLeftO = room.timeLimit;
  
  // Record the timestamp when this turn started
  room.turnStartTime = Date.now();
  room.turnStartTimeLeft = room.currentPlayer === 'X' ? room.timeLeftX : room.timeLeftO;
  
  // Send authoritative timer_sync to clients
  function emitSync() {
    const elapsed = (Date.now() - room.turnStartTime) / 1000;
    const active = room.currentPlayer;
    let xTL = room.timeLeftX;
    let oTL = room.timeLeftO;
    if (active === 'X') xTL = Math.max(0, room.turnStartTimeLeft - elapsed);
    else oTL = Math.max(0, room.turnStartTimeLeft - elapsed);
    
    io.to(roomId).emit('timer_sync', {
      timeLeftX: xTL,
      timeLeftO: oTL,
      activeSymbol: active,
      serverTime: Date.now()
    });
    // Also send legacy timer_tick for backward compat
    io.to(roomId).emit('timer_tick', { timeLeft: Math.ceil(active === 'X' ? xTL : oTL) });
  }
  
  emitSync();
  
  room.timer = setInterval(() => {
    if (room.gameEnded) { clearInterval(room.timer); return; }
    
    const elapsed = (Date.now() - room.turnStartTime) / 1000;
    const currentTL = Math.max(0, room.turnStartTimeLeft - elapsed);
    
    // Update stored time
    if (room.currentPlayer === 'X') room.timeLeftX = currentTL;
    else room.timeLeftO = currentTL;
    
    emitSync();
    
    if (currentTL <= 0) {
      clearInterval(room.timer);
      if (!room.gameEnded) {
        room.gameEnded = true;
        const loserSymbol = room.currentPlayer;
        const winnerSymbol = loserSymbol === 'X' ? 'O' : 'X';
        endRoom(roomId, winnerSymbol, 'timeout');
      }
    }
  }, 1000);
}

async function endRoom(roomId, winnerSymbol, reason) {
  const room = rooms[roomId];
  if (!room) return;
  
  clearInterval(room.timer);
  room.gameEnded = true;
  
  const winner = room.players.find(p => p.symbol === winnerSymbol);
  const loser = room.players.find(p => p.symbol !== winnerSymbol);
  
  const duration = Math.floor((Date.now() - room.startTime) / 1000);
  
  if (winner && loser) {
    const eloChange = calculateEloChange(winner.elo, loser.elo, reason === 'draw');
    const eloField = room.gameMode === 'rapid' ? 'elo_rapid' : (room.gameMode === 'blitz' ? 'elo_blitz' : 'elo_normal');
    
    if (usePostgreSQL) {
      await pgPool.query(
        `UPDATE users SET ${eloField} = ${eloField} + $1, wins = wins + 1, trophies = trophies + 30 WHERE id = $2`,
        [eloChange.winner, winner.userId]
      );
      await pgPool.query(
        `UPDATE users SET ${eloField} = GREATEST(0, ${eloField} + $1), losses = losses + 1, trophies = GREATEST(0, trophies - 18) WHERE id = $2`,
        [eloChange.loser, loser.userId]
      );
      
      await pgPool.query(
        `INSERT INTO matches (player1_id, player2_id, winner_id, reason, duration, mode, elo_change_p1, elo_change_p2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [winner.userId, loser.userId, winner.userId, reason, duration, room.gameMode, eloChange.winner, eloChange.loser]
      );
    } else {
      const winnerUser = db.users.find(u => u.id === winner.userId);
      const loserUser = db.users.find(u => u.id === loser.userId);
      
      if (winnerUser) {
        winnerUser[eloField] = (winnerUser[eloField] || 1500) + eloChange.winner;
        winnerUser.wins++;
        winnerUser.trophies += 30;
      }
      
      if (loserUser) {
        loserUser[eloField] = Math.max(0, (loserUser[eloField] || 1500) + eloChange.loser);
        loserUser.losses++;
        loserUser.trophies = Math.max(0, loserUser.trophies - 18);
      }
      
      const match = {
        id: db.matches.length + 1,
        player1_id: winner.userId,
        player2_id: loser.userId,
        winner_id: winner.userId,
        reason,
        duration,
        mode: room.gameMode,
        elo_change_p1: eloChange.winner,
        elo_change_p2: eloChange.loser,
        created_at: new Date().toISOString()
      };
      
      db.matches.push(match);
      saveJSONDB();
    }
    
    io.to(roomId).emit('game_ended', {
      roomId,
      gameMode: room.gameMode,
      winner: winner.username,
      loser: loser.username,
      reason,
      eloChange,
      duration
    });
  }
  
  // Keep room alive for 30s so rematch works
  setTimeout(() => {
    if (rooms[roomId] && !rooms[roomId].rematchRequests?.size) {
      delete rooms[roomId];
    }
  }, 30000);
}

// ── SOCKET.IO EVENTS ──────────────────────────────────────

const friendChallenges = {}; // {challengeId: {from, to, gameMode, timestamp}}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);
  
  socket.on('auth', async ({ token }) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      const user = usePostgreSQL
        ? (await pgPool.query('SELECT * FROM users WHERE id = $1', [decoded.userId])).rows[0]
        : db.users.find(u => u.id === decoded.userId);
      
      if (!user || user.is_banned) {
        socket.emit('auth_error', { error: 'User not found or banned' });
        return;
      }
      
      players[socket.id] = {
        userId: user.id,
        username: user.username,
        elo: user.elo || 1500,
        elo_normal: user.elo_normal || 1500,
        elo_rapid: user.elo_rapid || 1500,
        elo_blitz: user.elo_blitz || 1500,
        language: user.language,
        roomId: null,
        lastSymbol: null
      };
      
      socket.emit('auth_success', { user });
      console.log(`[AUTH] ${user.username} (${user.elo} elo)`);
    } catch (error) {
      socket.emit('auth_error', { error: 'Invalid token' });
    }
  });
  
  socket.on('find_match', ({ gameMode = 'normal' }) => {
    const player = players[socket.id];
    if (!player) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    // Clean up old room if any
    if (player.roomId) {
      player.roomId = null;
    }
    
    if (waitingQueue.find(p => p.socketId === socket.id)) return;
    
    const eloField = gameMode === 'rapid' ? 'elo_rapid' : (gameMode === 'blitz' ? 'elo_blitz' : 'elo_normal');
    const playerModeElo = player[eloField] || player.elo || 1500;
    const tolerance = 200;
    const matchIdx = waitingQueue.findIndex(
      p => Math.abs(p.elo - playerModeElo) <= tolerance && p.gameMode === gameMode
    );
    
    if (matchIdx >= 0) {
      const opponent = waitingQueue.splice(matchIdx, 1)[0];
      const opponentSocket = io.sockets.sockets.get(opponent.socketId);
      
      if (!opponentSocket) {
        waitingQueue.push({ socketId: socket.id, username: player.username, elo: playerModeElo, gameMode });
        return;
      }
      
      const room = createRoom(socket, opponentSocket, gameMode);
      
      io.to(room.id).emit('match_found', {
        roomId: room.id,
        board: room.board,
        currentPlayer: room.currentPlayer,
        players: room.players,
        gameMode: room.gameMode,
        timeLimit: room.timeLimit,
        xQueue: room.xQueue,
        oQueue: room.oQueue,
      });
      
      console.log(`[MATCH] ${player.username} vs ${opponent.username} → ${room.id} (${gameMode})`);
      startRoomTimer(room.id);
    } else {
      waitingQueue.push({ socketId: socket.id, username: player.username, elo: playerModeElo, gameMode });
      socket.emit('waiting_for_opponent');
      console.log(`[QUEUE] ${player.username} waiting (${waitingQueue.length} in queue)`);
    }
  });
  
  socket.on('cancel_match', () => {
    const qi = waitingQueue.findIndex(p => p.socketId === socket.id);
    if (qi >= 0) waitingQueue.splice(qi, 1);
  });
  
  // ── LEAVE ROOM (forfeit) ──────────────────────────────
  socket.on('leave_room', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const player = players[socket.id];
    if (!player) return;
    
    clearInterval(room.timer);
    
    const leaver = room.players.find(p => p.socketId === socket.id);
    const opponent = room.players.find(p => p.socketId !== socket.id);
    
    if (room.gameEnded) return; // Already ended, don't double-process
    room.gameEnded = true;
    
    if (opponent && leaver) {
      // Forfeit - opponent wins
      endRoom(roomId, opponent.symbol, 'forfeit');
    } else {
      delete rooms[roomId];
    }
    
    if (player) player.roomId = null;
    socket.leave(roomId);
  });
  
  // ── CHALLENGE FRIEND ──────────────────────────────────
  socket.on('challenge_friend', ({ targetUsername, gameMode }) => {
    const player = players[socket.id];
    if (!player) return;
    
    // Find target player online
    const targetEntry = Object.entries(players).find(([sid, p]) => p.username === targetUsername);
    if (!targetEntry) {
      socket.emit('challenge_error', { error: 'Player not online' });
      return;
    }
    
    const [targetSocketId, targetPlayer] = targetEntry;
    const challengeId = Math.random().toString(36).substr(2, 8);
    
    friendChallenges[challengeId] = {
      fromSocketId: socket.id,
      fromUsername: player.username,
      toSocketId: targetSocketId,
      toUsername: targetPlayer.username,
      gameMode,
      timestamp: Date.now()
    };
    
    io.to(targetSocketId).emit('friend_challenge', {
      challengeId,
      fromUsername: player.username,
      gameMode
    });
    
    socket.emit('challenge_sent', { challengeId, toUsername: targetPlayer.username });
    
    // Auto-expire after 30s
    setTimeout(() => {
      if (friendChallenges[challengeId]) {
        io.to(friendChallenges[challengeId].fromSocketId).emit('challenge_expired', { challengeId });
        io.to(friendChallenges[challengeId].toSocketId).emit('challenge_expired', { challengeId });
        delete friendChallenges[challengeId];
      }
    }, 30000);
  });
  
  socket.on('challenge_response', ({ challengeId, accepted }) => {
    const challenge = friendChallenges[challengeId];
    if (!challenge) return;
    
    delete friendChallenges[challengeId];
    
    if (!accepted) {
      io.to(challenge.fromSocketId).emit('challenge_declined', { challengeId });
      return;
    }
    
    const fromSocket = io.sockets.sockets.get(challenge.fromSocketId);
    const toSocket = io.sockets.sockets.get(challenge.toSocketId);
    
    if (!fromSocket || !toSocket) return;
    
    const room = createRoom(fromSocket, toSocket, challenge.gameMode);
    
    io.to(room.id).emit('match_found', {
      roomId: room.id,
      board: room.board,
      currentPlayer: room.currentPlayer,
      players: room.players,
      gameMode: room.gameMode,
      timeLimit: room.timeLimit,
      xQueue: room.xQueue,
      oQueue: room.oQueue,
    });
    
    startRoomTimer(room.id);
  });
  
  // ── REMATCH REQUEST ───────────────────────────────────
  socket.on('request_rematch', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    room.rematchRequests = room.rematchRequests || new Set();
    room.rematchRequests.add(socket.id);
    
    const opponent = room.players.find(p => p.socketId !== socket.id);
    if (!opponent) return;
    
    // Tell opponent about rematch request
    io.to(opponent.socketId).emit('rematch_requested', { roomId });
    
    // If both requested, start new game
    if (room.rematchRequests.size >= 2) {
      clearTimeout(room.rematchTimeout);
      startRematch(roomId);
    } else {
      // 10 second timeout
      room.rematchTimeout = setTimeout(() => {
        io.to(roomId).emit('rematch_expired', { roomId });
        room.rematchRequests.clear();
      }, 10000);
    }
  });
  
  socket.on('rematch_accept', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    room.rematchRequests = room.rematchRequests || new Set();
    room.rematchRequests.add(socket.id);
    
    if (room.rematchRequests.size >= 2) {
      clearTimeout(room.rematchTimeout);
      startRematch(roomId);
    }
  });
  
  socket.on('rematch_decline', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    clearTimeout(room.rematchTimeout);
    io.to(roomId).emit('rematch_expired', { roomId });
    if (room.rematchRequests) room.rematchRequests.clear();
  });
  
  socket.on('make_move', ({ roomId, cellIndex }) => {
    const room = rooms[roomId];
    if (!room || room.gameEnded) return;
    
    const player = players[socket.id];
    if (!player) return;
    
    const playerInfo = room.players.find(p => p.socketId === socket.id);
    if (!playerInfo) return;
    
    if (room.currentPlayer !== playerInfo.symbol) {
      socket.emit('move_rejected', { reason: 'Not your turn' });
      return;
    }
    
    if (room.board[cellIndex] !== null) {
      socket.emit('move_rejected', { reason: 'Cell occupied' });
      return;
    }
    
    const queue = playerInfo.symbol === 'X' ? room.xQueue : room.oQueue;
    let removedCell = null;
    
    if (queue.length === 3) {
      removedCell = queue.shift();
      room.board[removedCell] = null;
    }
    
    queue.push(cellIndex);
    room.board[cellIndex] = playerInfo.symbol;
    
    const result = checkWinner(room.board);
    
    io.to(roomId).emit('move_made', {
      cellIndex,
      symbol: playerInfo.symbol,
      removedCell,
      board: room.board,
      xQueue: room.xQueue,
      oQueue: room.oQueue,
      nextPlayer: result ? null : (room.currentPlayer === 'X' ? 'O' : 'X'),
    });
    
    if (result) {
      clearInterval(room.timer);
      room.gameEnded = true;
      io.to(roomId).emit('win_combo', { combo: result.combo, winnerSymbol: result.winner });
      setTimeout(() => endRoom(roomId, result.winner, 'normal'), 700);
    } else {
      // Reset timer to full limit for next player (hamle başına süre)
      room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
      // Each move gets fresh full time
      room.timeLeftX = room.timeLimit;
      room.timeLeftO = room.timeLimit;
      startRoomTimer(roomId);
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    
    const qi = waitingQueue.findIndex(p => p.socketId === socket.id);
    if (qi >= 0) waitingQueue.splice(qi, 1);
    
    const player = players[socket.id];
    if (player && player.roomId) {
      const room = rooms[player.roomId];
      if (room && !room.gameEnded) {
        room.gameEnded = true;
        if (room.timer) clearInterval(room.timer);
        const opponent = room.players.find(p => p.socketId !== socket.id);
        if (opponent) {
          io.to(opponent.socketId).emit('opponent_disconnected', { roomId: player.roomId });
          endRoom(player.roomId, opponent.symbol, 'disconnect');
          if (players[opponent.socketId]) {
            players[opponent.socketId].roomId = null;
          }
        } else {
          delete rooms[player.roomId];
        }
      }
      player.roomId = null;
    }
    
    delete players[socket.id];
  });
});

function startRematch(roomId) {
  const oldRoom = rooms[roomId];
  if (!oldRoom) return;
  
  const p1Socket = io.sockets.sockets.get(oldRoom.players[0].socketId);
  const p2Socket = io.sockets.sockets.get(oldRoom.players[1].socketId);
  if (!p1Socket || !p2Socket) return;
  
  // Swap symbols
  const p1 = players[p1Socket.id];
  const p2 = players[p2Socket.id];
  
  const newRoomId = Math.random().toString(36).substr(2, 8).toUpperCase();
  const p1OldSymbol = oldRoom.players.find(p => p.socketId === p1Socket.id).symbol;
  const p1NewSymbol = p1OldSymbol === 'X' ? 'O' : 'X';
  const p2NewSymbol = p1NewSymbol === 'X' ? 'O' : 'X';
  
  if (p1) p1.lastSymbol = p1NewSymbol;
  if (p2) p2.lastSymbol = p2NewSymbol;
  
  const timeLimit = oldRoom.gameMode === 'blitz' ? 5 : (oldRoom.gameMode === 'rapid' ? 15 : 30);
  
  rooms[newRoomId] = {
    id: newRoomId,
    gameMode: oldRoom.gameMode,
    players: [
      { socketId: p1Socket.id, userId: p1.userId, username: p1.username, elo: p1.elo, symbol: p1NewSymbol },
      { socketId: p2Socket.id, userId: p2.userId, username: p2.username, elo: p2.elo, symbol: p2NewSymbol },
    ],
    board: Array(9).fill(null),
    xQueue: [],
    oQueue: [],
    currentPlayer: 'X',
    timer: null,
    timeLeft: timeLimit,
    timeLeftX: timeLimit,
    timeLeftO: timeLimit,
    timeLimit,
    startTime: Date.now(),
    rematchRequests: new Set(),
    gameEnded: false,
  };
  
  if (p1) p1.roomId = newRoomId;
  if (p2) p2.roomId = newRoomId;
  
  p1Socket.leave(roomId);
  p2Socket.leave(roomId);
  p1Socket.join(newRoomId);
  p2Socket.join(newRoomId);
  
  // Clean old room
  delete rooms[roomId];
  
  io.to(newRoomId).emit('match_found', {
    roomId: newRoomId,
    board: rooms[newRoomId].board,
    currentPlayer: 'X',
    players: rooms[newRoomId].players,
    gameMode: rooms[newRoomId].gameMode,
    timeLimit: rooms[newRoomId].timeLimit,
    xQueue: [],
    oQueue: [],
    isRematch: true
  });
  
  startRoomTimer(newRoomId);
}

// ── START SERVER ──────────────────────────────────────────

async function startServer() {
  await initDatabase();
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║  XOX Infinity — Strategy Arena Server Running        ║`);
    console.log(`║  http://localhost:${PORT}                             ║`);
    console.log(`║  🔐 Security + 📊 Elo + 👥 Social + ⚡ BlitzMode   ║`);
    console.log(`║  Database: ${usePostgreSQL ? 'PostgreSQL ✅' : 'JSON 📄'}                      ║`);
    console.log(`║  Auth: ${firebaseAdmin ? '🔥 Firebase' : '🔑 Local (no Firebase)'}                  ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);
  });
}

startServer();

module.exports = { app, server, io };
