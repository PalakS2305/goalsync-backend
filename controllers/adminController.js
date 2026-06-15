const pool = require("../db/index");
const bcrypt = require("bcryptjs");

// ── Get all users ──
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department, 
              u.is_active, u.created_at,
              m.name as manager_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       ORDER BY u.role, u.name`,
    );
    res.status(200).json({ users: result.rows });
  } catch (err) {
    console.error("Get users error:", err.message);
    res.status(500).json({ error: "Server error fetching users." });
  }
};

// ── Create new user ──
const createUser = async (req, res) => {
  const { name, email, password, role, department, manager_id } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({
      error: "Name, email, password and role are required.",
    });
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
      `INSERT INTO users 
        (name, email, password, role, department, manager_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department`,
      [
        name,
        email,
        hashedPassword,
        role,
        department || null,
        manager_id || null,
      ],
    );

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, 
         record_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "CREATE_USER",
        "users",
        result.rows[0].id,
        `Admin created user: ${name} (${role})`,
      ],
    );

    res.status(201).json({
      message: "User created successfully.",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Create user error:", err.message);
    res.status(500).json({ error: "Server error creating user." });
  }
};

// ── Toggle user active/inactive ──
const toggleUserStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = NOT is_active 
       WHERE id = $1 RETURNING id, name, is_active`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = result.rows[0];
    const action = user.is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER";

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, 
         record_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        action,
        "users",
        userId,
        `Admin ${user.is_active ? "activated" : "deactivated"} 
        user: ${user.name}`,
      ],
    );

    res.status(200).json({
      message: `User ${user.is_active ? "activated" : "deactivated"}.`,
      user,
    });
  } catch (err) {
    console.error("Toggle user error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
};

// ── Get all audit logs ──
const getAuditLogs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM audit_logs 
       ORDER BY created_at DESC 
       LIMIT 200`,
    );
    res.status(200).json({ logs: result.rows });
  } catch (err) {
    console.error("Audit logs error:", err.message);
    res.status(500).json({ error: "Server error fetching logs." });
  }
};

// ── Unlock an approved goal ──
const unlockGoal = async (req, res) => {
  const { goalId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: "Reason is required." });
  }

  try {
    const check = await pool.query("SELECT * FROM goals WHERE id = $1", [
      goalId,
    ]);

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found." });
    }

    if (!["approved", "locked"].includes(check.rows[0].status)) {
      return res.status(400).json({
        error: "Only approved or locked goals can be unlocked.",
      });
    }

    await pool.query(
      `UPDATE goals SET status = 'draft', updated_at = NOW() 
       WHERE id = $1`,
      [goalId],
    );

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, 
         record_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "UNLOCK_GOAL",
        "goals",
        goalId,
        `Admin unlocked goal id ${goalId}. Reason: ${reason}`,
      ],
    );

    res.status(200).json({ message: "Goal unlocked successfully." });
  } catch (err) {
    console.error("Unlock goal error:", err.message);
    res.status(500).json({ error: "Server error unlocking goal." });
  }
};

// ── Push shared goal to multiple employees ──
const pushSharedGoal = async (req, res) => {
  const {
    title,
    description,
    thrust_area,
    uom_type,
    target_value,
    employee_ids,
    primary_owner_id,
  } = req.body;

  if (!title || !uom_type || !employee_ids || employee_ids.length === 0) {
    return res.status(400).json({
      error: "Title, UoM and at least one employee required.",
    });
  }

  try {
    // Create shared goal template
    const sgResult = await pool.query(
      `INSERT INTO shared_goals 
        (title, description, thrust_area, uom_type, 
         target_value, created_by, primary_owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        title,
        description,
        thrust_area,
        uom_type,
        target_value || null,
        req.user.id,
        primary_owner_id || null,
      ],
    );

    const shared_goal_id = sgResult.rows[0].id;

    // Push to each employee
    for (const emp_id of employee_ids) {
      // Get employee's manager
      const empData = await pool.query(
        "SELECT manager_id FROM users WHERE id = $1",
        [emp_id],
      );
      const manager_id = empData.rows[0]?.manager_id || null;

      // Create actual goal for employee
      const goalResult = await pool.query(
        `INSERT INTO goals 
          (employee_id, manager_id, thrust_area, title, 
           description, uom_type, target_value, weightage, 
           status, is_shared, shared_goal_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 
                 'draft', true, $9)
         RETURNING id`,
        [
          emp_id,
          manager_id,
          thrust_area || "Shared",
          title,
          description,
          uom_type,
          target_value || null,
          10,
          shared_goal_id,
        ],
      );

      // Record recipient
      await pool.query(
        `INSERT INTO shared_goal_recipients 
          (shared_goal_id, employee_id, goal_id, weightage)
         VALUES ($1, $2, $3, $4)`,
        [shared_goal_id, emp_id, goalResult.rows[0].id, 10],
      );
    }

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, 
         record_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "PUSH_SHARED_GOAL",
        "shared_goals",
        shared_goal_id,
        `Admin pushed shared goal "${title}" to 
        ${employee_ids.length} employees`,
      ],
    );

    res.status(201).json({
      message: `Shared goal pushed to ${employee_ids.length} employees.`,
    });
  } catch (err) {
    console.error("Push shared goal error:", err.message);
    res.status(500).json({ error: "Server error pushing shared goal." });
  }
};

