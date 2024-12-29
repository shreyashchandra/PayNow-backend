const mongoose = require("mongoose");
const { Schema } = require("zod");

async function dbConnect() {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/paytm`);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.log(error);
  }
}

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxLength: 30,
    },
    password: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxLength: 50,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxLength: 50,
    },
  },
  { timestamps: true }
);

const bankSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId, // Reference to User model
      ref: "User",
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const moneyRequestSchema = new mongoose.Schema(
  {
    requsterToId: {
      type: mongoose.Schema.Types.ObjectId, // Reference to User model
      ref: "User",
      required: true,
    },
    requestFromIdId: {
      type: mongoose.Schema.Types.ObjectId, // Reference to User model
      ref: "User",
      required: true,
    },
    amountRequested: {
      type: Number,
      required: true,
    },
    status: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId, // Reference to User model
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    status: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const Account = mongoose.model("Account", bankSchema);
const User = mongoose.model("User", userSchema);
const Request = mongoose.model("Request", moneyRequestSchema);
const Notification = mongoose.model("Notification", notificationSchema);

module.exports = { User, dbConnect, Account, Request, Notification };
