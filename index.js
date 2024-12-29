const express = require("express");
const mainRoute = require("./routes/index");
const { dbConnect } = require("./db");
var cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use("/api/v1", mainRoute);

dbConnect();

app.listen(port, () => {
  console.log(`server started at:- http://localhost:${port}/`);
});