// ── Get all goals (admin view) ──
const getAllGoals = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, 
              u.name as employee_name,
              m.name as manager_name
       FROM goals g
       LEFT JOIN users u ON g.employee_id = u.id
       LEFT JOIN users m ON g.manager_id  = m.id
       ORDER BY g.created_at DESC`,
    );
    res.status(200).json({ goals: result.rows });
  } catch (err) {
    console.error("Get all goals error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
};
// ── Export CSV ──
const exportCSV = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         u.name as employee_name,
         u.department,
         m.name as manager_name,
         g.thrust_area,
         g.title as goal_title,
         g.uom_type,
         g.target_value,
         g.weightage,
         g.status as goal_status,
         qa.quarter,
         qa.actual_value,
         qa.score,
         qa.goal_status as quarterly_status,
         qa.manager_comment
       FROM goals g
       JOIN users u ON g.employee_id = u.id
       LEFT JOIN users m ON g.manager_id = m.id
       LEFT JOIN quarterly_achievements qa ON qa.goal_id = g.id
       ORDER BY u.name, g.id, qa.quarter`
    );

    const rows   = result.rows;
    const header = [
      'Employee', 'Department', 'Manager',
      'Thrust Area', 'Goal Title', 'UoM Type',
      'Target', 'Weightage%', 'Goal Status',
      'Quarter', 'Actual', 'Score%', 'Q Status', 'Manager Comment'
    ];

    const csv = [
      header.join(','),
      ...rows.map(r => [
        `"${r.employee_name || ''}"`,
        `"${r.department    || ''}"`,
        `"${r.manager_name  || ''}"`,
        `"${r.thrust_area   || ''}"`,
        `"${r.goal_title    || ''}"`,
        `"${r.uom_type      || ''}"`,
        r.target_value       || '',
        r.weightage          || '',
        `"${r.goal_status   || ''}"`,
        `"${r.quarter       || ''}"`,
        r.actual_value       || '',
        r.score              || '',
        `"${r.quarterly_status  || ''}"`,
        `"${(r.manager_comment || '').replace(/"/g, "'")}"`,
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition', 
      'attachment; filename=goalsync-report.csv'
    );
    res.status(200).send(csv);

  } catch (err) {
    console.error('CSV export error:', err.message);
    res.status(500).json({ error: 'Server error generating CSV.' });
  }
};
// ── Analytics Data ──
const getAnalytics = async (req, res) => {
  try {
    // Total users by role
    const usersStats = await pool.query(
      `SELECT role, COUNT(*) as count 
       FROM users GROUP BY role`
    );

    // Goals by status
    const goalStats = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM goals GROUP BY status`
    );

    // Goals by thrust area
    const thrustStats = await pool.query(
      `SELECT thrust_area, COUNT(*) as count 
       FROM goals 
       GROUP BY thrust_area 
       ORDER BY count DESC`
    );

    // Average scores by quarter
    const scoreStats = await pool.query(
      `SELECT quarter, 
              ROUND(AVG(score)::numeric, 1) as avg_score,
              COUNT(*) as total_entries
       FROM quarterly_achievements
       WHERE score IS NOT NULL
       GROUP BY quarter
       ORDER BY quarter`
    );

    // Completion rate
    const completionStats = await pool.query(
      `SELECT 
         COUNT(*) as total_goals,
         COUNT(CASE WHEN status = 'approved' 
                    OR status = 'locked' THEN 1 END) as approved,
         COUNT(CASE WHEN status = 'submitted' THEN 1 END) as pending,
         COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft
       FROM goals`
    );

    res.status(200).json({
      users:      usersStats.rows,
      goals:      goalStats.rows,
      thrust:     thrustStats.rows,
      scores:     scoreStats.rows,
      completion: completionStats.rows[0]
    });

  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};
module.exports = {
  getAllUsers,
  createUser,
  toggleUserStatus,
  getAuditLogs,
  unlockGoal,
  pushSharedGoal,
  getAllGoals,
  exportCSV,
  getAnalytics,
};
