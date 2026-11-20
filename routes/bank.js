const express = require("express");
const mongoose = require("mongoose");
const zod = require("zod");

const { authMiddleware } = require("../middleware/authMiddleware");
const { Account, User, Request, Transaction, REQUEST_STATUS } = require("../db");
const { HttpError, asyncHandler, parseBody } = require("../lib/http");

const router = express.Router();

const MAX_AMOUNT = 1000000;

const objectId = (label) =>
  zod
    .string({ required_error: `${label} is required` })
    .refine((v) => mongoose.isValidObjectId(v), `${label} is not valid`);

const amount = zod.coerce
  .number({ invalid_type_error: "Enter an amount" })
  .int("Use whole rupees only")
  .positive("Amount must be more than ₹0")
  .max(MAX_AMOUNT, `You can move at most ₹${MAX_AMOUNT.toLocaleString("en-IN")} at a time`);

const note = zod.string().trim().max(80, "Keep the note under 80 characters").optional();

const transferBody = zod.object({
  amount_to_transfer: amount,
  paye_id: objectId("Recipient"),
  request_id: objectId("Request").optional(),
  note,
});

const requestBody = zod.object({
  amount,
  toId: objectId("Recipient"),
  note,
});

const shortUser = (u) => (u ? { _id: u._id, firstName: u.firstName, lastName: u.lastName } : null);

router.get("/", (req, res) => {
  res.send("Hello");
});

router.get(
  "/balance",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, "This account no longer exists. Please sign in again.");

    let account = await Account.findOne({ userId: req.userId });
    if (!account) {
      // Fallback for accounts whose wallet was never created (e.g. an older
      // signup that failed half-way): open one now instead of erroring forever.
      account = await Account.create({
        userId: req.userId,
        balance: Math.floor(Math.random() * (100000 - 10000 + 1)) + 10000,
      });
    }

    return res.status(200).json({
      msg: "Balanced is fetched",
      balance: account.balance,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
    });
  })
);

router.post(
  "/transfer",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const data = parseBody(transferBody, req.body);
    const value = data.amount_to_transfer;

    if (data.paye_id === String(req.userId)) {
      throw new HttpError(400, "You can't send money to yourself.");
    }

    const recipient = await User.findById(data.paye_id);
    if (!recipient) throw new HttpError(404, "That recipient doesn't exist anymore.");

    const session = await mongoose.startSession();
    let transaction;
    let newBalance;
    try {
      await session.withTransaction(async () => {
        if (data.request_id) {
          const pending = await Request.findOne({
            _id: data.request_id,
            requsterToId: req.userId,
          }).session(session);
          if (!pending) throw new HttpError(404, "That payment request no longer exists.");
          if (pending.status !== REQUEST_STATUS.PENDING) {
            throw new HttpError(409, "This request has already been settled.");
          }
          pending.status = REQUEST_STATUS.PAID;
          await pending.save({ session });
        }

        // Only debits when enough money is there, in a single atomic step.
        const from = await Account.findOneAndUpdate(
          { userId: req.userId, balance: { $gte: value } },
          { $inc: { balance: -value } },
          { new: true, session }
        );
        if (!from) {
          const exists = await Account.exists({ userId: req.userId }).session(session);
          throw exists
            ? new HttpError(400, "You don't have enough balance for this payment.")
            : new HttpError(404, "Your wallet could not be found. Reload and try again.");
        }

        const to = await Account.findOneAndUpdate(
          { userId: data.paye_id },
          { $inc: { balance: value } },
          { new: true, session, upsert: true, setDefaultsOnInsert: true }
        );
        if (!to) throw new HttpError(404, "The recipient's wallet could not be found.");

        [transaction] = await Transaction.create(
          [{ from: req.userId, to: data.paye_id, amount: value, note: data.note, requestId: data.request_id }],
          { session }
        );
        newBalance = from.balance;
      });
    } finally {
      await session.endSession();
    }

    return res.status(200).json({
      msg: "Transfer successful",
      balance: newBalance,
      transaction: {
        _id: transaction._id,
        amount: transaction.amount,
        note: transaction.note,
        createdAt: transaction.createdAt,
        to: shortUser(recipient),
      },
    });
  })
);

router.get(
  "/transactions",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const me = new mongoose.Types.ObjectId(String(req.userId));

    const rows = await Transaction.find({ $or: [{ from: me }, { to: me }] })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("from", "firstName lastName")
      .populate("to", "firstName lastName");

    res.json({
      data: rows.map((t) => {
        const outgoing = String(t.from?._id) === String(me);
        return {
          _id: t._id,
          direction: outgoing ? "out" : "in",
          amount: t.amount,
          note: t.note,
          createdAt: t.createdAt,
          counterparty: shortUser(outgoing ? t.to : t.from) || { firstName: "Deleted", lastName: "user" },
        };
      }),
    });
  })
);

router.post(
  "/create/request",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const data = parseBody(requestBody, req.body);

    if (data.toId === String(req.userId)) {
      throw new HttpError(400, "You can't request money from yourself.");
    }
    const target = await User.exists({ _id: data.toId });
    if (!target) throw new HttpError(404, "That person doesn't exist anymore.");

    const duplicate = await Request.exists({
      requsterToId: data.toId,
      requestFromIdId: req.userId,
      amountRequested: data.amount,
      status: REQUEST_STATUS.PENDING,
    });
    if (duplicate) {
      throw new HttpError(409, "You already have a pending request for this amount with them.");
    }

    const request = await Request.create({
      requsterToId: data.toId,
      requestFromIdId: req.userId,
      amountRequested: data.amount,
      note: data.note,
    });
    res.status(201).json({ message: "Request created", data: request });
  })
);

// Requests other people have sent me that I still need to act on.
router.get(
  "/request/list",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const request = await Request.find({
      requsterToId: req.userId,
      status: REQUEST_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({ path: "requsterToId", model: "User", select: "firstName lastName" })
      .populate({ path: "requestFromIdId", model: "User", select: "firstName lastName" });

    // Drop requests whose sender was deleted.
    res.status(200).json({ message: "ok", data: request.filter((r) => r.requestFromIdId) });
  })
);

router.post(
  "/request/:id/decline",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid request id.");

    const updated = await Request.findOneAndUpdate(
      { _id: req.params.id, requsterToId: req.userId, status: REQUEST_STATUS.PENDING },
      { $set: { status: REQUEST_STATUS.DECLINED } },
      { new: true }
    );
    if (!updated) throw new HttpError(404, "That request was already settled or doesn't exist.");
    res.json({ message: "Request declined" });
  })
);

module.exports = router;
