const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Groq = require('groq-sdk');
const User = require('../models/User');
const Reminder = require('../models/Reminder');
const Expense = require('../models/Expense');
<<<<<<< HEAD

=======
const dexoService = require('../services/dexoService');
>>>>>>> 640174d (fix: formulaire candidature + emails + ngrok cleanup)
// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Initialize nodemailer transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.KASH_EMAIL_USER,
    pass: process.env.KASH_EMAIL_PASS
  }
});

// ============================================================================
// JOB 1: DAILY EMAIL AT 7 AM (0 7 * * *)
// ============================================================================

/**
 * Process daily briefing emails
 */
async function processDaily() {
  try {
    console.log('[Kash Cron] Starting daily email job...');
    const users = await User.find({ activeAgents: 'kash' });
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    for (const user of users) {
      if (!user.email) {
        console.warn(`[Kash Cron] User ${user._id} has no email, skipping`);
        continue;
      }

      try {
        // Fetch reminders
        const reminders = await Reminder.find({ user: user._id, status: 'pending' });

        // Separate overdue and upcoming
        const overdue = reminders.filter(r => new Date(r.dueDate) < today);
        const upcoming = reminders.filter(
          r =>
            new Date(r.dueDate) >= today &&
            new Date(r.dueDate) <= new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
        );

        // Build reminder lists for Groq
        const overdueList = overdue
          .map(
            r =>
              `- ${r.title}: ${r.amount} ${r.currency} (due ${new Date(r.dueDate).toLocaleDateString(
                'en-GB'
              )})`
          )
          .join('\n');

        const upcomingList = upcoming
          .map(
            r =>
              `- ${r.title}: ${r.amount} ${r.currency} (due ${new Date(r.dueDate).toLocaleDateString(
                'en-GB'
              )})`
          )
          .join('\n');

        // Build Groq prompt
        const hasReminders = overdue.length > 0 || upcoming.length > 0;
        const prompt = `You are Kash, a friendly AI financial assistant. Write a short, warm, professional email to the CEO.
Today is ${todayStr}.
Overdue payments:
${overdueList || 'None'}

Upcoming payments (next 3 days):
${upcomingList || 'None'}

Write the email in HTML format. Be friendly but urgent about overdue items. Sign as 'Kash, your AI Financial Agent'.
${!hasReminders ? 'IMPORTANT: There are NO overdue or upcoming reminders. Write a positive, reassuring message saying everything is on track and congratulating the CEO on staying on top of finances.' : ''}
Return ONLY the HTML email body, no explanation, no markdown, no backticks.`;

        // Call Groq to generate email
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000
        });

        const emailHtml = completion.choices[0].message.content;

        // Send email
        await transporter.sendMail({
          from: process.env.KASH_EMAIL_USER,
          to: user.email,
          subject: `[Kash] Your Daily Financial Briefing — ${todayStr}`,
          html: emailHtml
        });
<<<<<<< HEAD

=======
await dexoService.sendReport('daily', emailHtml, {
  userEmail: user.email
});
>>>>>>> 640174d (fix: formulaire candidature + emails + ngrok cleanup)
        console.log(`[Kash Cron] Daily email sent to: ${user.email}`);
      } catch (error) {
        console.error(`[Kash Cron] Error processing user ${user._id}: ${error.message}`);
        // Continue with next user
      }
    }

    console.log('[Kash Cron] Daily email job completed');
  } catch (error) {
    console.error('[Kash Cron] Daily email job error:', error.message);
  }
}

// ============================================================================
// JOB 2: WEEKLY EMAIL EVERY SATURDAY AT 11 AM (0 11 * * 6)
// ============================================================================

/**
 * Build weekly email HTML with proper styling
 */
