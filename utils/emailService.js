const nodemailer = require("nodemailer");
require("dotenv").config();

// Create transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Email Templates ──

// Goals submitted notification to manager
const sendGoalsSubmittedEmail = async (
  managerEmail,
  managerName,
  employeeName,
  goalCount,
) => {
  try {
    await transporter.sendMail({
      from: `"GoalSync" <${process.env.EMAIL_USER}>`,
      to: managerEmail,
      subject: `📋 Goals Submitted for Review — ${employeeName}`,
      html: `
        <div style="font-family: Segoe UI, sans-serif; 
                    max-width: 560px; margin: 0 auto;">
          <div style="background: #0f3460; padding: 24px; 
                      border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0;">
              🎯 GoalSync Notification
            </h2>
          </div>
          <div style="background: white; padding: 24px; 
                      border: 1px solid #e5e7eb;
                      border-radius: 0 0 12px 12px;">
            <p>Hi <strong>${managerName}</strong>,</p>
            <p style="margin: 16px 0;">
              <strong>${employeeName}</strong> has submitted 
              <strong>${goalCount} goal(s)</strong> for your review.
            </p>
            <div style="background: #fef3c7; border-radius: 8px; 
                        padding: 16px; margin: 16px 0;">
              <p style="color: #92400e; margin: 0;">
                ⏰ Please review and approve or return within 
                <strong>3 working days</strong>.
              </p>
            </div>
            <p>Login to GoalSync to take action.</p>
            <p style="color: #9ca3af; font-size: 0.8rem; 
                      margin-top: 24px;">
              GoalSync — AtomQuest 1.0
            </p>
          </div>
        </div>`,
    });
    console.log("Goals submitted email sent to:", managerEmail);
  } catch (err) {
    console.error("Email error:", err.message);
  }
};

// Goals approved notification to employee
const sendGoalsApprovedEmail = async (
  employeeEmail,
  employeeName,
  managerName,
) => {
  try {
    await transporter.sendMail({
      from: `"GoalSync" <${process.env.EMAIL_USER}>`,
      to: employeeEmail,
      subject: `✅ Your Goals Have Been Approved!`,
      html: `
        <div style="font-family: Segoe UI, sans-serif; 
                    max-width: 560px; margin: 0 auto;">
          <div style="background: #059669; padding: 24px; 
                      border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0;">
              🎯 GoalSync Notification
            </h2>
          </div>
          <div style="background: white; padding: 24px;
                      border: 1px solid #e5e7eb;
                      border-radius: 0 0 12px 12px;">
            <p>Hi <strong>${employeeName}</strong>,</p>
            <div style="background: #d1fae5; border-radius: 8px; 
                        padding: 16px; margin: 16px 0;">
              <p style="color: #065f46; margin: 0; font-size: 1.1rem;">
                ✅ Great news! Your goals have been 
                <strong>approved</strong> by 
                <strong>${managerName}</strong>.
              </p>
            </div>
            <p>Your goals are now locked. You can start logging 
               your quarterly achievements.</p>
            <p style="color: #9ca3af; font-size: 0.8rem; 
                      margin-top: 24px;">
              GoalSync — AtomQuest 1.0
            </p>
          </div>
        </div>`,
    });
    console.log("Approval email sent to:", employeeEmail);
  } catch (err) {
    console.error("Email error:", err.message);
  }
};

// Goals returned notification to employee
const sendGoalsReturnedEmail = async (
  employeeEmail,
  employeeName,
  managerName,
  comment,
) => {
  try {
    await transporter.sendMail({
      from: `"GoalSync" <${process.env.EMAIL_USER}>`,
      to: employeeEmail,
      subject: `↩️ Your Goals Need Revision`,
      html: `
        <div style="font-family: Segoe UI, sans-serif; 
                    max-width: 560px; margin: 0 auto;">
          <div style="background: #dc2626; padding: 24px; 
                      border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0;">
              🎯 GoalSync Notification
            </h2>
          </div>
          <div style="background: white; padding: 24px;
                      border: 1px solid #e5e7eb;
                      border-radius: 0 0 12px 12px;">
            <p>Hi <strong>${employeeName}</strong>,</p>
            <p style="margin: 16px 0;">
              <strong>${managerName}</strong> has returned your 
              goals for revision.
            </p>
            <div style="background: #fee2e2; border-radius: 8px;
                        padding: 16px; margin: 16px 0;">
              <p style="color: #991b1b; margin: 0;">
                <strong>Manager's Comment:</strong><br/>
                ${comment}
              </p>
            </div>
            <p>Please login to GoalSync, make the necessary 
               changes and resubmit.</p>
            <p style="color: #9ca3af; font-size: 0.8rem; 
                      margin-top: 24px;">
              GoalSync — AtomQuest 1.0
            </p>
          </div>
        </div>`,
    });
    console.log("Return email sent to:", employeeEmail);
  } catch (err) {
    console.error("Email error:", err.message);
  }
};

module.exports = {
  sendGoalsSubmittedEmail,
  sendGoalsApprovedEmail,
  sendGoalsReturnedEmail,
};
