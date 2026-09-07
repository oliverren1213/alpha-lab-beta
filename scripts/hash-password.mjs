import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run auth:hash -- "your password"');
  process.exit(1);
}
const iterations = 100_000;
const salt = randomBytes(18);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const encode = (value) => value.toString("base64url");
console.log(`pbkdf2$${iterations}$${encode(salt)}$${encode(hash)}`);
