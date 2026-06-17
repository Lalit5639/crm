const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { ensureTableColumn, getTableColumns, resolveColumn } = require("../utils/schema");

async function ensureDispatchQtyColumn() {
  await ensureTableColumn("dispatch", "dispatch_qty", "INTEGER NOT NULL DEFAULT 0");
}

function recalculateOrderStatus(orderId, res, successPayload = { success: true }) {
  db.query(
    "SELECT qty, COALESCE(pending_qty, qty) AS pending_qty FROM orders WHERE id = ?",
    [orderId],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (rows.length === 0) return res.json(successPayload);

      const orderQty = Number(rows[0].qty || 0);
      const pendingQty = Math.max(Number(rows[0].pending_qty ?? 0), 0);
      const status = pendingQty === orderQty ? "PENDING" : (pendingQty > 0 ? "PARTIAL" : "DISPATCHED");

      db.query(
        "UPDATE orders SET pending_qty=?, status=? WHERE id=?",
        [pendingQty, status, orderId],
        (updateErr) => {
          if (updateErr) return res.status(500).json(updateErr);
          res.json(successPayload);
        }
      );
    }
  );
}

function adjustOrderPending(orderId, delta, callback) {
  db.query(
    "SELECT qty, COALESCE(pending_qty, qty) AS pending_qty FROM orders WHERE id = ?",
    [orderId],
    (err, rows) => {
      if (err) return callback(err);
      if (rows.length === 0) return callback(null);

      const orderQty = Number(rows[0].qty || 0);
      const pendingQty = Math.min(orderQty, Math.max(Number(rows[0].pending_qty ?? 0) + delta, 0));
      const status = pendingQty === orderQty ? "PENDING" : (pendingQty > 0 ? "PARTIAL" : "DISPATCHED");

      db.query(
        "UPDATE orders SET pending_qty=?, status=? WHERE id=?",
        [pendingQty, status, orderId],
        callback
      );
    }
  );
}

