const express = require("express");
const router = express.Router();
const {
  createGoal,
  getMyGoals,
  deleteGoal,
  submitGoals,
  updateGoal,
} = require("../controllers/goalController");
const { authenticate, authorizeRoles } = require("../middleware/auth");

// All goal routes require login
router.use(authenticate);

// Employee only routes
router.post("/", authorizeRoles("employee"), createGoal);
router.get("/my", authorizeRoles("employee"), getMyGoals);
router.delete("/:id", authorizeRoles("employee"), deleteGoal);
router.put("/:id", authorizeRoles("employee"), updateGoal);
router.post("/submit", authorizeRoles("employee"), submitGoals);

module.exports = router;
