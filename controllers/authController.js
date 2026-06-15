const pool = require("../db/index");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const register = async (req, res) => {
  const { name, email, password, role, department, manager_id } = req.body;

  if (!name || !email || !password || !role) {
    return res
      .status(400)
      .json({ error: "Name, email, password and role are required." });
  }

  const validRoles = ["employee", "manager", "admin"];
  if (!validRoles.includes(role)) {
    return res
      .status(400)
      .json({ error: "Role must be employee, manager, or admin." });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, department, manager_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role`,
      [
        name,
        email,
        hashedPassword,
        role,
        department || null,
        manager_id || null,
      ],
    );

    res.status(201).json({
      message: "User registered successfully.",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Server error during registration." });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Server error during login." });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, department FROM users WHERE id = $1",
      [req.user.id],
    );
    res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error("GetMe error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
};

module.exports = { register, login, getMe };
