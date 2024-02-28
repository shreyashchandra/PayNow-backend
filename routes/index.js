const express = require("express");
const userRoute = require("./user");
const bankRoute = require("./bank");
const router = express.Router();

router.use("/user", userRoute);
router.use("/bank", bankRoute);

module.exports = router;