router.get("/", async (req, res) => {
  try {
    await ensureDispatchQtyColumn();
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
      ORDER BY d.dispatch_date DESC, d.id DESC
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
    await ensureDispatchQtyColumn();
    const dealerNameColumn = await resolveColumn("dealers", ["dealer_name", "name"]);
    const dealerMobileColumn = await resolveColumn("dealers", ["phone", "mobile"]);

    const sql = `
      SELECT *
      FROM (
      SELECT
        o.id,
        o.amount,
        o.qty,
        o.pending_qty,
        o.order_date,
        GREATEST(o.qty - COALESCE(o.pending_qty, o.qty), 0) AS total_dispatched,
        COALESCE(o.pending_qty, o.qty) AS remaining_qty,
        o.status,
        d.${dealerNameColumn} AS dealer_name,
        d.${dealerMobileColumn} AS mobile
      FROM orders o
      JOIN dealers d ON o.dealer_id = d.id
      WHERE o.status IN ('PENDING', 'PARTIAL')
      ) dispatch_orders
      WHERE remaining_qty > 0
      ORDER BY order_date ASC, id ASC
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
    dispatch_qty,
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

  if (!order_id || !transport_name || !dispatch_qty) {
    return res.json({ success: false, message: "Missing fields: order_id, transport_name, dispatch_qty required" });
  }

  try {
    await ensureDispatchQtyColumn();
    // Get order details
    db.query("SELECT qty, COALESCE(pending_qty, qty) AS pending_qty FROM orders WHERE id = ?", [order_id], async (err, orderRows) => {
      if (err) return res.status(500).json(err);
      if (orderRows.length === 0) {
        return res.json({ success: false, message: "Order not found" });
      }

      const orderQty = Number(orderRows[0].qty);
      const dispatchQtyNum = Number(dispatch_qty);
      const currentPendingQty = Number(orderRows[0].pending_qty ?? orderQty);

      // Check if dispatch qty exceeds order qty
      if (dispatchQtyNum > currentPendingQty) {
        return res.json({ success: false, message: `Dispatch quantity cannot exceed pending quantity (${currentPendingQty})` });
      }

      // Calculate total dispatched for this order
      db.query(
        "SELECT COALESCE(SUM(dispatch_qty), 0) AS total_dispatched FROM dispatch WHERE order_id = ?",
        [order_id],
        async (err, dispatchRows) => {
          if (err) return res.status(500).json(err);

          const totalDispatched = Math.max(orderQty - currentPendingQty, 0) + dispatchQtyNum;

          if (totalDispatched > orderQty) {
            return res.json({
              success: false,
              message: `Total dispatch (${totalDispatched}) exceeds order quantity (${orderQty}). Already dispatched: ${Number(dispatchRows[0].total_dispatched || 0)}`
            });
          }

          try {
            const columns = await getTableColumns("dispatch");
            const insertColumns = ["order_id", "dispatch_qty", "transport_name", "dispatch_date"];
            const values = [order_id, dispatchQtyNum, transport_name, dispatch_date || new Date()];

            [
              ["invoice_no", invoice_no || null],
              ["vehicle_no", vehicle_no || null],
              ["driver_name", driver_name || null],
              ["driver_phone", driver_phone || null],
              ["lr_no", lr_no || null],
              ["eway_bill", eway_bill || null],
              ["dispatch_remarks", dispatch_remarks || null],
            ].forEach(([column, value]) => {
              if (columns && columns.includes(column)) {
                insertColumns.push(column);
                values.push(value);
              }
            });

            const placeholders = insertColumns.map(() => "?").join(", ");
            db.query(`INSERT INTO dispatch (${insertColumns.join(", ")}) VALUES (${placeholders})`, values, (insertErr) => {
              if (insertErr) return res.status(500).json(insertErr);

              // Update order pending_qty
              const newPendingQty = Math.max(currentPendingQty - dispatchQtyNum, 0);
              const newStatus = totalDispatched >= orderQty ? 'DISPATCHED' : 'PARTIAL';

              db.query(
                "UPDATE orders SET pending_qty=?, status=? WHERE id=?",
                [newPendingQty, newStatus, order_id],
                (updateErr) => {
                  if (updateErr) return res.status(500).json(updateErr);
                  res.json({ success: true });
                }
              );
            });
          } catch (schemaErr) {
            res.status(500).json(schemaErr);
          }
        }
      );
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.put("/:id", async (req, res) => {
  const {
    order_id,
    dispatch_qty,
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

  try {
    await ensureDispatchQtyColumn();
    // Get current dispatch record
    db.query("SELECT order_id, dispatch_qty FROM dispatch WHERE id = ?", [req.params.id], async (selectErr, rows) => {
      if (selectErr) return res.status(500).json(selectErr);
      if (rows.length === 0) return res.json({ success: false, message: "Dispatch record not found" });

      const currentDispatchQty = Number(rows[0].dispatch_qty || 0);
      const currentOrderId = rows[0].order_id;
      const finalOrderId = order_id || currentOrderId;
      const finalDispatchQty = dispatch_qty !== undefined ? Number(dispatch_qty) : currentDispatchQty;
      const qtyDifference = finalDispatchQty - currentDispatchQty;

      // If order changed, validate both orders
      if (finalOrderId !== currentOrderId) {
        db.query("SELECT qty FROM orders WHERE id = ?", [finalOrderId], (orderErr, orderRows) => {
          if (orderErr) return res.status(500).json(orderErr);
          if (orderRows.length === 0) return res.json({ success: false, message: "New order not found" });
          proceedWithUpdate();
        });
      } else {
        proceedWithUpdate();
      }

      async function proceedWithUpdate() {
        // Get new order qty and validate
        db.query("SELECT qty, COALESCE(pending_qty, qty) AS pending_qty FROM orders WHERE id = ?", [finalOrderId], async (err, orderRows) => {
          if (err) return res.status(500).json(err);
          if (orderRows.length === 0) return res.json({ success: false, message: "Order not found" });

          const orderQty = Number(orderRows[0].qty);
          const currentPendingQty = Number(orderRows[0].pending_qty ?? orderQty);
          const adjustedPendingQty = finalOrderId === currentOrderId
            ? Math.max(currentPendingQty + currentDispatchQty, 0)
            : currentPendingQty;

          // Calculate total dispatched for new order (excluding current record)
          db.query(
            "SELECT COALESCE(SUM(dispatch_qty), 0) AS total_dispatched FROM dispatch WHERE order_id = ? AND id != ?",
            [finalOrderId, req.params.id],
            async (err, dispatchRows) => {
              if (err) return res.status(500).json(err);

              const totalDispatched = Math.max(orderQty - adjustedPendingQty, 0) + finalDispatchQty;

              if (totalDispatched > orderQty) {
                return res.json({
                  success: false,
                  message: `Total dispatch (${totalDispatched}) exceeds order quantity (${orderQty})`
                });
              }

              try {
                const columns = await getTableColumns("dispatch");
                const updates = [
                  ["order_id", finalOrderId || null],
                  ["dispatch_qty", finalDispatchQty],
                  ["invoice_no", invoice_no || null],
                  ["transport_name", transport_name || null],
                  ["dispatch_date", dispatch_date || null],
                  ["vehicle_no", vehicle_no || null],
                  ["driver_name", driver_name || null],
                  ["driver_phone", driver_phone || null],
                  ["lr_no", lr_no || null],
                  ["eway_bill", eway_bill || null],
                  ["dispatch_remarks", dispatch_remarks || null],
                ].filter(([column]) => columns.includes(column));

                const setClause = updates.map(([column]) => `${column} = ?`).join(", ");
                const values = updates.map(([, value]) => value);
                values.push(req.params.id);

                db.query(`UPDATE dispatch SET ${setClause} WHERE id = ?`, values, (updateErr) => {
                  if (updateErr) return res.status(500).json(updateErr);

                  // Update the new order
                  const newPendingQty = Math.max(adjustedPendingQty - finalDispatchQty, 0);
                  const newStatus = totalDispatched >= orderQty ? 'DISPATCHED' : 'PARTIAL';

                  db.query(
                    "UPDATE orders SET pending_qty=?, status=? WHERE id=?",
                    [newPendingQty, newStatus, finalOrderId],
                    (newOrderErr) => {
                      if (newOrderErr) return res.status(500).json(newOrderErr);

                      // If order changed, recalculate old order
                      if (finalOrderId !== currentOrderId) {
                        adjustOrderPending(currentOrderId, currentDispatchQty, (oldOrderErr) => {
                          if (oldOrderErr) return res.status(500).json(oldOrderErr);
                          res.json({ success: true });
                        });
                      } else {
                        res.json({ success: true });
                      }
                    }
                  );
                });
              } catch (schemaErr) {
                res.status(500).json(schemaErr);
              }
            }
          );
        });
      }
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await ensureDispatchQtyColumn();
  } catch (err) {
    return res.status(500).json(err);
  }

  db.query("SELECT order_id, dispatch_qty FROM dispatch WHERE id = ?", [req.params.id], (selectErr, rows) => {
    if (selectErr) return res.status(500).json(selectErr);
    if (rows.length === 0) return res.json({ success: true, deleted: 0 });

    const orderId = rows[0].order_id;
    const dispatchQty = Number(rows[0].dispatch_qty || 0);
    db.query("DELETE FROM dispatch WHERE id = ?", [req.params.id], (deleteErr) => {
      if (deleteErr) return res.status(500).json(deleteErr);

      // Recalculate pending qty for the order
      db.query(
        "SELECT qty, COALESCE(pending_qty, qty) AS pending_qty FROM orders WHERE id = ?",
        [orderId],
        (calcErr, calcRows) => {
          if (calcErr) return res.status(500).json(calcErr);
          if (calcRows.length === 0) return res.json({ success: true, deleted: 1 });

          const orderQty = Number(calcRows[0].qty);
          const pendingQty = Math.min(orderQty, Math.max(Number(calcRows[0].pending_qty ?? 0) + dispatchQty, 0));
          const status = pendingQty === orderQty ? 'PENDING' : (pendingQty > 0 ? 'PARTIAL' : 'DISPATCHED');

          db.query(
            "UPDATE orders SET pending_qty=?, status=? WHERE id=?",
            [pendingQty, status, orderId],
            (updateErr) => {
              if (updateErr) return res.status(500).json(updateErr);
              res.json({ success: true, deleted: 1 });
            }
          );
        }
      );
    });
  });
});

module.exports = router;
