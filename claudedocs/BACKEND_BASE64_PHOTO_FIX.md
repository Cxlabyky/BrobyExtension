# Backend Base64 Photo Upload Support

## Problem
Backend is rejecting extension photo uploads with error: **"No photo file provided"**

**Root Cause**: Backend controller expects `req.file` from multer (multipart/form-data), but extension now sends base64 JSON to avoid middleware parsing errors.

---

## Required Backend Changes

### Step 1: Update Photo Upload Controller

**File**: Backend consultation controller (photo upload endpoint)

**Current Code** (expects multer):
```typescript
async uploadPhoto(req: Request, res: Response) {
  // ❌ This only works for multipart/form-data from webapp
  if (!req.file) {
    return res.status(400).json({ error: 'No photo file provided' });
  }

  const photoBuffer = req.file.buffer;
  const filename = req.file.originalname;
  const mimeType = req.file.mimetype;
  // ... upload to storage
}
```

**Updated Code** (supports BOTH formats):
```typescript
async uploadPhoto(req: Request, res: Response) {
  let photoBuffer: Buffer;
  let filename: string;
  let mimeType: string;
  let caption: string;

  // ✅ Check if multipart/form-data (webapp) OR base64 JSON (extension)
  if (req.file) {
    // 📱 WebApp format (multer multipart/form-data)
    photoBuffer = req.file.buffer;
    filename = req.file.originalname;
    mimeType = req.file.mimetype;
    caption = req.body.caption || filename;

    console.log('📱 WebApp photo upload (multipart)');

  } else if (req.body.photo) {
    // 🧩 Extension format (base64 JSON)
    const base64Data = req.body.photo;
    filename = req.body.filename;
    mimeType = req.body.mimeType;
    caption = req.body.caption || filename;

    console.log('🧩 Extension photo upload (base64)');

    // Convert base64 to Buffer
    // Format: "data:image/png;base64,iVBORw0KGg..."
    const base64Match = base64Data.match(/^data:([^;]+);base64,(.+)$/);

    if (!base64Match) {
      return res.status(400).json({
        error: 'Invalid base64 format. Expected: data:image/...;base64,...'
      });
    }

    const extractedMimeType = base64Match[1];
    const base64String = base64Match[2];

    // Validate MIME type matches
    if (extractedMimeType !== mimeType) {
      console.warn(`⚠️ MIME type mismatch: ${extractedMimeType} vs ${mimeType}`);
    }

    // Convert base64 string to Buffer
    photoBuffer = Buffer.from(base64String, 'base64');

  } else {
    // ❌ Neither format provided
    return res.status(400).json({
      error: 'No photo file provided. Send either multipart/form-data or base64 JSON.'
    });
  }

  // Validate file type
  if (!mimeType.startsWith('image/')) {
    return res.status(400).json({ error: 'File must be an image' });
  }

  // Validate file size (10MB limit)
  if (photoBuffer.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image must be smaller than 10MB' });
  }

  try {
    // 🔄 Rest of upload logic remains the same
    const photoUrl = await this.uploadToStorage(photoBuffer, filename, mimeType);

    const photo = await this.consultationService.addPhoto({
      consultationId: req.params.id,
      url: photoUrl,
      filename: filename,
      caption: caption
    });

    return res.status(200).json({
      success: true,
      data: photo
    });

  } catch (error) {
    console.error('❌ Photo upload error:', error);
    return res.status(500).json({
      error: 'Failed to upload photo',
      details: error.message
    });
  }
}
```

---

## Key Changes Explained

### 1. Dual Format Support
```typescript
if (req.file) {
  // WebApp: multer provides req.file
} else if (req.body.photo) {
  // Extension: base64 in req.body.photo
}
```

### 2. Base64 Parsing
```typescript
// Input: "data:image/png;base64,iVBORw0KGg..."
const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
const mimeType = match[1];      // "image/png"
const base64String = match[2];  // "iVBORw0KGg..."

// Convert to Buffer
const photoBuffer = Buffer.from(base64String, 'base64');
```

