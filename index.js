const express = require("express");
const mainRoute = require("./routes/index");
const { dbConnect } = require("./db");
var cors = require("cors");
require("dotenv").config();
var cron = require("node-cron");
const fetch = require("node-fetch");

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use("/api/v1", mainRoute);

dbConnect();

cron.schedule("*/20 * * * * *", async () => {
  try {
    const res = await fetch(`https://paynow-backend.onrender.com/api/v1/user/`);
    console.log(
      `Ping successful: ${res.status} - ${new Date().toLocaleTimeString()}`
    );
  } catch (error) {
    console.error("Ping failed:", error.message);
  }
});

app.listen(port, () => {
  console.log(`server started at:- http://localhost:${port}/`);
});
