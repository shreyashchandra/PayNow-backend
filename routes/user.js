const express = require("express");
const mongoose = require("mongoose");
const zod = require("zod");
const { User, Account } = require("../db");
const { authMiddleware } = require("../middleware/authMiddleware");
const { HttpError, asyncHandler, parseBody, escapeRegex } = require("../lib/http");
const { hashPassword, verifyPassword, signToken } = require("../lib/auth");

const router = express.Router();

const name = (label) =>
  zod
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(50, `${label} must be 50 characters or fewer`);

const signupBody = zod.object({
  username: zod
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
  firstName: name("First name"),
  lastName: name("Last name"),
  password: zod
    .string({ required_error: "Password is required" })
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password is too long"),
});

const signinBody = zod.object({
  username: zod
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .min(1, "Email is required"),
  password: zod.string({ required_error: "Password is required" }).min(1, "Password is required"),
});

const updateBody = zod
  .object({
    currentPassword: zod
      .string({ required_error: "Enter your current password to save changes" })
      .min(1, "Enter your current password to save changes"),
    firstName: name("First name").optional(),
    lastName: name("Last name").optional(),
    newPassword: zod
      .string()
      .min(6, "New password must be at least 6 characters")
      .max(128, "New password is too long")
      .optional(),
  })
  .refine((d) => d.firstName || d.lastName || d.newPassword, {
    message: "Change at least one field",
    path: ["form"],
  });

const startingBalance = () => Math.floor(Math.random() * (100000 - 10000 + 1)) + 10000;

const publicUser = (user) => ({
  _id: user._id,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
});

router.get("/", (req, res) => {
  res.json({ msg: "Hello from user route" });
});

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const data = parseBody(signupBody, req.body);

    const existingUser = await User.exists({ username: data.username });
    if (existingUser) {
      throw new HttpError(409, "An account with this email already exists. Try signing in.", {
        fields: { username: "An account with this email already exists" },
      });
    }

    const password = await hashPassword(data.password);

    // User and wallet are created together, or not at all.
    const session = await mongoose.startSession();
    let user;
    let balance;
    try {
      await session.withTransaction(async () => {
        [user] = await User.create(
          [{ username: data.username, password, firstName: data.firstName, lastName: data.lastName }],
          { session }
        );
        balance = startingBalance();
        await Account.create([{ userId: user._id, balance }], { session });
      });
    } catch (err) {
      if (err.code === 11000) {
        throw new HttpError(409, "An account with this email already exists. Try signing in.", {
          fields: { username: "An account with this email already exists" },
        });
      }
      throw err;
    } finally {
      await session.endSession();
    }

    return res.status(201).json({
      msg: "User Created",
      token: signToken(user._id),
      userId: user._id,
      firstName: user.firstName,
      user: publicUser(user),
      balance,
    });
  })
);

router.post(
  "/signin",
  asyncHandler(async (req, res) => {
    const data = parseBody(signinBody, req.body);

    const user = await User.findOne({ username: data.username });
    const check = await verifyPassword(data.password, user?.password);

    if (!user || !check.ok) {
      throw new HttpError(401, "That email and password don't match. Please try again.");
    }

    if (check.needsUpgrade) {
      // Older account stored in plain text: re-save it hashed. Not fatal if this fails.
      try {
        user.password = await hashPassword(data.password);
        await user.save();
      } catch (err) {
        console.error("[auth] could not upgrade password hash:", err.message);
      }
    }

    return res.status(200).json({
      msg: "User logedin",
      token: signToken(user._id),
      firstName: user.firstName,
      user: publicUser(user),
    });
  })
);

router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, "This account no longer exists. Please sign in again.");
    res.json({ user: publicUser(user) });
  })
);

router.put(
  "/user-update",
  authMiddleware,
  asyncHandler(async (req, res) => {
    // Older clients wrapped the body in { payload }; accept both shapes.
    const raw = req.body?.payload ?? req.body;
    // Older clients sent the current password as `password`.
    if (raw && raw.password && !raw.currentPassword) raw.currentPassword = raw.password;
    const data = parseBody(updateBody, raw);

    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, "This account no longer exists. Please sign in again.");

    const check = await verifyPassword(data.currentPassword, user.password);
    if (!check.ok) {
      throw new HttpError(403, "Current password is incorrect.", {
        fields: { currentPassword: "Current password is incorrect" },
      });
    }

    if (data.firstName) user.firstName = data.firstName;
    if (data.lastName) user.lastName = data.lastName;
    if (data.newPassword) user.password = await hashPassword(data.newPassword);
    else if (check.needsUpgrade) user.password = await hashPassword(data.currentPassword);

    await user.save();
    return res.status(200).json({ msg: "Updated successfully", user: publicUser(user) });
  })
);

router.get(
  "/bulk",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const filter = String(req.query.filter || "").trim().slice(0, 50);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;

    const pattern = escapeRegex(filter);
    const query = {
      _id: { $ne: req.userId }, // you can't pay yourself
      $or: [
        { firstName: { $regex: pattern, $options: "i" } },
        { lastName: { $regex: pattern, $options: "i" } },
      ],
    };

    const [users, totalUsers] = await Promise.all([
      User.find(query).sort({ firstName: 1, lastName: 1 }).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);

    res.json({
      users: users.map((u) => ({ _id: u._id, firstName: u.firstName, lastName: u.lastName })),
      totalPages: Math.max(1, Math.ceil(totalUsers / limit)),
      currentPage: page,
      total: totalUsers,
    });
  })
);

module.exports = router;
