const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");
const db = require("../config/db");

function getDbName() {
  return process.env.DB_NAME || "phoenix_crm";
}

function getConnectionConfig(includeDatabase = true) {
  if (process.env.DATABASE_URL) {
    return {
      uri: process.env.DATABASE_URL,
      multipleStatements: true,
    };
  }

  const config = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT || 3306),
    multipleStatements: true,
  };

  if (includeDatabase) {
    config.database = getDbName();
  }

  if (process.env.DB_SSL === "true") {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function getPublicDbConfig() {
  const config = getConnectionConfig();

  if (config.uri) {
    return {
      mode: "DATABASE_URL",
      hasDatabaseUrl: true,
      ssl: Boolean(config.ssl),
    };
  }

  return {
    mode: "DB_HOST",
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    ssl: Boolean(config.ssl),
  };
}

function createConnection(config) {
  return new Promise((resolve, reject) => {
    const connection = mysql.createConnection(config);

    connection.connect((err) => {
      if (err) {
        connection.destroy();
        reject(err);
        return;
      }

      resolve(connection);
    });
  });
}

function queryConnection(connection, sql, params = []) {
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

async function ensureDatabaseExists() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const connection = await createConnection(getConnectionConfig(false));

  try {
    await queryConnection(connection, "CREATE DATABASE IF NOT EXISTS ??", [getDbName()]);
  } finally {
    connection.end();
  }
}

async function initializeDatabase() {
  await ensureDatabaseExists();

  const schemaPath = path.join(__dirname, "..", "..", "database", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  await db.promise().query(schema);
}

async function inspectDatabase() {
  const info = getPublicDbConfig();

  try {
    const [pingRows] = await db.promise().query("SELECT 1 AS ok");
    const [userTables] = await db.promise().query("SHOW TABLES LIKE 'users'");
    const [adminRows] = userTables.length
      ? await db.promise().query("SELECT COUNT(*) AS total FROM users WHERE username = 'admin'")
      : [[{ total: 0 }]];

    return {
      success: true,
      database: info,
      connection: pingRows[0]?.ok === 1 ? "ok" : "unknown",
      usersTable: userTables.length > 0,
      adminUser: Number(adminRows[0]?.total || 0) > 0,
    };
  } catch (err) {
    return {
      success: false,
      database: info,
      error: {
        code: err.code,
        message: err.message,
      },
    };
  }
}

module.exports = {
  initializeDatabase,
  inspectDatabase,
};
