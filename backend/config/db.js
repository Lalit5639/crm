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

const config = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "phoenix_crm",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
};

const db = mysql.createPool(config);

db.getConnection((err, connection) => {
  if (err) {
    console.error("MySQL connection failed:", err.message);
    console.error(`Tried ${config.user}@${config.host}:${config.port}/${config.database}`);
    return;
  }

  console.log(`MySQL connected: ${config.user}@${config.host}:${config.port}/${config.database}`);
  connection.release();
});

module.exports = db;
