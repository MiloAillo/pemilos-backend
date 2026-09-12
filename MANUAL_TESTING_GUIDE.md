# Manual Testing Guide - Security Fixes

**Project:** Pemilos Backend  
**Date:** September 12, 2026  
**Purpose:** Verify 11 critical security fixes

---

## Pre-Testing Setup

### Environment Check
```bash
# Start services
docker-compose up -d

# Check services running
docker-compose ps

# Expected: app, mongo_db, redis all running
```

### Admin Credentials
```
Username: admin
Password: [your admin password]
```

### Test User Credentials
```
Username: testvoter001
Password: [generated password from CSV upload]
```

---

## Test Suite 1: Authentication (JWT Fix)

### Test 1.1: Valid Login
**Endpoint:** `POST /api/v1/auth/login`
```json
{
  "username": "testvoter001",
  "password": "Test1234:testvoter001"
}
```
**Expected:** ✅ 200 OK, returns token

### Test 1.2: Access Protected Endpoint
**Endpoint:** `GET /api/v1/auth/profile`  
**Header:** `Authorization: Bearer {valid_token}`  
**Expected:** ✅ 200 OK, returns user profile

### Test 1.3: Forged Token (Security Test)
**Action:** Modify token payload, keep signature unchanged  
**Expected:** ❌ 401 Unauthorized "Invalid token"

### Test 1.4: Expired Token
**Action:** Use old/expired token  
**Expected:** ❌ 401 Unauthorized "Token expired"

### Test 1.5: No Token
**Endpoint:** `GET /api/v1/auth/profile`  
**Header:** None  
**Expected:** ❌ 401 Unauthorized

---

## Test Suite 2: Authorization

### Test 2.1: Admin Access Admin Endpoint
**User:** Admin  
**Endpoint:** `GET /api/v1/admin/user`  
**Expected:** ✅ 200 OK, returns user list

### Test 2.2: Voter Access Admin Endpoint
**User:** Voter  
**Endpoint:** `GET /api/v1/admin/user`  
**Expected:** ❌ 403 Forbidden

### Test 2.3: Unauthenticated Access
**Endpoint:** `GET /api/v1/admin/user`  
**Header:** No Authorization  
**Expected:** ❌ 401 Unauthorized

---

## Test Suite 3: Input Validation

### Test 3.1: Create User - Invalid Class
**Endpoint:** `POST /api/v1/admin/user`
```json
{
  "username": "testuser",
  "name": "Test User",
  "class": "INVALID_CLASS",
  "role": "voter"
}
```
**Expected:** ❌ 400 Bad Request, validation error

### Test 3.2: Create User - Weak Password
**Endpoint:** `POST /api/v1/auth/login`
```json
{
  "username": "test",
  "password": "weak"
}
```
**Expected:** ❌ 400 Bad Request, "Password must contain uppercase, lowercase, and number"

### Test 3.3: Create User - Valid Data
**Endpoint:** `POST /api/v1/admin/user`
```json
{
  "username": "validuser001",
  "name": "Valid User",
  "class": "10 PPLG 1",
  "role": "voter"
}
```
**Expected:** ✅ 200 OK, user created

### Test 3.4: Search User - Special Characters (NoSQL Injection Test)
**Endpoint:** `GET /api/v1/admin/user?name=.*.*.*.*`  
**Expected:** ✅ 200 OK, returns safely (no ReDoS)

---

## Test Suite 4: File Upload Security

### Test 4.1: Valid CSV Upload
**Endpoint:** `POST /api/v1/admin/upload/csv`  
**File:** Valid CSV with voters (any size up to 10MB)  
**Expected:** ✅ 200 OK, voters imported

### Test 4.2: Invalid File Type
**Endpoint:** `POST /api/v1/admin/upload/csv`  
**File:** test.exe or test.pdf  
**Expected:** ❌ 400 Bad Request, "Only CSV files allowed"

### Test 4.3: File Too Large
**Endpoint:** `POST /api/v1/admin/upload/csv`  
**File:** CSV > 10MB  
**Expected:** ❌ 400 Bad Request, "File too large"

### Test 4.4: Path Traversal Attempt
**Action:** Upload file named: `../../etc/passwd.csv`  
**Expected:** ❌ 400 Bad Request, "Invalid file path"

### Test 4.5: Large CSV (Streaming Test)
**File:** CSV with 10,000+ rows  
**Expected:** ✅ 200 OK, processed without memory issues

---

## Test Suite 5: Voting Integrity

### Test 5.1: Single Vote
**User:** testvoter001  
**Endpoint:** `POST /api/v1/vote`
```json
{
  "osis": "candidate_osis_id",
  "mpk": "candidate_mpk_id"
}
```
**Expected:** ✅ 200 OK, vote recorded

### Test 5.2: Duplicate Vote (Sequential)
**Action:** Same user votes again immediately  
**Expected:** ❌ 400 Bad Request, "user already voted"

### Test 5.3: Duplicate Vote (Concurrent) - CRITICAL TEST
**Action:** Open 10 browser tabs, submit vote simultaneously  
**Expected:** Only 1 vote succeeds, others fail with "user already voted"  
**Verify:** Check database - only 2 vote records exist (1 OSIS + 1 MPK)

### Test 5.4: Admin Attempts to Vote
**User:** Admin  
**Endpoint:** `POST /api/v1/vote`  
**Expected:** ❌ 400 Bad Request, "admins cannot vote"

### Test 5.5: Vote When Closed
**Action:** Admin sets `isVotingAllowed = false`, then try vote  
**Expected:** ❌ 401 Unauthorized, "vote not allowed"

