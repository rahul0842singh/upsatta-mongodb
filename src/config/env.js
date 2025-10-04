require("dotenv").config();

const env = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 4000,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/satta_king",
  NODE_ENV: process.env.NODE_ENV || "development"
};

module.exports = { env };
