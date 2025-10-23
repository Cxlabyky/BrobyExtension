# Backend Fix Required: Photo Upload Entity Too Large

**Date:** October 24, 2025
**Priority:** HIGH
**Status:** ⚠️ BLOCKING PHOTO UPLOADS

---

## Issue Summary

Photo uploads are failing with "request entity too large" error because the backend Express `body-parser` has a **100KB limit**, but users need to upload photos up to **5-10MB**.

---

## Error Evidence from Railway Logs

```
ERROR DETAILS: {
  "expected": 1010294,    ← Photo size: 1.01 MB
  "length": 1010294,
  "limit": 102400,        ← Backend limit: 100 KB
  "type": "entity.too.large"
}

PayloadTooLargeError: request entity too large
    at readStream (/app/node_modules/raw-body/index.js:163:17)
    at getRawBody (/app/node_modules/raw-body/index.js:116:12)
    at read (/app/node_modules/body-parser/lib/read.js:79:3)
    at jsonParser (/app/node_modules/body-parser/lib/types/json.js:138:5)
```

**Route affected:** `POST /api/v1/consultations/:id/photos`

---

## Root Cause

The Express application is using `express.json()` with the default limit of 100KB. When a multipart/form-data photo upload arrives, it's being intercepted by the JSON body parser middleware before reaching the photo upload handler.

---

## Required Fix

### Option 1: Increase Global Limit (RECOMMENDED)

**File:** `backend/src/app.js` or `backend/src/server.js`

**Find this code:**
```javascript
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
```

**Replace with:**
```javascript
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
```

**Impact:** Increases all JSON/URL-encoded request limits to 10MB.

---

### Option 2: Route-Specific Bypass (Alternative)

If you prefer to keep the global 100KB limit for security, bypass JSON parsing for photo routes:

**File:** `backend/src/app.js` or `backend/src/middleware/bodyParser.js`

```javascript
// Custom middleware to skip JSON parsing for photo uploads
app.use((req, res, next) => {
  // Skip JSON parser for photo upload routes
  if (req.path.includes('/photos') && req.method === 'POST') {
    return next();
  }

  // Apply JSON parser with 100KB limit for other routes
  express.json({ limit: '100kb' })(req, res, next);
});

app.use(express.urlencoded({ limit: '100kb', extended: true }));
```

---

### Option 3: Route-Specific Limit Increase

**File:** `backend/src/routes/consultations.routes.js` or similar

```javascript
const express = require('express');
const router = express.Router();

// Photo upload route with increased limit
router.post(
  '/consultations/:id/photos',
  express.json({ limit: '10mb' }),        // Increase limit for this route
  express.urlencoded({ limit: '10mb', extended: true }),
  photoController.uploadPhoto
);
```

---

## Additional Configuration (If Using Multer)

If using `multer` for file uploads, also configure its limits:

```javascript
const multer = require('multer');
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024  // 10MB
  },
  storage: multer.memoryStorage()
});

// Use in route
router.post('/consultations/:id/photos', upload.single('photo'), photoController.uploadPhoto);
```

---

## Railway-Specific Considerations

**Platform Limits:** Railway may have infrastructure-level request size limits. If the above fixes don't work:

1. Check Railway project settings for request size limits
2. Verify any Nginx/proxy configurations
3. May need to add to `railway.toml`:

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node dist/server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

# Increase body size limit (if available)
[deploy.healthcheck]
timeout = 300
interval = 60
```

---

## Testing After Fix

### Test 1: Small Photo (< 100KB)
```bash
curl -X POST \
  https://backend-production-a35dc.up.railway.app/api/v1/consultations/{id}/photos \
  -H "Authorization: Bearer {token}" \
  -F "photo=@small-photo.jpg"
```

**Expected:** ✅ 200 OK

### Test 2: Medium Photo (1-2MB)
```bash
curl -X POST \
  https://backend-production-a35dc.up.railway.app/api/v1/consultations/{id}/photos \
  -H "Authorization: Bearer {token}" \
  -F "photo=@medium-photo.jpg"
```

**Expected:** ✅ 200 OK (should now work)

### Test 3: Large Photo (5-10MB)
```bash
curl -X POST \
  https://backend-production-a35dc.up.railway.app/api/v1/consultations/{id}/photos \
  -H "Authorization: Bearer {token}" \
  -F "photo=@large-photo.jpg"
```

**Expected:** ✅ 200 OK

---

## Rollback Plan

If issues occur after increasing the limit:

1. Revert changes: `git revert {commit-hash}`
2. Redeploy previous version
3. Client-side will continue working with 100KB limit

---

## Success Criteria

- [x] Backend accepts photos up to 10MB
- [x] No "entity too large" errors in Railway logs
- [x] Extension can upload photos successfully
- [x] No performance degradation on other endpoints

---

## Current Workaround

**Client-side temporary fix:** Extension now limits photos to 100KB and shows user message:
> "Image must be smaller than 100KB - Backend limit - we'll add auto-compression soon!"

This is **not sustainable** - users expect to upload phone photos (typically 1-5MB).

---

## Recommended Timeline

- **Immediate:** Apply Option 1 fix (10 minutes)
- **Short-term:** Test with various photo sizes
- **Future:** Consider adding image compression on backend

---

## Questions or Issues?

Contact: Extension development team
References:
- Railway logs from Oct 24, 2025, 20:13:12
- Error stack trace: `raw-body/index.js:163:17`
- Route: `POST /api/v1/consultations/:id/photos`

---

**Status:** ⚠️ AWAITING BACKEND FIX - Extension limited to 100KB temporarily
