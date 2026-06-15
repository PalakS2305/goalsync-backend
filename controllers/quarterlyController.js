const pool = require("../db/index");

// ── Score computation based on UoM type ──
function computeScore(uom_type, target, actual) {
  if (target === null || target === undefined) return null;
  if (actual === null || actual === undefined) return null;

  target = parseFloat(target);
  actual = parseFloat(actual);

  switch (uom_type) {
    case "min":
    case "percentage_min":
      // Higher actual = better
      return Math.min((actual / target) * 100, 100);

    case "max":
    case "percentage_max":
      // Lower actual = better
      if (actual === 0) return 100;
      return Math.min((target / actual) * 100, 100);

    case "zero":
      // Must be zero
      return actual === 0 ? 100 : 0;

    case "timeline":
      // actual = days taken, target = days allowed
      if (actual <= target) return 100;
      return Math.max(0, 100 - ((actual - target) / target) * 100);

    default:
      return null;
  }
}

// ── Employee logs quarterly achievement ──
const logAchievement = async (req, res) => {
  const employee_id = req.user.id;
  const { goal_id, quarter, actual_value, goal_status } = req.body;

  if (!goal_id || !quarter || actual_value === undefined) {
    return res.status(400).json({
      error: "Goal ID, quarter and actual value are required.",
    });
  }

  const validQuarters = ["Q1", "Q2", "Q3", "Q4"];
  if (!validQuarters.includes(quarter)) {
    return res.status(400).json({
      error: "Quarter must be Q1, Q2, Q3 or Q4.",
    });
  }

  try {
    // Get goal details for score computation
    const goalResult = await pool.query(
      `SELECT * FROM goals 
       WHERE id = $1 AND employee_id = $2`,
      [goal_id, employee_id],
    );

    if (goalResult.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found." });
    }

    const goal = goalResult.rows[0];
    const score = computeScore(goal.uom_type, goal.target_value, actual_value);

    // Upsert — insert or update if already exists
    const result = await pool.query(
      `INSERT INTO quarterly_achievements
        (goal_id, employee_id, quarter, actual_value, 
         score, goal_status, logged_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (goal_id, quarter)
       DO UPDATE SET
         actual_value = EXCLUDED.actual_value,
         score        = EXCLUDED.score,
         goal_status  = EXCLUDED.goal_status,
         updated_at   = NOW()
       RETURNING *`,
      [
        goal_id,
        employee_id,
        quarter,
        actual_value,
        score,
        goal_status || "on_track",
      ],
    );

    await pool.query(
      `INSERT INTO audit_logs
        (user_id, user_name, user_role, action, 
         table_name, record_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        req.user.name,
        req.user.role,
        "LOG_ACHIEVEMENT",
        "quarterly_achievements",
        result.rows[0].id,
        `${quarter} achievement logged for goal: 
        ${goal.title}. Score: ${score?.toFixed(1)}%`,
      ],
    );

    res.status(200).json({
      message: "Achievement logged successfully.",
      achievement: result.rows[0],
      score: score?.toFixed(2),
    });
  } catch (err) {
    console.error("Log achievement error:", err.message);
    res.status(500).json({ error: "Server error logging achievement." });
  }
};

// ── Get all quarterly data for employee ──
const getMyAchievements = async (req, res) => {
  const employee_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT qa.*, g.title as goal_title, 
              g.uom_type, g.target_value, g.weightage,
              g.thrust_area
       FROM quarterly_achievements qa
       JOIN goals g ON qa.goal_id = g.id
       WHERE qa.employee_id = $1
       ORDER BY g.id, qa.quarter`,
      [employee_id],
    );

    res.status(200).json({ achievements: result.rows });
  } catch (err) {
    console.error("Get achievements error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
};

// ── Manager adds check-in comment ──
const addManagerComment = async (req, res) => {
  const manager_id = req.user.id;
  const { achievement_id } = req.params;
  const { comment } = req.body;

  if (!comment) {
    return res.status(400).json({ error: "Comment is required." });
  }

  try {
    const result = await pool.query(
      `UPDATE quarterly_achievements
       SET manager_comment = $1,
           manager_id      = $2,
           checkin_date    = NOW()
       WHERE id = $3
       RETURNING *`,
      [comment, manager_id, achievement_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Achievement record not found.",
      });
    }

    res.status(200).json({
      message: "Check-in comment added.",
      achievement: result.rows[0],
    });
  } catch (err) {
    console.error("Manager comment error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
};

// ── Get team quarterly data (manager view) ──
const getTeamAchievements = async (req, res) => {
  const manager_id = req.user.id;
  const employee_id = req.params.employeeId;

  try {
    const result = await pool.query(
      `SELECT qa.*, 
              g.title as goal_title,
              g.uom_type, g.target_value, g.weightage,
              g.thrust_area, g.status as goal_status_current
       FROM quarterly_achievements qa
       JOIN goals g ON qa.goal_id = g.id
       WHERE qa.employee_id = $1 
         AND g.manager_id   = $2
       ORDER BY g.id, qa.quarter`,
      [employee_id, manager_id],
    );

    res.status(200).json({ achievements: result.rows });
  } catch (err) {
    console.error("Team achievements error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
};

module.exports = {
  logAchievement,
  getMyAchievements,
  addManagerComment,
  getTeamAchievements,
};
