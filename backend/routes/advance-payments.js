const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns, resolveColumn } = require("../utils/schema");

// Get all advance payments
router.get("/", async (req, res) => {
  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);

    const sql = `
      SELECT
        ap.*,
        d.${dealerNameColumn} AS dealer_name,
        d.phone AS dealer_phone,
        COALESCE(SUM(CASE WHEN apa.adjusted_amount > 0 THEN apa.adjusted_amount ELSE 0 END), 0) AS adjusted_amount,
        (ap.amount - COALESCE(SUM(CASE WHEN apa.adjusted_amount > 0 THEN apa.adjusted_amount ELSE 0 END), 0)) AS available_balance
      FROM advance_payments ap
      LEFT JOIN dealers d ON ap.dealer_id = d.id
      LEFT JOIN advance_payment_adjustments apa ON ap.id = apa.advance_payment_id
      GROUP BY ap.id, d.${dealerNameColumn}, d.phone
      ORDER BY ap.payment_date DESC, ap.id DESC
    `;

    db.query(sql, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// Get advance balance by dealer
router.get("/balance/by-dealer", async (req, res) => {
  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);

    const sql = `
      SELECT
        ap.dealer_id,
        d.${dealerNameColumn} AS dealer_name,
        COALESCE(SUM(ap.amount), 0) AS total_advance,
        COALESCE(SUM(CASE WHEN apa.adjusted_amount > 0 THEN apa.adjusted_amount ELSE 0 END), 0) AS total_adjusted,
        (COALESCE(SUM(ap.amount), 0) - COALESCE(SUM(CASE WHEN apa.adjusted_amount > 0 THEN apa.adjusted_amount ELSE 0 END), 0)) AS available_balance
      FROM advance_payments ap
      LEFT JOIN dealers d ON ap.dealer_id = d.id
      LEFT JOIN advance_payment_adjustments apa ON ap.id = apa.advance_payment_id
      GROUP BY ap.dealer_id, d.${dealerNameColumn}
      HAVING available_balance > 0
      ORDER BY d.${dealerNameColumn}
    `;

    db.query(sql, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// Get advance payment details with adjustments
router.get("/:id", async (req, res) => {
  try {
    const sql = `
      SELECT
        ap.*,
        COALESCE(SUM(CASE WHEN apa.adjusted_amount > 0 THEN apa.adjusted_amount ELSE 0 END), 0) AS adjusted_amount,
        (ap.amount - COALESCE(SUM(CASE WHEN apa.adjusted_amount > 0 THEN apa.adjusted_amount ELSE 0 END), 0)) AS available_balance
      FROM advance_payments ap
      LEFT JOIN advance_payment_adjustments apa ON ap.id = apa.advance_payment_id
      WHERE ap.id = ?
      GROUP BY ap.id
    `;

    db.query(sql, [req.params.id], (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0) return res.json({ success: false, message: "Advance payment not found" });
      res.json(result[0]);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// Get adjustments for an advance payment
router.get("/:id/adjustments", async (req, res) => {
  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);

    const sql = `
      SELECT
        apa.*,
        o.order_date,
        d.${dealerNameColumn} AS dealer_name,
        p.id AS payment_id
      FROM advance_payment_adjustments apa
      LEFT JOIN advance_payments ap ON apa.advance_payment_id = ap.id
      LEFT JOIN orders o ON apa.order_id = o.id
      LEFT JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN payments p ON apa.payment_id = p.id
      WHERE apa.advance_payment_id = ?
      ORDER BY apa.adjustment_date DESC
    `;

    db.query(sql, [req.params.id], (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// Create advance payment
router.post("/", async (req, res) => {
  const { dealer_id, amount, mode, reference_no, remarks, payment_date } = req.body;

  if (!dealer_id || !amount) {
    return res.json({ success: false, message: "Missing required fields: dealer_id, amount" });
  }

  try {
    const columns = await getTableColumns("advance_payments");
    const insertColumns = ["dealer_id", "amount", "payment_date"];
    const values = [dealer_id, Number(amount), payment_date || new Date()];

    [
      ["mode", mode || "NEFT/RTGS"],
      ["reference_no", reference_no || null],
      ["remarks", remarks || null],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        insertColumns.push(column);
        values.push(value);
      }
    });

    const placeholders = insertColumns.map(() => "?").join(", ");
    const sql = `INSERT INTO advance_payments (${insertColumns.join(", ")}) VALUES (${placeholders})`;

    db.query(sql, values, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true, advance_payment_id: result.insertId });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// Update advance payment
router.put("/:id", async (req, res) => {
  const { amount, mode, reference_no, remarks, payment_date } = req.body;

  try {
    const columns = await getTableColumns("advance_payments");
    const updates = [
      ["amount", amount || null],
      ["mode", mode || null],
      ["reference_no", reference_no || null],
      ["remarks", remarks || null],
      ["payment_date", payment_date || null],
    ].filter(([column]) => columns.includes(column));

    if (updates.length === 0) {
      return res.json({ success: false, message: "No fields to update" });
    }

    const setClause = updates.map(([column]) => `${column} = ?`).join(", ");
    const values = updates.map(([, value]) => value);
    values.push(req.params.id);

    db.query(`UPDATE advance_payments SET ${setClause} WHERE id = ?`, values, (err) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// Adjust advance payment against an order
router.post("/:id/adjust", async (req, res) => {
  const { order_id, payment_id, adjusted_amount } = req.body;

  if (!order_id || !adjusted_amount) {
    return res.json({ success: false, message: "Missing required fields: order_id, adjusted_amount" });
  }

  try {
    // Verify advance payment exists
    db.query("SELECT amount FROM advance_payments WHERE id = ?", [req.params.id], (err, apRows) => {
      if (err) return res.status(500).json(err);
      if (apRows.length === 0) {
        return res.json({ success: false, message: "Advance payment not found" });
      }

      // Calculate current adjusted amount
      db.query(
        "SELECT COALESCE(SUM(adjusted_amount), 0) AS total_adjusted FROM advance_payment_adjustments WHERE advance_payment_id = ?",
        [req.params.id],
        (err, adjRows) => {
          if (err) return res.status(500).json(err);

          const totalAdjusted = Number(adjRows[0].total_adjusted || 0) + Number(adjusted_amount);
          const availableAmount = Number(apRows[0].amount);

          if (totalAdjusted > availableAmount) {
            return res.json({
              success: false,
              message: `Adjustment exceeds available balance. Available: ${availableAmount}, Already adjusted: ${Number(adjRows[0].total_adjusted || 0)}`
            });
          }

          // Insert adjustment
          const insertSql = `
            INSERT INTO advance_payment_adjustments (advance_payment_id, order_id, payment_id, adjusted_amount, adjustment_date)
            VALUES (?, ?, ?, ?, ?)
          `;

          db.query(
            insertSql,
            [req.params.id, order_id, payment_id || null, Number(adjusted_amount), new Date()],
            (insertErr) => {
              if (insertErr) return res.status(500).json(insertErr);
              res.json({ success: true });
            }
          );
        }
      );
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// Reverse adjustment
router.delete("/:id/adjustments/:adjustment_id", (req, res) => {
  db.query(
    "DELETE FROM advance_payment_adjustments WHERE id = ? AND advance_payment_id = ?",
    [req.params.adjustment_id, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true, deleted: result.affectedRows });
    }
  );
});

// Delete advance payment (only if no adjustments)
router.delete("/:id", (req, res) => {
  // Check if any adjustments exist
  db.query("SELECT COUNT(*) AS count FROM advance_payment_adjustments WHERE advance_payment_id = ?", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (rows[0].count > 0) {
      return res.json({ success: false, message: "Cannot delete advance payment with adjustments. Delete adjustments first." });
    }

    db.query("DELETE FROM advance_payments WHERE id = ?", [req.params.id], (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true, deleted: result.affectedRows });
    });
  });
});

module.exports = router;
