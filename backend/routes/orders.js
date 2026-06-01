const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns, resolveColumn } = require("../utils/schema");

router.get("/", async (req, res) => {
  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);
    const employeeCodeColumn = await resolveColumn("employees", ["emp_code"]);

    const sql = `
      SELECT
        o.*,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile,
        p.name AS product_name,
        p.product_code,
        e.name AS employee_name,
        ${employeeCodeColumn ? `e.${employeeCodeColumn}` : "NULL"} AS employee_code
      FROM orders o
      LEFT JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN employees e ON o.employee_id = e.id
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
  let {
    dealer_id,
    order_date,
    product_id,
    employee_id,
    qty,
    rate,
    payment_type,
    paid_amount,
    credit_due_date,
    payment_status,
    notes,
    confirmation_message,
  } = req.body;

  qty = Number(qty);
  rate = Number(rate);
  paid_amount = Number(paid_amount || 0);

  if (!dealer_id || !product_id || !qty || !rate || !payment_type) {
    return res.json({ success: false, message: "Missing fields" });
  }

  const amount = qty * rate;
  let paid = paid_amount;
  let outstanding = Math.max(amount - paid, 0);

  if (payment_type === "CASH") {
    paid = amount;
    outstanding = 0;
  }

  try {
    const columns = await getTableColumns("orders");
    const insertColumns = [
      "order_date",
      "dealer_id",
      "product_id",
      "qty",
      "rate",
      "amount",
      "payment_type",
      "paid_amount",
      "outstanding",
    ];
    const values = [
      order_date || new Date(),
      dealer_id,
      product_id,
      qty,
      rate,
      amount,
      payment_type,
      paid,
      outstanding,
    ];

    [
      ["employee_id", employee_id || null],
      ["credit_due_date", credit_due_date || null],
      ["payment_status", payment_status || (outstanding === 0 ? "Paid" : "Partial")],
      ["delivered_qty", 0],
      ["pending_qty", qty],
      ["recovery_due_date", credit_due_date || null],
      ["confirmation_message", confirmation_message || "Not Sent"],
      ["notes", notes || null],
      ["status", "PENDING"],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        insertColumns.push(column);
        values.push(value);
      }
    });

    const placeholders = insertColumns.map(() => "?").join(", ");
    const sql = `INSERT INTO orders (${insertColumns.join(", ")}) VALUES (${placeholders})`;

    db.query(sql, values, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true, order_id: result.insertId });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", (req, res) => {
  db.query("DELETE FROM orders WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ success: true, deleted: result.affectedRows });
  });
});

module.exports = router;