### Test 5.6: Database Constraint Check
**Action:** Manually try to insert duplicate vote via MongoDB
```javascript
db.votes.insertOne({
  label: "osis",
  user: ObjectId("existing_user_id"),
  candidate: ObjectId("candidate_id")
})
// Try insert again with same user + label
```
**Expected:** MongoDB error: E11000 duplicate key error (unique constraint)

---

## Test Suite 6: Vote Reset Authorization

### Test 6.1: Admin Reset Vote
**User:** Admin  
**Endpoint:** `PUT /api/v1/admin/reset`
```json
{
  "username": "testvoter001"
}
```
**Expected:** ✅ 200 OK, vote reset successful  
**Verify:** User can vote again

### Test 6.2: Non-Admin Reset Attempt
**User:** Voter  
**Endpoint:** `PUT /api/v1/admin/reset`  
**Expected:** ❌ 403 Forbidden

### Test 6.3: Audit Log Check
**Action:** After admin reset, check logs
```bash
docker-compose exec app cat src/logs/app.log | grep "reset vote"
```
**Expected:** Log entry shows admin username and target user

---

## Test Suite 7: Data Integrity

### Test 7.1: Vote Count Accuracy
**Action:**
1. Reset test database
2. Create 10 test voters
3. Each votes once
4. Check count

**Endpoint:** `GET /api/v1/admin/count`  
**Expected:** 
```json
{
  "voted": 10,
  "notVoted": 0
}
```

### Test 7.2: Live Count Accuracy
**Endpoint:** `GET /api/v1/admin/live/count`  
**Expected:** Vote counts match actual votes in database

---

## Test Suite 8: Error Handling

### Test 8.1: Malformed JSON
**Endpoint:** `POST /api/v1/vote`  
**Body:** `{invalid json}`  
**Expected:** ❌ 400 Bad Request

### Test 8.2: Missing Required Fields
**Endpoint:** `POST /api/v1/admin/user`
```json
{
  "username": "test"
}
```
**Expected:** ❌ 400 Bad Request, validation error

### Test 8.3: Invalid Candidate ID
**Endpoint:** `POST /api/v1/vote`
```json
{
  "osis": "invalid_id",
  "mpk": "invalid_id"
}
```
**Expected:** ❌ 400 Bad Request, "candidate chosen is not valid"

---

## Performance Tests

### Test P1: CSV Import Performance
**File Size:** 1MB, 5MB, 10MB  
**Expected:** All complete within reasonable time (< 30s for 10MB)  
**Monitor:** Memory usage should remain stable (streaming)

### Test P2: Concurrent Vote Performance
**Action:** 50 simultaneous vote requests  
**Expected:** All processed, locks acquired/released properly  
**Monitor:** No deadlocks, response time < 5s each

---

## Security Verification Checklist

### JWT Security
- [ ] Forged tokens rejected
- [ ] Expired tokens rejected
- [ ] Algorithm specification enforced (HS256)
- [ ] Token signature verified

### Authorization
- [ ] Admin endpoints require admin role
- [ ] Voters cannot access admin functions
- [ ] Unauthenticated requests rejected

### Input Validation
- [ ] Invalid class values rejected
- [ ] Weak passwords rejected
- [ ] Special regex characters escaped
- [ ] Field name mismatch fixed (class/kelas)

### File Security
- [ ] Non-CSV files rejected
- [ ] Large files (>10MB) rejected
- [ ] Path traversal attempts blocked
- [ ] Streaming works for large files

### Data Integrity
- [ ] Duplicate votes prevented (application + DB)
- [ ] Concurrent votes handled correctly
- [ ] Unique constraint enforced at database
- [ ] Vote counts accurate

### Cryptography
- [ ] Password generation uses crypto.randomBytes
- [ ] Generated passwords are random and unpredictable

### Audit & Logging
- [ ] Vote resets logged with admin ID
- [ ] Security events logged to file
- [ ] No sensitive data in logs

---

## Post-Testing Verification

### Database Check
```javascript
// Connect to MongoDB
use pemilos

// Check for duplicate votes
db.votes.aggregate([
  { $group: { _id: { user: "$user", label: "$label" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])
// Expected: Empty result (no duplicates)

// Check unique index exists
db.votes.getIndexes()
// Expected: Index on { user: 1, label: 1 } with unique: true
```

### Log Review
```bash
# Check for security events
docker-compose exec app tail -n 100 src/logs/app.log

# Look for:
# - JWT verification failures
# - Admin authorization checks
# - Vote reset audit trails
# - File upload rejections
```

---

## Issue Reporting Template

If test fails, document:

```
**Test ID:** [e.g., Test 5.3]
**Status:** FAIL
**Expected:** [expected behavior]
**Actual:** [what happened]
**Steps to Reproduce:**
1. 
2. 
3. 

**Logs/Screenshots:** [attach relevant info]
**Severity:** Critical/High/Medium/Low
```

---

## Success Criteria

All tests must pass before deployment:

- [ ] All authentication tests pass (5/5)
- [ ] All authorization tests pass (3/3)
- [ ] All validation tests pass (4/4)
- [ ] All file security tests pass (5/5)
- [ ] All voting integrity tests pass (6/6)
- [ ] All authorization tests pass (3/3)
- [ ] All data integrity tests pass (2/2)
- [ ] Performance tests acceptable
- [ ] No duplicate votes in database
- [ ] All security checklist items verified

**TOTAL:** 28 core tests + performance verification

---

**Notes:**
- Run tests in order
- Document all failures immediately
- Do not skip concurrent vote test (most critical)
- Verify database state after voting tests
- Check logs after each test suite
