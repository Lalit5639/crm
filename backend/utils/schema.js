const db = require("../config/db");

const columnCache = new Map();

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

async function getTableColumns(tableName) {
  if (columnCache.has(tableName)) {
    return columnCache.get(tableName);
  }

  const rows = await query("SHOW COLUMNS FROM ??", [tableName]);
  const columns = rows.map((row) => row.Field);
  columnCache.set(tableName, columns);
  return columns;
}

async function ensureTableColumn(tableName, columnName, columnDefinition) {
  const columns = await getTableColumns(tableName);

  if (columns.includes(columnName)) {
    return columns;
  }

  await query(`ALTER TABLE ?? ADD COLUMN ${columnName} ${columnDefinition}`, [tableName]);
  const nextColumns = [...columns, columnName];
  columnCache.set(tableName, nextColumns);
  return nextColumns;
}

async function resolveColumn(tableName, candidates) {
  const columns = await getTableColumns(tableName);
  return candidates.find((candidate) => columns.includes(candidate)) || null;
}

module.exports = {
  ensureTableColumn,
  getTableColumns,
  query,
  resolveColumn,
};
