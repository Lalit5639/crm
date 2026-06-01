const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { getTableColumns, resolveColumn } = require("../utils/schema");

router.get("/", async (req, res) => {
  try {
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);

    const sql = `
      SELECT
        d.*,
        o.id AS order_id,
        o.amount AS total_amount,
        o.status AS order_status,
        o.qty AS order_qty,
        o.pending_qty,
        p.name AS product_name,
        p.product_code,
        de.${dealerNameColumn} AS dealer_name,
        de.${dealerMobileColumn} AS mobile
      FROM dispatch d
      JOIN orders o ON d.order_id = o.id
      JOIN dealers de ON o.dealer_id = de.id
      LEFT JOIN products p ON o.product_id = p.id
      ORDER BY d.id ASC
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
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);

    const sql = `
      SELECT
        o.id,
        o.amount,
        o.qty,
        o.pending_qty,
        o.status,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile
      FROM orders o
      JOIN dealers d ON o.dealer_id = d.id
      WHERE COALESCE(o.status, 'PENDING') NOT IN ('DISPATCHED', 'DELIVERED')
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
  const {
    order_id,
    invoice_no,
    transport_name,
    dispatch_date,
    vehicle_no,
    driver_name,
    driver_phone,
    lr_no,
    eway_bill,
    dispatch_remarks,
  } = req.body;

  if (!order_id || !transport_name) {
    return res.json({ success: false, message: "Missing fields" });
  }

  try {
    const columns = await getTableColumns("dispatch");
    const insertColumns = ["order_id", "transport_name", "dispatch_date"];
    const values = [order_id, transport_name, dispatch_date || new Date()];

    [
      ["invoice_no", invoice_no || null],
      ["vehicle_no", vehicle_no || null],
      ["driver_name", driver_name || null],
      ["driver_phone", driver_phone || null],
      ["lr_no", lr_no || null],
      ["eway_bill", eway_bill || null],
      ["dispatch_remarks", dispatch_remarks || null],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        insertColumns.push(column);
        values.push(value);
      }
    });

    const placeholders = insertColumns.map(() => "?").join(", ");
    db.query(`INSERT INTO dispatch (${insertColumns.join(", ")}) VALUES (${placeholders})`, values);

    db.query("UPDATE orders SET status='DISPATCHED' WHERE id=?", [order_id], (err) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", (req, res) => {
  db.query("SELECT order_id FROM dispatch WHERE id = ?", [req.params.id], (selectErr, rows) => {
    if (selectErr) return res.status(500).json(selectErr);
    if (rows.length === 0) return res.json({ success: true, deleted: 0 });

    const orderId = rows[0].order_id;
    db.query("DELETE FROM dispatch WHERE id = ?", [req.params.id], (deleteErr) => {
      if (deleteErr) return res.status(500).json(deleteErr);

      db.query(
        "UPDATE orders SET status='PENDING' WHERE id=? AND NOT EXISTS (SELECT 1 FROM delivery_proof WHERE order_id=?)",
        [orderId, orderId],
        (updateErr) => {
          if (updateErr) return res.status(500).json(updateErr);
          res.json({ success: true });
        }
      );
    });
  });
});

module.exports = router;
