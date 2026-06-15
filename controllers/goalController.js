const pool = require("../db/index");
const { sendGoalsSubmittedEmail } = require("../utils/emailService");

// ── Create a new goal ──
const createGoal = async (req, res) => {
  const employee_id = req.user.id;
  const { thrust_area, title, description, uom_type, target_value, weightage } =
    req.body;

  if (!thrust_area || !title || !uom_type || !weightage) {
    return res.status(400).json({
      error: "Thrust area, title, UoM type and weightage are required.",
    });
  }

  if (weightage < 10 || weightage > 100) {
    return res.status(400).json({
      error: "Weightage must be between 10% and 100%.",
    });
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM goals 
       WHERE employee_id = $1 AND status != 'returned'`,
      [employee_id],
    );

    const goalCount = parseInt(countResult.rows[0].count);
    if (goalCount >= 8) {
      return res.status(400).json({
        error: "Maximum 8 goals allowed per employee.",
      });
    }

    const weightResult = await pool.query(
      `SELECT COALESCE(SUM(weightage), 0) as total 
       FROM goals 
       WHERE employee_id = $1 AND status != 'returned'`,
      [employee_id],
    );

    const currentTotal = parseFloat(weightResult.rows[0].total);
    if (currentTotal + parseFloat(weightage) > 100) {
      return res.status(400).json({
        error: `Adding this goal would exceed 100%. Current total: ${currentTotal}%. Remaining: ${100 - currentTotal}%`,
      });
    }

    const managerResult = await pool.query(
      "SELECT manager_id FROM users WHERE id = $1",
      [employee_id],
    );
    const manager_id = managerResult.rows[0]?.manager_id || null;

    const result = await pool.query(
      `INSERT INTO goals 
        (employee_id, manager_id, thrust_area, title, description, 
         uom_type, target_value, weightage, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING *`,
      [
        employee_id,
        manager_id,
        thrust_area,
        title,
        description || null,
        uom_type,
        target_value || null,
        weightage,
      ],
    );

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, record_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "CREATE_GOAL",
        "goals",
        result.rows[0].id,
        `Goal created: ${title}`,
      ],
    );

    res.status(201).json({
      message: "Goal created successfully.",
      goal: result.rows[0],
    });
  } catch (err) {
    console.error("Create goal error:", err.message);
    res.status(500).json({ error: "Server error while creating goal." });
  }
};

// ── Get all goals for logged in employee ──
const getMyGoals = async (req, res) => {
  const employee_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT g.*, 
              u.name as manager_name
       FROM goals g
       LEFT JOIN users u ON g.manager_id = u.id
       WHERE g.employee_id = $1
       ORDER BY g.created_at ASC`,
      [employee_id],
    );

    const totalWeightage = result.rows.reduce(
      (sum, goal) => sum + parseFloat(goal.weightage),
      0,
    );

    res.status(200).json({
      goals: result.rows,
      total_weightage: totalWeightage,
      goal_count: result.rows.length,
    });
  } catch (err) {
    console.error("Get goals error:", err.message);
    res.status(500).json({ error: "Server error while fetching goals." });
  }
};

// ── Delete a draft goal ──
const deleteGoal = async (req, res) => {
  const employee_id = req.user.id;
  const goal_id = req.params.id;

  try {
    const check = await pool.query(
      "SELECT * FROM goals WHERE id = $1 AND employee_id = $2",
      [goal_id, employee_id],
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found." });
    }

    const goal = check.rows[0];

    if (!["draft", "returned"].includes(goal.status)) {
      return res.status(400).json({
        error: "Cannot delete a submitted or approved goal.",
      });
    }

    await pool.query("DELETE FROM goals WHERE id = $1", [goal_id]);

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, user_name, user_role, action, table_name, record_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "DELETE_GOAL",
        "goals",
        goal_id,
        `Goal deleted: ${goal.title}`,
      ],
    );

    res.status(200).json({ message: "Goal deleted successfully." });
  } catch (err) {
    console.error("Delete goal error:", err.message);
    res.status(500).json({ error: "Server error while deleting goal." });
  }
};

// ── Submit all goals for manager approval ──
const submitGoals = async (req, res) => {
  const employee_id = req.user.id;

  try {
    const goalsResult = await pool.query(
      `SELECT * FROM goals 
       WHERE employee_id = $1 AND status = 'draft'`,
      [employee_id],
    );

    if (goalsResult.rows.length === 0) {
      return res.status(400).json({
        error: "No draft goals to submit.",
      });
    }

    const totalWeightage = goalsResult.rows.reduce(
      (sum, g) => sum + parseFloat(g.weightage),
      0,
    );

    if (totalWeightage !== 100) {
      return res.status(400).json({
        error: `Total weightage must be exactly 100%. Current total: ${totalWeightage}%`,
      });
    }

    await pool.query(
      `UPDATE goals 
       SET status = 'submitted', submitted_at = NOW()
       WHERE employee_id = $1 AND status = 'draft'`,
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
        "SUBMIT_GOALS",
        "goals",
        `Employee submitted ${goalsResult.rows.length} goals for approval`,
      ],
    );

    // Send email to manager
    try {
      const managerResult = await pool.query(
        `SELECT u.email, u.name 
         FROM users u
         JOIN users e ON e.manager_id = u.id
         WHERE e.id = $1`,
        [employee_id],
      );

      if (managerResult.rows.length > 0) {
        const mgr = managerResult.rows[0];
        await sendGoalsSubmittedEmail(
          mgr.email,
          mgr.name,
          req.user.name,
          goalsResult.rows.length,
        );
      }
    } catch (emailErr) {
      console.error("Email notification failed:", emailErr.message);
    }

    res.status(200).json({
      message: `${goalsResult.rows.length} goals submitted for manager approval.`,
    });
  } catch (err) {
    console.error("Submit goals error:", err.message);
    res.status(500).json({ error: "Server error while submitting goals." });
  }
};

// ── Update a draft goal ──
const updateGoal = async (req, res) => {
  const employee_id = req.user.id;
  const goal_id = req.params.id;
  const { thrust_area, title, description, uom_type, target_value, weightage } =
    req.body;

  try {
    const check = await pool.query(
      "SELECT * FROM goals WHERE id = $1 AND employee_id = $2",
      [goal_id, employee_id],
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found." });
    }

    const goal = check.rows[0];

    if (!["draft", "returned"].includes(goal.status)) {
      return res.status(400).json({
        error: "Cannot edit a submitted or approved goal.",
      });
    }

    const result = await pool.query(
      `UPDATE goals SET
        thrust_area  = COALESCE($1, thrust_area),
        title        = COALESCE($2, title),
        description  = COALESCE($3, description),
        uom_type     = COALESCE($4, uom_type),
        target_value = COALESCE($5, target_value),
        weightage    = COALESCE($6, weightage),
        updated_at   = NOW()
       WHERE id = $7 AND employee_id = $8
       RETURNING *`,
      [
        thrust_area,
        title,
        description,
        uom_type,
        target_value,
        weightage,
        goal_id,
        employee_id,
      ],
    );

    res.status(200).json({
      message: "Goal updated successfully.",
      goal: result.rows[0],
    });
  } catch (err) {
    console.error("Update goal error:", err.message);
    res.status(500).json({ error: "Server error while updating goal." });
  }
};

module.exports = {
  createGoal,
  getMyGoals,
  deleteGoal,
  submitGoals,
  updateGoal,
};