### 3. Validation
- File type validation (must be image/*)
- File size validation (10MB limit)
- MIME type consistency check
- Base64 format validation

---

## Request Formats

### WebApp (Multipart) - Still Works
```http
POST /api/v1/consultations/{id}/photos
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...

------WebKitFormBoundary...
Content-Disposition: form-data; name="photo"; filename="image.png"
Content-Type: image/png

[Binary image data]
------WebKitFormBoundary...
Content-Disposition: form-data; name="caption"

My pet's wound
------WebKitFormBoundary...--
```

### Extension (Base64 JSON) - New Format
```http
POST /api/v1/consultations/{id}/photos
Content-Type: application/json

{
  "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "filename": "Screenshot 2025-10-24 at 2.33.25 AM.png",
  "mimeType": "image/png",
  "caption": "Screenshot 2025-10-24 at 2.33.25 AM.png"
}
```

---

## Response Format (Same for Both)

### Success (200)
```json
{
  "success": true,
  "data": {
    "id": "photo-uuid",
    "consultationId": "consultation-uuid",
    "url": "https://storage.../photo.png",
    "filename": "image.png",
    "caption": "My pet's wound",
    "createdAt": "2025-10-24T02:33:25Z"
  }
}
```

### Error (400)
```json
{
  "error": "No photo file provided. Send either multipart/form-data or base64 JSON."
}
```

---

## Testing Checklist

### WebApp (Multipart) - Should Still Work
- [ ] Upload photo from webapp photo button
- [ ] Verify photo appears in grid
- [ ] Verify photo stored in database
- [ ] Verify photo URL accessible

### Extension (Base64) - Should Now Work
- [ ] Upload photo from extension photo button
- [ ] Verify no "No photo file provided" error
- [ ] Verify photo appears in grid
- [ ] Verify photo stored in database
- [ ] Verify photo size ~33% larger than original (base64 overhead)

### Edge Cases
- [ ] Upload 10MB photo (should succeed)
- [ ] Upload 11MB photo (should fail with size error)
- [ ] Upload non-image file (should fail with type error)
- [ ] Upload with missing fields (should fail with validation error)

---

## cURL Testing

### Test Extension Base64 Upload
```bash
# 1. Create base64 test image
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" > test.b64

# 2. Upload to backend
curl -X POST "https://backend-production-a35dc.up.railway.app/api/v1/consultations/44187924-6992-48f8-9422-72b9cd631328/photos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-recording-token: YOUR_RECORDING_TOKEN" \
  -d '{
    "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "filename": "test.png",
    "mimeType": "image/png",
    "caption": "Test upload"
  }'
```

### Expected Success Response
```json
{
  "success": true,
  "data": {
    "id": "...",
    "url": "https://...",
    "filename": "test.png"
  }
}
```

---

## Migration Notes

### No Breaking Changes
- ✅ WebApp continues using multipart/form-data (no changes needed)
- ✅ Extension now uses base64 JSON (fixes middleware parsing error)
- ✅ Backend handles both formats automatically
- ✅ No database schema changes required
- ✅ No API endpoint changes required

### Performance Impact
- Base64 encoding adds ~33% overhead (1.2MB → 1.6MB)
- Still well under 10MB limit
- Network transfer slightly larger but acceptable for photo uploads
- No significant backend processing overhead

### Rollback Plan
If issues occur:
1. Backend can disable base64 support by removing `else if (req.body.photo)` block
2. Extension can revert to multipart by reverting photo.service.js changes
3. No data loss - both formats write to same storage/database

---

## Summary

**What Changed**:
- Extension: Sends photos as base64 JSON instead of multipart/form-data
- Backend: Updated to accept BOTH multipart (webapp) and base64 (extension) formats

**Why**:
- Fixes middleware parsing error where `express.json()` runs before multer
- Avoids modifying backend middleware order
- Maintains webapp compatibility

**Implementation**:
- Frontend: ✅ Already updated (photo.service.js using base64)
- Backend: ⏳ Needs update (add base64 handling to controller)

**Next Steps**:
1. Update backend controller with dual format support
2. Test both webapp and extension uploads
3. Verify no regressions in existing photo functionality
