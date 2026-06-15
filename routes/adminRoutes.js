const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  createUser,
  toggleUserStatus,
  getAuditLogs,
  unlockGoal,
  pushSharedGoal,
  getAllGoals,
  exportCSV,
  getAnalytics,
} = require("../controllers/adminController");
const { authenticate, authorizeRoles } = require("../middleware/auth");

router.use(authenticate);
router.use(authorizeRoles("admin"));

router.get("/users", getAllUsers);
router.post("/users", createUser);
router.put("/users/:userId/toggle", toggleUserStatus);
router.get("/audit-logs", getAuditLogs);
router.put("/goals/:goalId/unlock", unlockGoal);
router.post("/shared-goals", pushSharedGoal);
router.get("/goals", getAllGoals);
router.get("/export-csv", exportCSV);
router.get("/analytics", getAnalytics);

module.exports = router;
