const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const { authMiddleware } = require("../middleware/authMiddleware");
const { Account } = require("../db");
const { User } = require("../db");
const { Request, Notification } = require("../db");
const zod = require("zod");

const transferBody = zod.object({
  amount_to_transfer: zod.number(),
  paye_id: zod.string(),
});

const transferFunds = async (fromAccountId, toAccountId, amount, session) => {
  try {
    const fromAccount = await Account.findOneAndUpdate(
      { _id: fromAccountId },
      { $inc: { balance: -amount } },
      { new: true, session }
    );

    const toAccount = await Account.findOneAndUpdate(
      { userId: toAccountId },
      { $inc: { balance: amount } },
      { new: true, session }
    );

    if (!fromAccount || !toAccount) {
      throw new Error("Account not found");
    }

    return "Transfer successful";
  } catch (error) {
    console.error(error);
    throw new Error("Error updating balances");
  }
};

router.get("/", (req, res) => {
  res.send("Hello");
});

router.get("/balance", authMiddleware, async (req, res) => {
  const userAccount = await Account.findOne({
    userId: req.userId,
  });

  if (!userAccount) {
    return res.status(403).json({ msg: "User not found" });
  }

  const balance = userAccount.balance;
  const user = await User.findOne({
    _id: req.userId,
  });
  //   console.log(balance);
  return res.status(200).json({
    msg: "Balanced is fetched",
    balance: balance,
    firstName: user.firstName,
  });
});

router.post("/transfer", authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { data, error } = transferBody.safeParse(req.body);
    if (error) {
      throw new Error("Invalid input");
    }

    const userAccount = await Account.findOne({ userId: req.userId }).session(
      session
    );
    const balance = userAccount.balance;

    if (balance < data.amount_to_transfer) {
      throw new Error("Insufficient amount");
    }

    await transferFunds(
      userAccount._id,
      data.paye_id,
      data.amount_to_transfer,
      session
    );
    await session.commitTransaction();

    return res.status(200).json({ msg: "Transfer successful" });
  } catch (error) {
    console.error(error);
    await session.abortTransaction();

    return res
      .status(500)
      .json({ msg: "Internal server error", error: error.message });
  } finally {
    session.endSession();
  }
});

router.post("/create/request", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId;
    console.log("uid", uid);
    const { amount, toId } = req.body;

    const request = await Request.create({
      requsterToId: toId,
      requestFromIdId: uid,
      amountRequested: amount,
    });
    res.status(200).json({ message: "Request created", data: request });
  } catch (error) {
    res.status(500).json({ message: "Somthing went wrong", error });
  }
});

router.get("/request/list", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId;
    console.log("uid", uid);

    const request = await Request.find({
      requsterToId: uid,
    })
      .populate({
        path: "requsterToId",
        model: "User",
        select: "firstName",
      })
      .populate({
        path: "requestFromIdId",
        model: "User",
        select: "firstName",
      });
    res.status(200).json({ message: "Request created", data: request });
  } catch (error) {
    res.status(500).json({ message: "Somthing went wrong", error });
  }
});
module.exports = router;
