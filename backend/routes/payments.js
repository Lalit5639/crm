const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns, resolveColumn } = require("../utils/schema");

function recalculateOrderPayment(orderId, res) {
  const sql = `
    SELECT
      o.amount,
      COALESCE(SUM(p.amount), 0) AS paid
    FROM orders o
    LEFT JOIN payments p ON p.order_id = o.id
    WHERE o.id = ?
    GROUP BY o.id, o.amount
  `;

  db.query(sql, [orderId], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (rows.length === 0) return res.json({ success: true });

    const paid = Number(rows[0].paid || 0);
    const outstanding = Math.max(Number(rows[0].amount || 0) - paid, 0);
    const paymentStatus = paid === 0 ? "Pending" : outstanding === 0 ? "Paid" : "Partial";

    db.query(
      "UPDATE orders SET paid_amount=?, outstanding=?, payment_status=? WHERE id=?",
      [paid, outstanding, paymentStatus, orderId],
      (updateErr) => {
        if (updateErr) return res.status(500).json(updateErr);
        res.json({ success: true });
      }
    );
  });
}

router.get("/", async (req, res) => {
  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);

    const sql = `
      SELECT
        p.*,
        o.id AS order_id,
        o.amount AS invoice_amount,
        o.outstanding,
        o.payment_status,
        e.name AS rdm_name,
        e.zm_name,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN employees e ON o.employee_id = e.id
      ORDER BY p.id ASC
    `;

    db.query(sql, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/orders", async (req, res) => {
  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);

    const sql = `
      SELECT DISTINCT
        o.id,
        o.amount,
        o.outstanding,
        CASE
          WHEN o.outstanding > 0 THEN o.outstanding
          ELSE o.amount
        END AS payable_amount,
        d.${dealerNameColumn} AS dealer_name
      FROM orders o
      INNER JOIN delivery_proof dp ON dp.order_id = o.id
      LEFT JOIN payments p ON p.order_id = o.id
      LEFT JOIN dealers d ON o.dealer_id = d.id
      WHERE o.outstanding > 0 OR p.id IS NULL
      ORDER BY o.id ASC
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
  let { order_id, amount, mode, reference_no, status, notes, date, payment_date } = req.body;
  date = date || payment_date;
  amount = Number(amount);

  if (!order_id || !amount) {
    return res.json({ success: false, message: "Missing fields" });
  }

  const sql = `
    SELECT
      o.amount,
      o.paid_amount,
      o.outstanding,
      COUNT(p.id) AS payment_count,
      COUNT(dp.id) AS delivery_proof_count
    FROM orders o
    LEFT JOIN delivery_proof dp ON dp.order_id = o.id
    LEFT JOIN payments p ON p.order_id = o.id
    WHERE o.id = ?
    GROUP BY o.id, o.amount, o.paid_amount, o.outstanding
  `;

  db.query(sql, [order_id], async (err, result) => {
    if (err) return res.status(500).json(err);
    if (result.length === 0) {
      return res.json({ success: false, message: "Order not found" });
    }

    const order = result[0];

    if (Number(order.delivery_proof_count || 0) === 0) {
      return res.status(400).json({
        success: false,
        message: "Payment can be added only after delivery proof entry."
      });
    }

    const currentPaid = Number(order.payment_count || 0) === 0 && Number(order.outstanding || 0) === 0
      ? 0
      : Number(order.paid_amount);
    const newPaid = currentPaid + amount;
    const newOutstanding = Math.max(Number(order.amount) - newPaid, 0);
    const paymentStatus = newOutstanding === 0 ? "Paid" : "Partial";

    try {
      const columns = await getTableColumns("payments");
      const insertColumns = ["order_id", "amount", "date"];
    const values = [order_id, amount, date || new Date()];
      [
        ["mode", mode || "NEFT/RTGS"],
        ["reference_no", reference_no || null],
        ["status", status || paymentStatus],
        ["notes", notes || null],
      ].forEach(([column, value]) => {
        if (columns.includes(column)) {
          insertColumns.push(column);
          values.push(value);
        }
      });

      const placeholders = insertColumns.map(() => "?").join(", ");
      db.query(`INSERT INTO payments (${insertColumns.join(", ")}) VALUES (${placeholders})`, values);

      db.query(
        "UPDATE orders SET paid_amount=?, outstanding=?, payment_status=? WHERE id=?",
        [newPaid, newOutstanding, paymentStatus, order_id],
        (updateErr) => {
          if (updateErr) return res.status(500).json(updateErr);
          res.json({ success: true });
        }
      );
    } catch (schemaErr) {
      res.status(500).json(schemaErr);
    }
  });
});

router.delete("/:id", (req, res) => {
  db.query("SELECT order_id FROM payments WHERE id = ?", [req.params.id], (selectErr, rows) => {
    if (selectErr) return res.status(500).json(selectErr);
    if (rows.length === 0) return res.json({ success: true, deleted: 0 });

    const orderId = rows[0].order_id;
    db.query("DELETE FROM payments WHERE id = ?", [req.params.id], (deleteErr) => {
      if (deleteErr) return res.status(500).json(deleteErr);
      recalculateOrderPayment(orderId, res);
    });
  });
});

module.exports = router;