function _buildWeeklyEmailHTML({
  startDateStr,
  endDateStr,
  totalSpent,
  budgetsAtRisk,
  overduePayments,
  expenses,
  budgets,
  reminders,
  aiSummary
}) {
  const today = new Date().toLocaleDateString('en-GB');

  // Helper to get row background color based on budget percentage
  const getBudgetRowColor = (percentage) => {
    if (percentage > 80) return '#ffe0e0'; // Red
    if (percentage >= 50) return '#fff3e0'; // Orange
    return '#e0f7e9'; // Green
  };

  // Helper to get status badge HTML
  const getStatusBadge = (status) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'overdue') {
      return `<span style="background:#f44336;color:white;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold;">OVERDUE</span>`;
    }
    if (statusLower === 'paid') {
      return `<span style="background:#4caf50;color:white;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold;">PAID</span>`;
    }
    return `<span style="background:#ff9800;color:white;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold;">PENDING</span>`;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border: 1px solid #ddd;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
      color: #333;
    }
    tr:nth-child(even) {
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- HEADER -->
    <div style="background:#1a1a2e;color:white;padding:20px;text-align:center;">
      <h1 style="margin:0;font-size:24px;">Kash Weekly Report</h1>
      <p style="margin:8px 0 0 0;font-size:13px;opacity:0.9;">Week of ${startDateStr} to ${endDateStr}</p>
    </div>

    <!-- SUMMARY CARDS -->
    <div style="display:flex;gap:15px;padding:20px;background:#f9f9f9;">
      <div style="flex:1;background:white;padding:15px;border-left:4px solid #2196f3;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <div style="font-size:12px;color:#666;font-weight:600;text-transform:uppercase;">Total Spent</div>
        <div style="font-size:24px;color:#2196f3;font-weight:700;margin-top:8px;">${totalSpent.toFixed(2)} TND</div>
      </div>
      <div style="flex:1;background:white;padding:15px;border-left:4px solid #ff9800;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <div style="font-size:12px;color:#666;font-weight:600;text-transform:uppercase;">Budgets at Risk</div>
        <div style="font-size:24px;color:#ff9800;font-weight:700;margin-top:8px;">${budgetsAtRisk}</div>
      </div>
      <div style="flex:1;background:white;padding:15px;border-left:4px solid #f44336;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <div style="font-size:12px;color:#666;font-weight:600;text-transform:uppercase;">Overdue Payments</div>
        <div style="font-size:24px;color:#f44336;font-weight:700;margin-top:8px;">${overduePayments}</div>
      </div>
    </div>

    <!-- AI SUMMARY -->
    <div style="padding:20px;border-left:4px solid #667eea;background:#f0f7ff;margin:20px;">
      <p style="margin:0;font-style:italic;color:#555;line-height:1.6;">${aiSummary}</p>
    </div>

    <!-- EXPENSES TABLE -->
    ${
      expenses && expenses.length > 0
        ? `
    <div style="padding:20px;padding-top:0;">
      <h3 style="margin:0 0 15px 0;color:#333;">Expenses This Week</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Vendor</th>
            <th>Category</th>
            <th style="text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${expenses.map((e, i) => `<tr style="background:${i % 2 === 0 ? 'white' : '#fafafa'}">
            <td>${e.date}</td>
            <td>${e.vendor}</td>
            <td>${e.category}</td>
            <td style="text-align:right;"><strong>${e.amount.toFixed(2)} TND</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- BUDGETS TABLE -->
    ${
      budgets && budgets.length > 0
        ? `
    <div style="padding:20px;padding-top:0;">
      <h3 style="margin:0 0 15px 0;color:#333;">Budget Status</h3>
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th style="text-align:right;">Budget</th>
            <th style="text-align:right;">Spent</th>
            <th style="text-align:right;">% Used</th>
          </tr>
        </thead>
        <tbody>
          ${budgets
            .map(b => `<tr style="background:${getBudgetRowColor(b.percentage)}">
            <td><strong>${b.project}</strong></td>
            <td style="text-align:right;">${b.budget.toFixed(2)} TND</td>
            <td style="text-align:right;">${b.spent.toFixed(2)} TND</td>
            <td style="text-align:right;"><strong>${b.percentage.toFixed(1)}%</strong></td>
          </tr>`)
            .join('')}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- REMINDERS TABLE -->
    ${
      reminders && reminders.length > 0
        ? `
    <div style="padding:20px;padding-top:0;">
      <h3 style="margin:0 0 15px 0;color:#333;">Key Reminders</h3>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th style="text-align:right;">Amount</th>
            <th>Due Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${reminders
            .map(r => `<tr>
            <td>${r.title}</td>
            <td style="text-align:right;"><strong>${r.amount.toFixed(2)} TND</strong></td>
            <td>${r.dueDate}</td>
            <td>${getStatusBadge(r.status)}</td>
          </tr>`)
            .join('')}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- FOOTER -->
    <div style="padding:20px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#999;">
      <p style="margin:0;">Generated by Kash AI Agent — ${today}</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Process weekly financial report emails
 */
async function processWeekly() {
  try {
    console.log('[Kash Cron] Starting weekly email job...');
    const users = await User.find({ activeAgents: 'kash' });

    // Calculate date range for the past 7 days
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDateStr = startDate.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const endDateStr = endDate.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    for (const user of users) {
      if (!user.email) {
        console.warn(`[Kash Cron] User ${user._id} has no email, skipping`);
        continue;
      }

      try {
        // Fetch expenses for the week
        const expenses = await Expense.find({
          managerId: user._id,
          date: { $gte: startDate, $lte: endDate }
        });

        // Calculate total expenses
        const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        // Prepare expenses array for JSON
        const expensesArray = expenses.map(e => ({
          date: new Date(e.date).toLocaleDateString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }),
          vendor: e.vendor,
          category: e.category,
          amount: e.amount
        }));

        // Prepare budgets array for JSON
        const budgetsArray = (user.budget || []).map(b => ({
          project: b.project,
          budget: b.amount,
          spent: b.spent || 0,
          percentage: b.amount > 0 ? (((b.spent || 0) / b.amount) * 100) : 0
        }));

        // Count budgets at risk (>80%)
        const budgetsAtRisk = budgetsArray.filter(b => b.percentage > 80).length;

        // Fetch reminders for the week
        const weekReminders = await Reminder.find({
          user: user._id,
          createdAt: { $gte: startDate, $lte: endDate }
        })
          .sort({ status: -1, amount: -1 })
          .limit(5);

        // Count overdue payments
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overduePayments = weekReminders.filter(r => new Date(r.dueDate) < today).length;

        // Prepare reminders array for JSON
        const remindersArray = weekReminders.map(r => ({
          title: r.title,
          amount: r.amount,
          dueDate: new Date(r.dueDate).toLocaleDateString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }),
          status: r.status
        }));

        // Build Groq prompt to get JSON data
        const prompt = `You are Kash, a formal AI financial reporting agent. Analyze this weekly financial data and return JSON only.

Week of: ${startDateStr} to ${endDateStr}
Total expenses this week: ${totalExpenses} TND
Expenses: ${expensesArray.map(e => `${e.date} - ${e.vendor} (${e.category}): ${e.amount} TND`).join(', ') || 'None'}
Budget status: ${budgetsArray.map(b => `${b.project}: ${b.spent}/${b.budget} TND (${b.percentage.toFixed(1)}%)`).join(', ') || 'None'}
Key reminders: ${remindersArray.map(r => `${r.title} (${r.amount} TND, due ${r.dueDate}, status: ${r.status})`).join(', ') || 'None'}

Return ONLY a valid JSON object with this exact structure, no explanation, no markdown, no backticks:
{
  "totalSpent": number,
  "budgetsAtRisk": number,
  "overduePayments": number,
  "aiSummary": "2-3 sentence executive summary of the week's financial activity"
}`;

        // Call Groq to get JSON data
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500
        });

        // Parse Groq's JSON response
        let groqData = {};
        try {
          const jsonStr = completion.choices[0].message.content;
          groqData = JSON.parse(jsonStr);
        } catch (parseErr) {
          console.warn(`[Kash Cron] Failed to parse Groq JSON for user ${user._id}, using fallback data`);
          groqData = {
            totalSpent: totalExpenses,
            budgetsAtRisk: budgetsAtRisk,
            overduePayments: overduePayments,
            aiSummary: 'Weekly financial summary generated by Kash.'
          };
        }

        // Build HTML email using our template
        const emailHtml = _buildWeeklyEmailHTML({
          startDateStr,
          endDateStr,
          totalSpent: groqData.totalSpent || totalExpenses,
          budgetsAtRisk: groqData.budgetsAtRisk || budgetsAtRisk,
          overduePayments: groqData.overduePayments || overduePayments,
          expenses: expensesArray,
          budgets: budgetsArray,
          reminders: remindersArray,
          aiSummary: groqData.aiSummary || 'Weekly financial report.'
        });

        // Send email
        await transporter.sendMail({
          from: process.env.KASH_EMAIL_USER,
          to: user.email,
          subject: `[Kash Weekly Report] Financial Summary — Week of ${startDateStr}`,
          html: emailHtml
        });
<<<<<<< HEAD

=======
await dexoService.sendReport('weekly', emailHtml, {
  userEmail: user.email,
  startDate: startDateStr,
  endDate: endDateStr,
  totalSpent: groqData.totalSpent || totalExpenses,
  budgetsAtRisk: groqData.budgetsAtRisk || budgetsAtRisk,
  overduePayments: groqData.overduePayments || overduePayments,
  aiSummary: groqData.aiSummary
});
>>>>>>> 640174d (fix: formulaire candidature + emails + ngrok cleanup)
        console.log(`[Kash Cron] Weekly email sent to: ${user.email}`);
      } catch (error) {
        console.error(`[Kash Cron] Error processing user ${user._id}: ${error.message}`);
        // Continue with next user
      }
    }

    console.log('[Kash Cron] Weekly email job completed');
  } catch (error) {
    console.error('[Kash Cron] Weekly email job error:', error.message);
  }
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * Manual trigger for daily email job (for testing)
 */
async function triggerDailyEmailNow() {
  console.log('[Kash Cron] Manual trigger: Daily email');
  await processDaily();
}

/**
 * Manual trigger for weekly email job (for testing)
 */
async function triggerWeeklyEmailNow() {
  console.log('[Kash Cron] Manual trigger: Weekly email');
  await processWeekly();
}

// ============================================================================
// CRON JOB INITIALIZATION
// ============================================================================

/**
 * Start all Kash cron jobs
 */
function startKashCron() {
  console.log('[Kash Cron] Initializing Kash cron jobs...');

  // Daily job at 7 AM every day
  const dailyJob = cron.schedule('0 7 * * *', () => {
    processDaily();
  });

  // Weekly job at 11 AM every Saturday
  const weeklyJob = cron.schedule('0 11 * * 6', () => {
    processWeekly();
  });

  console.log('[Kash Cron] ✅ Daily job scheduled at 07:00 every day');
  console.log('[Kash Cron] ✅ Weekly job scheduled at 11:00 every Saturday');

  return { dailyJob, weeklyJob };
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = { startKashCron, triggerDailyEmailNow, triggerWeeklyEmailNow };
