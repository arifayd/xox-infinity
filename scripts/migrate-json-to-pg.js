#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════
//  XOX ARENA - JSON to PostgreSQL Migration Script
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const DB_FILE = path.join(__dirname, '..', 'database.json');

async function migrate() {
  console.log('\n🔄 Starting migration: JSON → PostgreSQL\n');

  // Check files
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in .env');
    process.exit(1);
  }

  if (!fs.existsSync(DB_FILE)) {
    console.error('❌ database.json not found');
    process.exit(1);
  }

  try {
    // Load JSON data
    console.log('📖 Reading database.json...');
    const jsonData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    console.log(`  ✓ Found ${jsonData.users.length} users`);
    console.log(`  ✓ Found ${jsonData.matches.length} matches`);
    console.log(`  ✓ Found ${jsonData.clans.length} clans`);
    console.log(`  ✓ Found ${jsonData.chats.length} chats`);
    console.log(`  ✓ Found ${jsonData.reports.length} reports`);

    // Connect to PostgreSQL
    console.log('\n🔌 Connecting to PostgreSQL...');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Test connection
    await pool.query('SELECT NOW()');
    console.log('  ✓ PostgreSQL connected');

    // Create tables
    console.log('\n📋 Creating tables...');
    await createTables(pool);
    console.log('  ✓ Tables created');

    // Migrate users
    console.log('\n👥 Migrating users...');
    await migrateUsers(pool, jsonData.users);
    console.log(`  ✓ ${jsonData.users.length} users migrated`);

    // Migrate matches
    if (jsonData.matches.length > 0) {
      console.log('\n🎮 Migrating matches...');
      await migrateMatches(pool, jsonData.matches);
      console.log(`  ✓ ${jsonData.matches.length} matches migrated`);
    }

    // Migrate clans
    if (jsonData.clans.length > 0) {
      console.log('\n🏰 Migrating clans...');
      await migrateClans(pool, jsonData.clans);
      console.log(`  ✓ ${jsonData.clans.length} clans migrated`);
    }

    // Migrate chats
    if (jsonData.chats.length > 0) {
      console.log('\n💬 Migrating chats...');
      await migrateChats(pool, jsonData.chats);
      console.log(`  ✓ ${jsonData.chats.length} chats migrated`);
    }

    // Verify
    console.log('\n✅ Verifying migration...');
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const matchCount = await pool.query('SELECT COUNT(*) FROM matches');
    console.log(`  ✓ Users in PostgreSQL: ${userCount.rows[0].count}`);
    console.log(`  ✓ Matches in PostgreSQL: ${matchCount.rows[0].count}`);

    console.log('\n✅ Migration complete! Your data is now in PostgreSQL.\n');

    // Backup
    const backup = path.join(__dirname, '..', `database-backup-${Date.now()}.json`);
    fs.copyFileSync(DB_FILE, backup);
    console.log(`📦 JSON backup saved: ${backup}\n`);

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

async function createTables(pool) {
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
      await pool.query(query);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
  }
}

async function migrateUsers(pool, users) {
  for (const user of users) {
    try {
      await pool.query(
        `INSERT INTO users (
          id, username, password_hash, trophies, elo, wins, losses, draws,
          language, avatar, clan_id, is_admin, is_banned, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (username) DO NOTHING`,
        [
          user.id,
          user.username,
          user.password || user.password_hash,
          user.trophies || 0,
          user.elo || 1500,
          user.wins || 0,
          user.losses || 0,
          user.draws || 0,
          user.language || 'en',
          user.avatar || '⚔️',
          user.clan_id || null,
          user.is_admin || false,
          user.is_banned || false,
          user.created_at || new Date().toISOString()
        ]
      );
    } catch (err) {
      console.warn(`⚠️ Skipping user ${user.username}: ${err.message}`);
    }
  }
}

async function migrateMatches(pool, matches) {
  for (const match of matches) {
    try {
      await pool.query(
        `INSERT INTO matches (
          id, player1_id, player2_id, winner_id, reason, duration, mode,
          elo_change_p1, elo_change_p2, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING`,
        [
          match.id,
          match.player1_id,
          match.player2_id,
          match.winner_id || null,
          match.reason || 'normal',
          match.duration || 0,
          match.mode || 'normal',
          match.elo_change_p1 || 0,
          match.elo_change_p2 || 0,
          match.created_at || new Date().toISOString()
        ]
      );
    } catch (err) {
      console.warn(`⚠️ Skipping match ${match.id}: ${err.message}`);
    }
  }
}

async function migrateClans(pool, clans) {
  for (const clan of clans) {
    try {
      await pool.query(
        `INSERT INTO clans (
          id, name, leader_id, description, member_count, level, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (name) DO NOTHING`,
        [
          clan.id,
          clan.name,
          clan.leader_id,
          clan.description || null,
          clan.member_count || 1,
          clan.level || 1,
          clan.created_at || new Date().toISOString()
        ]
      );
    } catch (err) {
      console.warn(`⚠️ Skipping clan ${clan.name}: ${err.message}`);
    }
  }
}

async function migrateChats(pool, chats) {
  for (const chat of chats) {
    try {
      await pool.query(
        `INSERT INTO chats (
          id, from_user, to_user, clan_id, message, is_read, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          chat.id,
          chat.from_user,
          chat.to_user || null,
          chat.clan_id || null,
          chat.message,
          chat.is_read || false,
          chat.created_at || new Date().toISOString()
        ]
      );
    } catch (err) {
      console.warn(`⚠️ Skipping chat ${chat.id}: ${err.message}`);
    }
  }
}

// Run migration
migrate();
