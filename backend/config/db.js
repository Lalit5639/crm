const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envFile = fs.readFileSync(envPath, "utf8");

  envFile.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnv();

const config = process.env.DATABASE_URL ? {
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
} : {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "phoenix_crm",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  multipleStatements: true,
};

if (process.env.DB_SSL === "true") {
  config.ssl = { rejectUnauthorized: false };
}

const db = mysql.createPool(config);

db.getConnection((err, connection) => {
  if (err) {
    console.error("MySQL connection failed:", err.message);
    console.error(`Tried ${config.user}@${config.host}:${config.port}/${config.database}`);
    return;
  }

  const target = process.env.DATABASE_URL
    ? "DATABASE_URL"
    : `${config.user}@${config.host}:${config.port}/${config.database}`;

  console.log(`MySQL connected: ${target}`);
  connection.release();
});

module.exports = db;
