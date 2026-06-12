const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

// LOGIN API
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  console.log("🔥 LOGIN HIT:", username);

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  const sql = "SELECT * FROM users WHERE username = ?";

  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error("❌ DB ERROR:", err);
      return res.status(500).json({ success: false, message: "DB error" });
    }

    if (results.length === 0) {
      return res.json({ success: false, message: "User not found" });
    }

    const user = results[0];

    // 👉 TEMP plain password check (later bcrypt use करेंगे)
    if (user.password !== password) {
      return res.json({ success: false, message: "Wrong password" });
    }

    // TOKEN
    const token = jwt.sign(
      { id: user.id, username: user.username },
      "secret123",
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  });
});

router.post("/register", (req, res) => {
  const { username, password, role = "admin" } = req.body;

  if (!username || !password) {
    return sendJson(res, 400, { success: false, message: "Username and password are required." });
  }

  db.query("SELECT id FROM users WHERE username = ?", [username.trim()], (err, rows) => {
    if (err) {
      return sendJson(res, 500, { success: false, message: "DB error" });
    }

    if (rows.length > 0) {
      return sendJson(res, 400, { success: false, message: "This username already exists." });
    }

    db.query(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username.trim(), password, role || "admin"],
      (insertErr, result) => {
        if (insertErr) {
          return sendJson(res, 500, { success: false, message: "Unable to create user." });
        }

        return sendJson(res, 201, {
          success: true,
          message: "User created successfully.",
          user: { id: result.insertId, username: username.trim(), role: role || "admin" },
        });
      }
    );
  });
});

router.put("/change-password", (req, res) => {
  const { username, currentPassword, newUsername, newPassword } = req.body;

  if (!username || !currentPassword) {
    return sendJson(res, 400, { success: false, message: "Current username and password are required." });
  }

  db.query("SELECT * FROM users WHERE username = ?", [username.trim()], (err, rows) => {
    if (err) {
      return sendJson(res, 500, { success: false, message: "DB error" });
    }

    if (rows.length === 0) {
      return sendJson(res, 404, { success: false, message: "User not found." });
    }

    const user = rows[0];
    if (user.password !== currentPassword) {
      return sendJson(res, 400, { success: false, message: "Current password is incorrect." });
    }

    const updatedUsername = (newUsername || user.username).trim();
    const updatedPassword = newPassword && newPassword.trim() ? newPassword.trim() : user.password;

    if (updatedUsername !== user.username) {
      return db.query("SELECT id FROM users WHERE username = ? AND id <> ?", [updatedUsername, user.id], (existsErr, existsRows) => {
        if (existsErr) {
          return sendJson(res, 500, { success: false, message: "DB error" });
        }

        if (existsRows.length > 0) {
          return sendJson(res, 400, { success: false, message: "New username is already taken." });
        }

        updateUser(res, user.id, updatedUsername, updatedPassword);
      });
    }

    updateUser(res, user.id, updatedUsername, updatedPassword);
  });
});

function updateUser(res, userId, username, password) {
  db.query("UPDATE users SET username = ?, password = ? WHERE id = ?", [username, password, userId], (err) => {
    if (err) {
      return sendJson(res, 500, { success: false, message: "Unable to update credentials." });
    }

    return sendJson(res, 200, {
      success: true,
      message: "Credentials updated successfully.",
      user: { id: userId, username, password },
    });
  });
}

module.exports = router;