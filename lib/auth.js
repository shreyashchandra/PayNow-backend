const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const BCRYPT_PREFIX = /^\$2[aby]\$\d{2}\$/;

const hashPassword = (plain) => bcrypt.hash(plain, 10);

/**
 * Checks a password against what is stored. Accounts created before hashing
 * was added still hold plain text; those match by direct comparison and are
 * reported with `needsUpgrade` so the caller can re-save them hashed.
 */
async function verifyPassword(plain, stored) {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (BCRYPT_PREFIX.test(stored)) {
    return { ok: await bcrypt.compare(plain, stored), needsUpgrade: false };
  }
  const ok = plain === stored;
  return { ok, needsUpgrade: ok };
}

const signToken = (userId) =>
  jwt.sign({ userId: String(userId) }, process.env.JWT_SECRET, { expiresIn: "7d" });

module.exports = { hashPassword, verifyPassword, signToken };
