const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns } = require("../utils/schema");

router.get("/", (req, res) => {
  db.query("SELECT * FROM transport ORDER BY id ASC", (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});

router.post("/", async (req, res) => {
  const { transport_name, contact_person, mobile } = req.body;

  if (!transport_name || !contact_person || !mobile) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const columns = await getTableColumns("transport");
    const insertColumns = ["transport_name", "contact_person", "mobile"];
    const values = [transport_name, contact_person, mobile];

    if (columns.includes("created_at")) {
      insertColumns.push("created_at");
      values.push(new Date());
    }

    const placeholders = insertColumns.map(() => "?").join(", ");
    const sql = `INSERT INTO transport (${insertColumns.join(", ")}) VALUES (${placeholders})`;

    db.query(sql, values, (err) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", (req, res) => {
  db.query("DELETE FROM transport WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ success: true, deleted: result.affectedRows });
  });
});

module.exports = router;
