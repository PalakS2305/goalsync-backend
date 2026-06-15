const express = require("express");
const router = express.Router();
const {
  logAchievement,
  getMyAchievements,
  addManagerComment,
  getTeamAchievements,
} = require("../controllers/quarterlyController");
const { authenticate, authorizeRoles } = require("../middleware/auth");

router.use(authenticate);

// Employee routes
router.post("/log", authorizeRoles("employee"), logAchievement);
router.get("/my", authorizeRoles("employee"), getMyAchievements);

// Manager routes
router.put(
  "/:achievement_id/comment",
  authorizeRoles("manager"),
  addManagerComment,
);
router.get("/team/:employeeId", authorizeRoles("manager"), getTeamAchievements);

module.exports = router;
