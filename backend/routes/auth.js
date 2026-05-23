const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

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

module.exports = router;