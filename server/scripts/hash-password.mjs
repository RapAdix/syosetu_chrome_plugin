#!/usr/bin/env node
import { randomBytes, pbkdf2Sync } from "node:crypto";

const ITERATIONS = 100000;
const KEY_LEN = 32; // 256 bits
const DIGEST = "sha256";

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST);
  return `pbkdf2$${ITERATIONS}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  console.log(`
Usage:
  npm run hash-password -- <password>
  npm run hash-password -- <username> <password> [daily_limit]

Arguments:
  username     Username for the user
  password     Plain-text password to hash
  daily_limit  Optional daily request limit (default: 100)

Examples:
  npm run hash-password -- mySecretPassword
  npm run hash-password -- alice mySecretPassword 150
`);
  process.exit(args.length === 0 ? 1 : 0);
}

if (args.length === 1) {
  const password = args[0];
  const hash = hashPassword(password);

  console.log("Password Hash:");
  console.log(hash);
  console.log("\nTemplate D1 commands:");
  console.log("\n# Insert new user (remote):");
  console.log(`npx wrangler d1 execute DB --remote --command="INSERT INTO users (username, password_hash, daily_limit) VALUES ('<username>', '${hash}', 100);"`);
  console.log("\n# Insert new user (local):");
  console.log(`npx wrangler d1 execute DB --local --command="INSERT INTO users (username, password_hash, daily_limit) VALUES ('<username>', '${hash}', 100);"`);
  console.log("\n# Update existing user's password (remote):");
  console.log(`npx wrangler d1 execute DB --remote --command="UPDATE users SET password_hash = '${hash}' WHERE username = '<username>';"`);
  console.log("\n# Update existing user's password (local):");
  console.log(`npx wrangler d1 execute DB --local --command="UPDATE users SET password_hash = '${hash}' WHERE username = '<username>';"`);
  process.exit(0);
}

const username = args[0];
const password = args[1];
const dailyLimitRaw = args[2] !== undefined ? parseInt(args[2], 10) : 100;
const dailyLimit = Number.isFinite(dailyLimitRaw) && dailyLimitRaw > 0 ? dailyLimitRaw : 100;

const hash = hashPassword(password);
const sqlUsername = username.replace(/'/g, "''");

console.log("Generated Password Hash:");
console.log(hash);
console.log(`\nUser: ${username} (daily limit: ${dailyLimit})`);

console.log("\n--- Remote Commands (Production) ---");
console.log("\n# Create user:");
console.log(`npx wrangler d1 execute DB --remote --command="INSERT INTO users (username, password_hash, daily_limit) VALUES ('${sqlUsername}', '${hash}', ${dailyLimit});"`);
console.log("\n# Update password:");
console.log(`npx wrangler d1 execute DB --remote --command="UPDATE users SET password_hash = '${hash}' WHERE username = '${sqlUsername}';"`);

console.log("\n--- Local Commands (Development) ---");
console.log("\n# Create user:");
console.log(`npx wrangler d1 execute DB --local --command="INSERT INTO users (username, password_hash, daily_limit) VALUES ('${sqlUsername}', '${hash}', ${dailyLimit});"`);
console.log("\n# Update password:");
console.log(`npx wrangler d1 execute DB --local --command="UPDATE users SET password_hash = '${hash}' WHERE username = '${sqlUsername}';"`);
