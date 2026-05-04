# Test Scripts

## Phase 2 Integration Test Script

### Overview

Interactive test script for Hera → Kash → Echo integration (Phase 2).

### Usage

```bash
node scripts/test-phase2-integration.js [command]
```

### Commands

| Command | Description |
|---------|-------------|
| `create-request` | Create a test recruitment request with realistic data |
| `trigger` | Manually trigger the HeraActionProcessor |
| `check-status` | Display status of recent recruitment requests |
| `check-linkedin` | Check LinkedIn authentication status |
| `reset-request` | Reset most recent request to `pending_analysis` |
| `help` | Show help message |

### Examples

#### 1. Complete Test Flow

```bash
# Step 1: Check LinkedIn is authenticated
node scripts/test-phase2-integration.js check-linkedin

# Step 2: Create a test request
node scripts/test-phase2-integration.js create-request

# Step 3: Trigger the processor
node scripts/test-phase2-integration.js trigger

# Step 4: Check the results
node scripts/test-phase2-integration.js check-status
```

#### 2. Quick Status Check

```bash
node scripts/test-phase2-integration.js check-status
```

#### 3. Reset and Retry

```bash
# Reset a request to pending
node scripts/test-phase2-integration.js reset-request

# Trigger again
node scripts/test-phase2-integration.js trigger
```

### Output

The script uses colored output for easy reading:

- 🟢 **Green** - Success messages
- 🔴 **Red** - Errors
- 🟡 **Yellow** - Warnings
- 🔵 **Cyan** - Information
- **Bold** - Section headers

### Prerequisites

1. **MongoDB** must be running
2. **Environment variables** configured in `.env`
3. **LinkedIn** authenticated (for posting tests)

### What It Does

#### `create-request`
- Finds a CEO user in database
- Checks/creates Salaries budget
- Creates a realistic recruitment request
- Sets status to `pending_analysis`

#### `trigger`
- Calls `HeraActionProcessor.processRecruitmentRequests()`
- Shows detailed processing logs
- Displays results for each request

#### `check-status`
- Queries recent recruitment requests
- Shows status, budget validation, LinkedIn posting
- Color-coded for easy scanning

#### `check-linkedin`
- Checks LinkedIn authentication
- Shows token status, Person URN
- Provides setup instructions if not authenticated

#### `reset-request`
- Finds most recent request
- Resets status to `pending_analysis`
- Clears all processing metadata

### Troubleshooting

#### "No users found in database"
```bash
# Create a test user first
mongosh your_database
db.users.insertOne({
  email: "ceo@e-team.com",
  name: "Test CEO",
  role: "admin",
  createdAt: new Date()
})
```

#### "LinkedIn not authenticated"
```bash
# Start server and authenticate
npm start
# Visit: http://localhost:3000/api/echo/linkedin/auth-url
```

#### "MongoDB connection failed"
```bash
# Check MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Check .env has correct URI
cat .env | grep MONGODB_URI
```

### Integration with Phase 2

This script is designed to test the Phase 2 integration:

```
Hera creates request
    ↓
Kash validates budget
    ↓
Echo posts to LinkedIn
```

It helps verify:
- ✅ Status flow is correct
- ✅ Metadata is saved properly
- ✅ LinkedIn posting works
- ✅ Error handling is graceful

### See Also

- **Complete Testing Guide:** `docs/HERA_ECHO_INTEGRATION_PHASE2_TESTING.md`
- **Quick Reference:** `docs/PHASE2_IMPLEMENTATION_SUMMARY.md`
- **Delivery Document:** `PHASE2_DELIVERY.md`

---

**Created:** 2026-05-04  
**Version:** 1.0  
**Status:** ✅ Ready to Use
