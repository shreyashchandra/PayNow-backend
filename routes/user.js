const express = require("express");
const router = express.Router();
const { User } = require("../db");
const { Account } = require("../db");
const zod = require("zod");
const jwt = require("jsonwebtoken");
const { authMiddleware } = require("../middleware/authMiddleware");

const signupBody = zod.object({
  username: zod.string(),
  firstName: zod.string(),
  lastName: zod.string(),
  password: zod.string(),
});

const signinBody = zod.object({
  username: zod.string(),
  password: zod.string(),
});

const updateBody = zod.object({
  password: zod.string().optional(),
  firstName: zod.string().optional(),
  lastName: zod.string().optional(),
});

router.get("/", (req, res) => {
  res.send({ msg: "Hello from user route" });
});

router.post("/signup", async (req, res) => {
  const { data, error } = signupBody.safeParse(req.body);

  if (error) {
    return res.status(411).json({
      msg: "Invalid credentials",
    });
  }

  const existingUser = await User.findOne({
    username: req.body.username,
  });

  if (existingUser) {
    return res.status(411).json({
      msg: "User already exists",
    });
  }

  const user = await User.create({
    username: data.username,
    password: data.password,
    firstName: data.firstName, // Corrected property name
    lastName: data.lastName, // Corrected property name
  });

  const userId = user._id;

  userBankAccount = await Account.create({
    userId,
    balance: Math.floor(Math.random() * (100000 - 10000 + 1)) + 10000,
  });

  const token = jwt.sign(
    {
      userId,
    },
    process.env.JWT_SECRET
  );

  return res.status(200).json({
    msg: "User Created",
    token: token,
    userId: userId,
    firstName: user.firstName,
  });
});

router.post("/signin", async (req, res) => {
  const { data, error } = signinBody.safeParse(req.body);

  if (error) {
    return res.status(411).json({
      message: "Email already taken / Incorrect inputs",
    });
  }
  const user = await User.findOne({
    username: data.username,
    password: data.password,
  });

  if (!user) {
    return res.status(411).json({
      message: "Error while logging in",
    });
  }

  const token = jwt.sign(
    {
      userId: user._id,
    },
    process.env.JWT_SECRET
  );

  return res.status(200).json({
    token: token,
    msg: "User logedin",
    firstName: user.firstName,
  });
});

router.put("/user-update", authMiddleware, async (req, res) => {
  const { data, error } = updateBody.safeParse(req.body);

  if (error) {
    return res.status(403).json({ msg: "Invalid credential" });
  }

  try {
    await User.updateOne({ _id: req.userId }, { $set: data });
    return res.status(200).json({ msg: "Updated successfully" });
  } catch (err) {
    console.error("Error updating user:", err.message);
    return res.status(500).json({ msg: "Internal Server Error" });
  }
});

router.get("/bulk", async (req, res) => {
  const filter = req.query.filter || "";

  const users = await User.find({
    $or: [
      {
        firstName: {
          $regex: filter,
        },
      },
      {
        lastName: {
          $regex: filter,
        },
      },
    ],
  });

  res.json({
    user: users.map((user) => ({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      _id: user._id,
    })),
  });
});

module.exports = router;
