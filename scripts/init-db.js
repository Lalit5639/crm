const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");

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
  port: Number(process.env.DB_PORT || 3306),
  multipleStatements: true,
};

const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");
const connection = mysql.createConnection(config);

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(result);
    });
  });
}

async function ensureUsersSchema() {
  await query("CREATE DATABASE IF NOT EXISTS ??", [process.env.DB_NAME || "phoenix_crm"]);
  await query("USE ??", [process.env.DB_NAME || "phoenix_crm"]);

  const columns = await query("SHOW COLUMNS FROM users");
  const hasUsername = columns.some((column) => column.Field === "username");

  if (!hasUsername) {
    await query("ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL UNIQUE AFTER id");
    await query(
      "UPDATE users SET username = COALESCE(NULLIF(name, ''), NULLIF(email, ''), CONCAT('user', id)) WHERE username IS NULL"
    );
  }
}

async function ensurePaymentsSchema() {
  await query("CREATE DATABASE IF NOT EXISTS ??", [process.env.DB_NAME || "phoenix_crm"]);
  await query("USE ??", [process.env.DB_NAME || "phoenix_crm"]);

  const tables = await query("SHOW TABLES LIKE 'payments'");

  if (!tables.length) {
    return;
  }

  const columns = await query("SHOW COLUMNS FROM payments");
  const names = new Set(columns.map((column) => column.Field));

  if (!names.has("order_id")) {
    await query("ALTER TABLE payments ADD COLUMN order_id INT NULL AFTER id");
  }

  if (!names.has("mode")) {
    await query("ALTER TABLE payments ADD COLUMN mode VARCHAR(30) DEFAULT NULL AFTER amount");
  }

  if (!names.has("reference_no")) {
    await query("ALTER TABLE payments ADD COLUMN reference_no VARCHAR(100) DEFAULT NULL AFTER mode");
  }

  if (!names.has("status")) {
    await query("ALTER TABLE payments ADD COLUMN status VARCHAR(30) DEFAULT 'Paid' AFTER reference_no");
  }

  if (!names.has("notes")) {
    await query("ALTER TABLE payments ADD COLUMN notes TEXT DEFAULT NULL AFTER status");
  }

  if (!names.has("date")) {
    await query("ALTER TABLE payments ADD COLUMN date DATETIME NULL AFTER notes");
  }

  if (names.has("method")) {
    await query("UPDATE payments SET mode = COALESCE(mode, method) WHERE mode IS NULL");
  }

  if (names.has("payment_date")) {
    await query("UPDATE payments SET date = COALESCE(date, payment_date) WHERE date IS NULL");
  }
}

async function initializeSchema() {
  try {
    await ensurePaymentsSchema();
    await query(schema);
  } catch (err) {
    if (err.code !== "ER_BAD_FIELD_ERROR" || !/username/i.test(err.message)) {
      throw err;
    }

    console.warn("Repairing existing users table to add username column...");
    await ensureUsersSchema();
    await ensurePaymentsSchema();
    await query(schema);
  }
}

connection.on("error", (err) => {
  console.error("MySQL connection error:", err.message);
});

connection.connect((connectErr) => {
  if (connectErr) {
    console.error("Database connection failed:", connectErr.message);
    console.error(`Tried ${config.user}@${config.host}:${config.port}`);
    connection.destroy();
    process.exit(1);
  }

  initializeSchema()
    .then(() => {
      console.log("Database ready: phoenix_crm");
      console.log("Default login: admin / 1234");
      connection.end();
    })
    .catch((err) => {
      console.error("Database setup failed:", err.message);
      connection.end();
      process.exit(1);
    });
});
