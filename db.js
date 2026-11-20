const mongoose = require("mongoose");

const DB_NAME = process.env.MONGODB_DB || "paytm";
const RETRY_DELAY_MS = 5000;

// Fail queries fast while disconnected instead of letting them hang for 10s.
mongoose.set("bufferTimeoutMS", 3000);

mongoose.connection.on("connected", () => console.log("[db] connected"));
mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
mongoose.connection.on("error", (err) => console.error("[db] error:", err.message));

/**
 * Connects to MongoDB and keeps retrying on failure, so a slow or briefly
 * unavailable cluster doesn't leave the server permanently broken.
 */
async function dbConnect() {
  if (!process.env.MONGODB_URI) {
    console.error("[db] MONGODB_URI is not set. The API will answer 503 until it is.");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: 10000,
    });
  } catch (error) {
    console.error(`[db] connection failed (${error.message}). Retrying in ${RETRY_DELAY_MS / 1000}s`);
    setTimeout(dbConnect, RETRY_DELAY_MS);
  }
}

const isDbReady = () => mongoose.connection.readyState === 1;

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxLength: 254,
    },
    password: { type: String, required: true },
    firstName: { type: String, required: true, trim: true, maxLength: 50 },
    lastName: { type: String, required: true, trim: true, maxLength: 50 },
  },
  { timestamps: true }
);

const bankSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    balance: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// Status codes for money requests.
const REQUEST_STATUS = { PENDING: 0, PAID: 1, DECLINED: 2 };

// Field names are kept as-is so existing documents keep working:
// requsterToId = the user being asked to pay, requestFromIdId = the user asking.
const moneyRequestSchema = new mongoose.Schema(
  {
    requsterToId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestFromIdId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amountRequested: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, maxLength: 80 },
    status: { type: Number, default: REQUEST_STATUS.PENDING },
  },
  { timestamps: true }
);

const transactionSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, maxLength: 80 },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "Request" },
  },
  { timestamps: true }
);

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    status: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Account = mongoose.model("Account", bankSchema);
const User = mongoose.model("User", userSchema);
const Request = mongoose.model("Request", moneyRequestSchema);
const Transaction = mongoose.model("Transaction", transactionSchema);
const Notification = mongoose.model("Notification", notificationSchema);

module.exports = {
  dbConnect,
  isDbReady,
  User,
  Account,
  Request,
  Transaction,
  Notification,
  REQUEST_STATUS,
};
