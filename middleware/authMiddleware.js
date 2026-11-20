const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ msg: "Please sign in to continue." });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!mongoose.isValidObjectId(decoded.userId)) {
      return res.status(401).json({ msg: "Your session is invalid. Please sign in again." });
    }
    req.userId = decoded.userId;
    next();
  } catch (err) {
    const msg =
      err.name === "TokenExpiredError"
        ? "Your session has expired. Please sign in again."
        : "Your session is invalid. Please sign in again.";
    return res.status(401).json({ msg });
  }
};

module.exports = { authMiddleware };
