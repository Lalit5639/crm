const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { ensureTableColumn, getTableColumns, resolveColumn } = require("../utils/schema");

router.get("/", async (req, res) => {
  try {
    await ensureTableColumn("dealers", "party_type", "VARCHAR(20) NOT NULL DEFAULT 'PACS'");
    const nameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const mobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);
    const columns = await getTableColumns("dealers");
    const optionalColumns = [
      "dealer_code",
      "party_type",
      "district",
      "state",
      "credit_limit",
      "active_flag",
      "total_selling_bags",
    ].filter((column) => columns.includes(column));

    const sql = `
      SELECT
        id,
        ${nameColumn} AS dealer_name,
        ${nameColumn} AS name,
        ${mobileColumn} AS phone,
        ${mobileColumn} AS mobile,
        address
        ${optionalColumns.length ? `, ${optionalColumns.join(", ")}` : ""}
      FROM dealers
      ORDER BY id ASC
    `;

    db.query(sql, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post("/", async (req, res) => {
  const {
    dealer_code,
    dealer_name,
    phone,
    address,
    district,
    state,
    credit_limit,
    active_flag,
    total_selling_bags,
    party_type,
  } = req.body;

  if (!dealer_name || !phone || !address) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    await ensureTableColumn("dealers", "party_type", "VARCHAR(20) NOT NULL DEFAULT 'PACS'");
    const columns = await getTableColumns("dealers");
    const nameColumn = columns.includes("dealer_name") ? "dealer_name" : "name";
    const mobileColumn = columns.includes("phone") ? "phone" : "mobile";
    const insertColumns = [nameColumn, mobileColumn, "address"];
    const values = [dealer_name, phone, address];

    [
      ["dealer_code", dealer_code || null],
      ["party_type", party_type === "NON_PACS" ? "NON_PACS" : "PACS"],
      ["district", district || null],
      ["state", state || null],
      ["credit_limit", credit_limit ?? 0],
      ["active_flag", active_flag || "Y"],
      ["total_selling_bags", total_selling_bags ?? 0],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        insertColumns.push(column);
        values.push(value);
      }
    });

    const placeholders = insertColumns.map(() => "?").join(", ");
    db.query(
      `INSERT INTO dealers (${insertColumns.join(", ")}) VALUES (${placeholders})`,
      values,
      (err) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", (req, res) => {
  db.query("DELETE FROM dealers WHERE id = ?", [req.params.id], (err, result) => {
    if (err) {
      return res.status(409).json({
        success: false,
        message: "Dealer is linked with existing orders. Delete related orders first.",
      });
    }
    res.json({ success: true, deleted: result.affectedRows });
  });
});

module.exports = router;
