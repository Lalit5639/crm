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
        dp.*,
        o.qty AS order_qty,
        o.pending_qty AS order_pending_qty,
        p.name AS product_name,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile
      FROM delivery_proof dp
      JOIN orders o ON dp.order_id = o.id
      JOIN dealers d ON o.dealer_id = d.id
      LEFT JOIN products p ON o.product_id = p.id
      ORDER BY dp.id ASC
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
      SELECT o.id, o.qty, o.pending_qty, d.${dealerNameColumn} AS dealer_name
      FROM orders o
      JOIN dealers d ON o.dealer_id = d.id
      WHERE o.status = 'DISPATCHED'
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
    delivery_date,
    received_by,
    receiver_phone,
    condition_status,
    proof_link,
    employee_ref,
    delivered_qty,
    notes
  } = req.body;

  if (!order_id) {
    return res.status(400).json({ success: false, message: "Please select order." });
  }

  if (!proof_link) {
    return res.status(400).json({ success: false, message: "Please paste delivery proof link." });
  }

  db.query("SELECT qty FROM orders WHERE id = ?", [order_id], async (orderErr, orderRows) => {
    if (orderErr) return res.status(500).json(orderErr);
    if (orderRows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const deliveredQty = Number(delivered_qty || 0);
    const pendingQty = Math.max(Number(orderRows[0].qty || 0) - deliveredQty, 0);

    try {
    const columns = await getTableColumns("delivery_proof");
    const insertColumns = ["order_id", "image", "upload_date"];
    const values = [order_id, "", new Date()];

    [
      ["delivery_date", delivery_date || null],
      ["received_by", received_by || null],
      ["receiver_phone", receiver_phone || null],
      ["condition_status", condition_status || null],
      ["proof_link", proof_link || null],
      ["employee_ref", employee_ref || null],
      ["delivered_qty", deliveredQty],
      ["pending_qty", pendingQty],
      ["notes", notes || null],
    ].forEach(([column, value]) => {
      if (columns.includes(column)) {
        insertColumns.push(column);
        values.push(value);
      }
    });

    const placeholders = insertColumns.map(() => "?").join(", ");
    db.query(
      `INSERT INTO delivery_proof (${insertColumns.join(", ")}) VALUES (${placeholders})`,
      values,
      (err) => {
        if (err) return res.status(500).json(err);

        db.query(
          "UPDATE orders SET status='DELIVERED', delivered_qty=COALESCE(?, delivered_qty), pending_qty=COALESCE(?, pending_qty) WHERE id=?",
          [deliveredQty, pendingQty, order_id]
        );

        res.json({ success: true });
      }
    );
    } catch (err) {
      res.status(500).json(err);
    }
  });
});

router.put("/:id", async (req, res) => {
  const {
    order_id,
    delivery_date,
    received_by,
    receiver_phone,
    condition_status,
    proof_link,
    employee_ref,
    delivered_qty,
    notes,
  } = req.body;

  try {
    const columns = await getTableColumns("delivery_proof");
    const updates = [
      ["order_id", order_id || null],
      ["delivery_date", delivery_date || null],
      ["received_by", received_by || null],
      ["receiver_phone", receiver_phone || null],
      ["condition_status", condition_status || null],
      ["proof_link", proof_link || null],
      ["employee_ref", employee_ref || null],
      ["delivered_qty", delivered_qty || 0],
      ["notes", notes || null],
    ].filter(([column]) => columns.includes(column));

    const setClause = updates.map(([column]) => `${column} = ?`).join(", ");
    const values = updates.map(([, value]) => value);
    values.push(req.params.id);

    db.query(`UPDATE delivery_proof SET ${setClause} WHERE id = ?`, values, (err) => {
      if (err) return res.status(500).json(err);

      db.query("SELECT order_id FROM delivery_proof WHERE id = ?", [req.params.id], (selectErr, rows) => {
        if (selectErr) return res.status(500).json(selectErr);
        if (rows.length === 0) return res.json({ success: true });

        const currentOrderId = rows[0].order_id;
        const sql = `
          SELECT
            o.qty,
            COALESCE(SUM(dp.delivered_qty), 0) AS delivered_qty,
            COUNT(dp.id) AS delivery_count,
            COUNT(d.id) AS dispatch_count
          FROM orders o
          LEFT JOIN delivery_proof dp ON dp.order_id = o.id
          LEFT JOIN dispatch d ON d.order_id = o.id
          WHERE o.id = ?
          GROUP BY o.id, o.qty
        `;

        db.query(sql, [currentOrderId], (calcErr, calcRows) => {
          if (calcErr) return res.status(500).json(calcErr);
          if (calcRows.length === 0) return res.json({ success: true });

          const deliveredQty = Number(calcRows[0].delivered_qty || 0);
          const pendingQty = Math.max(Number(calcRows[0].qty || 0) - deliveredQty, 0);
          const status = Number(calcRows[0].delivery_count || 0) > 0 ? "DELIVERED" : Number(calcRows[0].dispatch_count || 0) > 0 ? "DISPATCHED" : "PENDING";

          db.query(
            "UPDATE orders SET status=?, delivered_qty=?, pending_qty=? WHERE id=?",
            [status, deliveredQty, pendingQty, currentOrderId],
            (updateErr) => {
              if (updateErr) return res.status(500).json(updateErr);
              res.json({ success: true });
            }
          );
        });
      });
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", (req, res) => {
  db.query("SELECT order_id FROM delivery_proof WHERE id = ?", [req.params.id], (selectErr, rows) => {
    if (selectErr) return res.status(500).json(selectErr);
    if (rows.length === 0) return res.json({ success: true, deleted: 0 });

    const orderId = rows[0].order_id;
    db.query("DELETE FROM delivery_proof WHERE id = ?", [req.params.id], (deleteErr) => {
      if (deleteErr) return res.status(500).json(deleteErr);

      const sql = `
        SELECT
          o.qty,
          COALESCE(SUM(dp.delivered_qty), 0) AS delivered_qty,
          COUNT(dp.id) AS delivery_count,
          COUNT(d.id) AS dispatch_count
        FROM orders o
        LEFT JOIN delivery_proof dp ON dp.order_id = o.id
        LEFT JOIN dispatch d ON d.order_id = o.id
        WHERE o.id = ?
        GROUP BY o.id, o.qty
      `;

      db.query(sql, [orderId], (calcErr, calcRows) => {
        if (calcErr) return res.status(500).json(calcErr);
        if (calcRows.length === 0) return res.json({ success: true });

        const deliveredQty = Number(calcRows[0].delivered_qty || 0);
        const pendingQty = Math.max(Number(calcRows[0].qty || 0) - deliveredQty, 0);
        const status = Number(calcRows[0].delivery_count || 0) > 0
          ? "DELIVERED"
          : Number(calcRows[0].dispatch_count || 0) > 0
            ? "DISPATCHED"
            : "PENDING";

        db.query(
          "UPDATE orders SET status=?, delivered_qty=?, pending_qty=? WHERE id=?",
          [status, deliveredQty, pendingQty, orderId],
          (updateErr) => {
            if (updateErr) return res.status(500).json(updateErr);
            res.json({ success: true });
          }
        );
      });
    });
  });
});

module.exports = router;
