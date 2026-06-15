const express = require("express");
const router = express.Router();
const {
  getTeamOverview,
  getEmployeeGoals,
  approveGoals,
  returnGoals,
} = require("../controllers/managerController");
const { authenticate, authorizeRoles } = require("../middleware/auth");

// All manager routes require login + manager role
router.use(authenticate);
router.use(authorizeRoles("manager"));

router.get("/team", getTeamOverview);
router.get("/team/:employeeId/goals", getEmployeeGoals);
router.put("/team/:employeeId/approve", approveGoals);
router.put("/team/:employeeId/return", returnGoals);

module.exports = router;
