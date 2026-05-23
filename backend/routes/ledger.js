const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns, query, resolveColumn } = require("../utils/schema");

function dbQuery(sql, params, res, onSuccess) {
  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json(err);
    onSuccess(result);
  });
}

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

  dbQuery(sql, [orderId], res, (rows) => {
    if (rows.length === 0) return res.json({ success: true });

    const paid = Number(rows[0].paid || 0);
    const amount = Number(rows[0].amount || 0);
    const outstanding = Math.max(amount - paid, 0);
    const paymentStatus = paid === 0 ? "Pending" : outstanding === 0 ? "Paid" : "Partial";

    dbQuery(
      "UPDATE orders SET paid_amount=?, outstanding=?, payment_status=? WHERE id=?",
      [paid, outstanding, paymentStatus, orderId],
      res,
      () => res.json({ success: true })
    );
  });
}

router.get("/:dealer_id", async (req, res) => {
  const dealerId = req.params.dealer_id;

  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);
    const productCodeColumn = await resolveColumn("products", ["product_code"]);
    const employeeCodeColumn = await resolveColumn("employees", ["emp_code"]);

    const sql = `
      SELECT
        o.id AS ref_id,
        'ORDER' AS type,
        o.order_date AS date,
        o.amount AS debit,
        0 AS credit,
        o.qty,
        o.rate,
        o.amount,
        o.payment_type,
        o.paid_amount,
        o.outstanding,
        o.payment_status,
        o.status,
        o.credit_due_date,
        o.recovery_due_date,
        o.notes,
        p.name AS product_name,
        ${productCodeColumn ? `p.${productCodeColumn}` : "NULL"} AS product_code,
        e.name AS employee_name,
        ${employeeCodeColumn ? `e.${employeeCodeColumn}` : "NULL"} AS employee_code,
        e.zm_name,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile,
        d.address,
        o.id AS order_id,
        NULL AS mode,
        NULL AS reference_no
      FROM orders o
      LEFT JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN employees e ON o.employee_id = e.id
      WHERE o.dealer_id = ?

      UNION ALL

      SELECT
        pay.id AS ref_id,
        'PAYMENT' AS type,
        pay.date AS date,
        0 AS debit,
        pay.amount AS credit,
        o.qty,
        o.rate,
        o.amount,
        o.payment_type,
        o.paid_amount,
        o.outstanding,
        o.payment_status,
        pay.status,
        o.credit_due_date,
        o.recovery_due_date,
        pay.notes,
        p.name AS product_name,
        ${productCodeColumn ? `p.${productCodeColumn}` : "NULL"} AS product_code,
        e.name AS employee_name,
        ${employeeCodeColumn ? `e.${employeeCodeColumn}` : "NULL"} AS employee_code,
        e.zm_name,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile,
        d.address,
        pay.order_id,
        pay.mode,
        pay.reference_no
      FROM payments pay
      JOIN orders o ON pay.order_id = o.id
      LEFT JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN employees e ON o.employee_id = e.id
      WHERE o.dealer_id = ?

      ORDER BY date ASC, type ASC, ref_id ASC
    `;

    const result = await query(sql, [dealerId, dealerId]);
    let balance = 0;
    const ledger = result.map((row) => {
      balance += Number(row.debit || 0) - Number(row.credit || 0);
      return { ...row, balance };
    });

    res.json(ledger);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.put("/order/:id", async (req, res) => {
  const { order_date, qty, rate, notes, credit_due_date, status } = req.body;
  const nextQty = Number(qty);
  const nextRate = Number(rate);

  if (!nextQty || !nextRate) {
    return res.status(400).json({ success: false, message: "Qty and rate are required." });
  }

  try {
    const columns = await getTableColumns("orders");
    const amount = nextQty * nextRate;
    const rows = await query(
      `
        SELECT
          o.payment_type,
          COALESCE(o.paid_amount, 0) AS paid_amount,
          COALESCE(SUM(p.amount), 0) AS payment_sum
        FROM orders o
        LEFT JOIN payments p ON p.order_id = o.id
        WHERE o.id = ?
        GROUP BY o.id, o.payment_type, o.paid_amount
      `,
      [req.params.id]
    );
    const paidFromPayments = Number(rows[0]?.payment_sum || 0);
    const paidAmount = paidFromPayments > 0
      ? paidFromPayments
      : rows[0]?.payment_type === "CASH"
        ? amount
        : Number(rows[0]?.paid_amount || 0);
    const outstanding = Math.max(amount - paidAmount, 0);
    const paymentStatus = paidAmount === 0 ? "Pending" : outstanding === 0 ? "Paid" : "Partial";

    const updates = ["qty=?", "rate=?", "amount=?", "paid_amount=?", "outstanding=?", "payment_status=?"];
    const values = [nextQty, nextRate, amount, paidAmount, outstanding, paymentStatus];

    [
      ["notes", notes || null],
      ["credit_due_date", credit_due_date || null],
      ["recovery_due_date", credit_due_date || null],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        updates.push(`${column}=?`);
        values.push(value);
      }
    });

    if (order_date && columns.includes("order_date")) {
      updates.push("order_date=?");
      values.push(order_date);
    }

    if (status && columns.includes("status")) {
      updates.push("status=?");
      values.push(status);
    }

    values.push(req.params.id);
    await query(`UPDATE orders SET ${updates.join(", ")} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.put("/payment/:id", async (req, res) => {
  const { date, amount, mode, reference_no, status, notes } = req.body;
  const nextAmount = Number(amount);

  if (!nextAmount) {
    return res.status(400).json({ success: false, message: "Payment amount is required." });
  }

  try {
    const columns = await getTableColumns("payments");
    const rows = await query("SELECT order_id FROM payments WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }

    const updates = ["amount=?"];
    const values = [nextAmount];

    [
      ["mode", mode || null],
      ["reference_no", reference_no || null],
      ["notes", notes || null],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        updates.push(`${column}=?`);
        values.push(value);
      }
    });

    if (date && columns.includes("date")) {
      updates.push("date=?");
      values.push(date);
    }

    if (status && columns.includes("status")) {
      updates.push("status=?");
      values.push(status);
    }

    values.push(req.params.id);
    await query(`UPDATE payments SET ${updates.join(", ")} WHERE id = ?`, values);
    recalculateOrderPayment(rows[0].order_id, res);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
