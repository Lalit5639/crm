const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns } = require("../utils/schema");

router.get("/", (req, res) => {
  db.query("SELECT * FROM employees ORDER BY id ASC", (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});

router.get("/:id", (req, res) => {
  db.query("SELECT * FROM employees WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json(err);
    if (result.length === 0) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    res.json(result[0]);
  });
});

router.post("/", async (req, res) => {
  const { emp_code, name, mobile, designation, region_district, zm_name, active_flag } = req.body;

  if (!name || !mobile || !designation) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const columns = await getTableColumns("employees");
    const insertColumns = ["name", "mobile", "designation"];
    const values = [name, mobile, designation];

    [
      ["emp_code", emp_code || null],
      ["region_district", region_district || null],
      ["zm_name", zm_name || null],
      ["active_flag", active_flag || "Y"],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        insertColumns.push(column);
        values.push(value);
      }
    });

    if (columns.includes("created_at")) {
      insertColumns.push("created_at");
      values.push(new Date());
    }

    const placeholders = insertColumns.map(() => "?").join(", ");
    db.query(`INSERT INTO employees (${insertColumns.join(", ")}) VALUES (${placeholders})`, values, (err) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", (req, res) => {
  db.query("DELETE FROM employees WHERE id = ?", [req.params.id], (err, result) => {
    if (err) {
      return res.status(409).json({
        success: false,
        message: "Employee is linked with existing orders. Delete related orders first.",
      });
    }
    res.json({ success: true, deleted: result.affectedRows });
  });
});

module.exports = router;
