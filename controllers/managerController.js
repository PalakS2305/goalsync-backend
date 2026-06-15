const pool = require("../db/index");
const {
  sendGoalsApprovedEmail,
  sendGoalsReturnedEmail,
} = require("../utils/emailService");

// ── Get all team members and their goal status ──
const getTeamOverview = async (req, res) => {
  const manager_id = req.user.id;

  try {
    const employeesResult = await pool.query(
      `SELECT id, name, email, department 
       FROM users 
       WHERE manager_id = $1 AND role = 'employee'
       ORDER BY name`,
      [manager_id],
    );

    const teamData = await Promise.all(
      employeesResult.rows.map(async (emp) => {
        const goalsResult = await pool.query(
          `SELECT 
             COUNT(*) as total_goals,
             SUM(weightage) as total_weightage,
             COUNT(CASE WHEN status = 'submitted' THEN 1 END) as pending,
             COUNT(CASE WHEN status = 'approved'  THEN 1 END) as approved,
             COUNT(CASE WHEN status = 'returned'  THEN 1 END) as returned,
             COUNT(CASE WHEN status = 'draft'     THEN 1 END) as draft
           FROM goals
           WHERE employee_id = $1`,
          [emp.id],
        );
        return { ...emp, goal_summary: goalsResult.rows[0] };
      }),
    );

    res.status(200).json({ team: teamData });
  } catch (err) {
    console.error("Team overview error:", err.message);
    res.status(500).json({ error: "Server error fetching team." });
  }
};

// ── Get all goals for a specific employee ──
const getEmployeeGoals = async (req, res) => {
  const manager_id = req.user.id;
  const employee_id = req.params.employeeId;

  try {
    const empCheck = await pool.query(
      `SELECT id, name, email, department 
       FROM users 
       WHERE id = $1 AND manager_id = $2`,
      [employee_id, manager_id],
    );

    if (empCheck.rows.length === 0) {
      return res.status(403).json({
        error: "This employee is not in your team.",
      });
    }

    const goalsResult = await pool.query(
      `SELECT * FROM goals 
       WHERE employee_id = $1
       ORDER BY created_at ASC`,
      [employee_id],
    );

    const totalWeightage = goalsResult.rows.reduce(
      (sum, g) => sum + parseFloat(g.weightage),
      0,
    );

    res.status(200).json({
      employee: empCheck.rows[0],
      goals: goalsResult.rows,
      total_weightage: totalWeightage,
    });
  } catch (err) {
    console.error("Employee goals error:", err.message);
    res.status(500).json({ error: "Server error fetching goals." });
  }
};

// ── Approve all submitted goals for an employee ──
const approveGoals = async (req, res) => {
  const manager_id = req.user.id;
  const employee_id = req.params.employeeId;

  try {
    const empCheck = await pool.query(
      `SELECT id, name, email FROM users 
       WHERE id = $1 AND manager_id = $2`,
      [employee_id, manager_id],
    );

    if (empCheck.rows.length === 0) {
      return res.status(403).json({
        error: "This employee is not in your team.",
      });
    }

    const submittedCheck = await pool.query(
      `SELECT COUNT(*) FROM goals 
       WHERE employee_id = $1 AND status = 'submitted'`,
      [employee_id],
    );

    if (parseInt(submittedCheck.rows[0].count) === 0) {
      return res.status(400).json({
        error: "No submitted goals to approve.",
      });
    }

    await pool.query(
      `UPDATE goals 
       SET status = 'approved',
           approved_at = NOW(),
           manager_comment = NULL
       WHERE employee_id = $1 AND status = 'submitted'`,
      [employee_id],
    );

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "APPROVE_GOALS",
        "goals",
        `Manager approved goals for ${empCheck.rows[0].name}`,
      ],
    );

    // Send email
    try {
      await sendGoalsApprovedEmail(
        empCheck.rows[0].email,
        empCheck.rows[0].name,
        req.user.name,
      );
    } catch (emailErr) {
      console.error("Email failed:", emailErr.message);
    }

    res.status(200).json({
      message: `Goals approved for ${empCheck.rows[0].name}.`,
    });
  } catch (err) {
    console.error("Approve goals error:", err.message);
    res.status(500).json({ error: "Server error approving goals." });
  }
};

// ── Return goals with comment ──
const returnGoals = async (req, res) => {
  const manager_id = req.user.id;
  const employee_id = req.params.employeeId;
  const { comment } = req.body;

  if (!comment || comment.trim() === "") {
    return res.status(400).json({
      error: "A comment is required when returning goals.",
    });
  }

  try {
    const empCheck = await pool.query(
      `SELECT id, name, email FROM users 
       WHERE id = $1 AND manager_id = $2`,
      [employee_id, manager_id],
    );

    if (empCheck.rows.length === 0) {
      return res.status(403).json({
        error: "This employee is not in your team.",
      });
    }

    await pool.query(
      `UPDATE goals 
       SET status = 'returned',
           manager_comment = $1
       WHERE employee_id = $2 AND status = 'submitted'`,
      [comment.trim(), employee_id],
    );

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "RETURN_GOALS",
        "goals",
        `Manager returned goals for ${empCheck.rows[0].name}. Comment: ${comment}`,
      ],
    );

    // Send email
    try {
      await sendGoalsReturnedEmail(
        empCheck.rows[0].email,
        empCheck.rows[0].name,
        req.user.name,
        comment,
      );
    } catch (emailErr) {
      console.error("Email failed:", emailErr.message);
    }

    res.status(200).json({
      message: `Goals returned to ${empCheck.rows[0].name} with comment.`,
    });
  } catch (err) {
    console.error("Return goals error:", err.message);
    res.status(500).json({ error: "Server error returning goals." });
  }
};

module.exports = {
  getTeamOverview,
  getEmployeeGoals,
  approveGoals,
  returnGoals,
};
