const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns } = require("../utils/schema");

router.get("/", async (req, res) => {
  try {
    const columns = await getTableColumns("products");
    const selectColumns = ["id", "name"];

    ["product_code", "category", "unit", "hsn", "mrp", "rate", "gst", "active_qty", "active_flag"].forEach((column) => {
      if (columns.includes(column)) {
        selectColumns.push(column);
      }
    });

    db.query(`SELECT ${selectColumns.join(", ")} FROM products ORDER BY id ASC`, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post("/", async (req, res) => {
  const { product_code, name, category, unit, hsn, mrp, rate, gst, active_qty, active_flag } = req.body;

  if (!name || rate === undefined || rate === null || rate === "") {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const columns = await getTableColumns("products");
    const insertColumns = ["name"];
    const values = [name];

    [
      ["product_code", product_code || null],
      ["category", category || null],
      ["unit", unit || null],
      ["hsn", hsn || null],
      ["mrp", mrp ?? 0],
      ["rate", rate],
      ["gst", gst ?? 0],
      ["active_qty", active_qty ?? 0],
      ["active_flag", active_flag || "Y"],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        insertColumns.push(column);
        values.push(value);
      }
    });

    const placeholders = insertColumns.map(() => "?").join(", ");
    db.query(`INSERT INTO products (${insertColumns.join(", ")}) VALUES (${placeholders})`, values, (err) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", (req, res) => {
  db.query("DELETE FROM products WHERE id = ?", [req.params.id], (err, result) => {
    if (err) {
      return res.status(409).json({
        success: false,
        message: "Product is linked with existing orders. Delete related orders first.",
      });
    }
    res.json({ success: true, deleted: result.affectedRows });
  });
});

module.exports = router;
