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

const Account = mongoose.model("Account", bankSchema);
const User = mongoose.model("User", userSchema);

module.exports = { User, dbConnect, Account };
