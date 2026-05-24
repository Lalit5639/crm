const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");

function loadEnv() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

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

function shouldUsePostgres() {
  return /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || "")
    || process.env.DB_CLIENT === "postgres";
}

function quoteIdentifier(identifier) {
  return String(identifier)
    .split(".")
    .map((part) => `"${part.replace(/"/g, "\"\"")}"`)
    .join(".");
}

function translateSql(sql, params = []) {
  const values = [];
  let paramIndex = 0;

  let translated = sql.replace(/\?\?/g, () => {
    const identifier = params[paramIndex++];
    return quoteIdentifier(identifier);
  });

  translated = translated
    .replace(/`([^`]+)`/g, (_, identifier) => quoteIdentifier(identifier))
    .replace(/\bCURDATE\(\)/gi, "CURRENT_DATE")
    .replace(/\bMONTH\(([^)]+)\)/gi, "EXTRACT(MONTH FROM $1)")
    .replace(/\bYEAR\(([^)]+)\)/gi, "EXTRACT(YEAR FROM $1)")
    .replace(/\bDATEDIFF\(CURRENT_DATE,\s*([^)]+)\)/gi, "(CURRENT_DATE - ($1)::date)")
    .replace(/\bAS\s+'([^']+)'/gi, (_, alias) => `AS ${quoteIdentifier(alias)}`)
    .replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/g, (_, alias) => `AS ${quoteIdentifier(alias)}`)
    .replace(/\bDATETIME\b/gi, "TIMESTAMP")
    .replace(/\bINT\b/gi, "INTEGER");

  translated = translated.replace(/\?/g, () => {
    values.push(params[paramIndex++]);
    return `$${values.length}`;
  });

  if (/^\s*INSERT\s+INTO/i.test(translated) && !/\bRETURNING\b/i.test(translated)) {
    translated = `${translated} RETURNING id`;
  }

  return { sql: translated, values };
}

function createPostgresPool() {
  const { Pool } = require("pg");
  const connectionString = process.env.DATABASE_URL;
  const isNeon = /neon\.tech|neon\.database/i.test(connectionString || "");
  const ssl = process.env.DB_SSL === "false"
    ? false
    : (process.env.DB_SSL === "true" || isNeon ? { rejectUnauthorized: false } : undefined);
  const pool = new Pool({
    connectionString,
    ssl,
    max: Number(process.env.DB_CONNECTION_LIMIT || 10),
  });

  function normalizeArgs(sql, params, callback) {
    if (typeof params === "function") {
      return { sql, params: [], callback: params };
    }

    return { sql, params: params || [], callback };
  }

  function mapResult(result) {
    if (result.command === "SELECT" || result.command === "SHOW") {
      return result.rows;
    }

    return {
      affectedRows: result.rowCount,
      insertId: result.rows?.[0]?.id,
      rows: result.rows,
    };
  }

  return {
    dialect: "postgres",
    escapeId: quoteIdentifier,
    query(sql, params, callback) {
      const args = normalizeArgs(sql, params, callback);
      const translated = translateSql(args.sql, args.params);
      const promise = pool.query(translated.sql, translated.values).then(mapResult);

      if (args.callback) {
        promise
          .then((result) => args.callback(null, result))
          .catch((err) => args.callback(err));
        return;
      }

      return promise;
    },
    promise() {
      return {
        query: async (sql, params = []) => {
          const translated = translateSql(sql, params);
          const result = await pool.query(translated.sql, translated.values);
          const finalResult = Array.isArray(result) ? result[result.length - 1] : result;
          return [finalResult.rows || [], finalResult.fields];
        },
      };
    },
    getConnection(callback) {
      pool.connect((err, client, release) => {
        if (err) {
          callback(err);
          return;
        }

        callback(null, {
          release,
          query: client.query.bind(client),
        });
      });
    },
  };
}

function createMysqlPool() {
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
  db.dialect = "mysql";
  db.escapeId = mysql.escapeId;

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

  return db;
}

const db = shouldUsePostgres() ? createPostgresPool() : createMysqlPool();

module.exports = db;
