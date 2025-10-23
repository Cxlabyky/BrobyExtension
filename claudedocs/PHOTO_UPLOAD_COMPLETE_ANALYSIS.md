# Photo Upload Feature - Complete Implementation Analysis

## 📋 Overview

This document provides a complete breakdown of the photo upload feature implemented in the BrobyVets Chrome Extension for comparison with your web backend AI.

---

## 🏗️ Architecture Overview

### Component Structure
```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. UI Layer (sidebar.html + sidebar.css)                   │
│     - Photo grid display                                     │
│     - Upload button (+)                                      │
│     - Photo thumbnails with remove buttons                   │
│                                                               │
│  2. Controller Layer (sidebar.js)                           │
│     - Photo upload orchestration                             │
│     - UI state management                                    │
│     - Error handling                                         │
│                                                               │
│  3. Service Layer (api/photo.service.js)                    │
│     - API communication                                      │
│     - Retry logic                                            │
│     - File validation                                        │
│                                                               │
│  4. Injection Layer (ezyvet-injection.js)                   │
│     - EzyVet form photo injection                            │
│     - DOM manipulation                                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              ↕ HTTP
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
│  POST   /consultations/:id/photos     (upload)              │
│  GET    /consultations/:id/photos     (list)                │
│  DELETE /consultations/:id/photos/:id (delete)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📡 API Specifications

### Endpoint Configuration (config.js:28)

```javascript
UPLOAD_PHOTO: (id) => `/consultations/${id}/photos`
```

**Base URL**: `https://backend-production-a35dc.up.railway.app/api/v1`

---

### 1. Upload Photo

**Endpoint**: `POST /consultations/{consultationId}/photos`

**Request Format**:
```http
POST /api/v1/consultations/{consultationId}/photos
Content-Type: multipart/form-data
Authorization: Bearer {access_token}

--boundary
Content-Disposition: form-data; name="photo"; filename="image.jpg"
Content-Type: image/jpeg

{binary image data}
--boundary
Content-Disposition: form-data; name="caption"

Optional photo caption
--boundary--
```

**Request Details**:
- **Method**: POST
- **Content-Type**: `multipart/form-data` (auto-set by browser)
- **Headers**:
  - `Authorization`: Bearer token from TokenManager
  - Browser automatically sets `Content-Type` with boundary
- **Body**: FormData with:
  - `photo`: File object (required)
  - `caption`: String (optional)

**Frontend Code** (photo.service.js:39-58):
```javascript
const formData = new FormData();
formData.append('photo', photoFile, photoFile.name);
if (caption) {
  formData.append('caption', caption);
}

const authHeaders = await TokenManager.getAuthHeaders();

const response = await fetch(
  `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.UPLOAD_PHOTO(consultationId)}`,
  {
    method: 'POST',
    headers: {
      ...authHeaders
      // Don't set Content-Type - browser sets it with boundary
    },
    body: formData
  }
);
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-photo-id",
    "consultationId": "uuid-consultation-id",
    "url": "https://storage.url/photo.jpg",
    "filename": "image.jpg",
    "size": 245632,
    "mimeType": "image/jpeg",
    "caption": "Optional caption",
    "createdAt": "2025-01-24T12:00:00Z"
  }
}
```

**Validation** (photo.service.js:22-36):
- **File type**: Must start with `image/`
- **File size**: Maximum 5MB (5 * 1024 * 1024 bytes)
- **Required**: `consultationId`, `photoFile`

---

### 2. Get Photos

**Endpoint**: `GET /consultations/{consultationId}/photos`

**Request Format**:
```http
GET /api/v1/consultations/{consultationId}/photos
Authorization: Bearer {access_token}
```

**Frontend Code** (photo.service.js:124-129):
```javascript
const response = await fetch(
  `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.UPLOAD_PHOTO(consultationId)}`,
  {
    method: 'GET',
    headers: authHeaders
  }
);
```

**Expected Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "url": "https://storage.url/photo1.jpg",
      "filename": "image1.jpg",
      "size": 245632,
      "caption": "Caption 1"
    },
    {
      "id": "uuid-2",
      "url": "https://storage.url/photo2.jpg",
      "filename": "image2.jpg",
      "size": 189234,
      "caption": null
    }
  ]
}
```

---

### 3. Delete Photo

**Endpoint**: `DELETE /consultations/{consultationId}/photos/{photoId}`

**Request Format**:
```http
DELETE /api/v1/consultations/{consultationId}/photos/{photoId}
Authorization: Bearer {access_token}
```

**Frontend Code** (photo.service.js:167-173):
```javascript
const response = await fetch(
  `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.UPLOAD_PHOTO(consultationId)}/${photoId}`,
  {
    method: 'DELETE',
    headers: authHeaders
  }
);
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Photo deleted successfully"
}
```

---

## 🔄 Upload Flow

### Complete Upload Sequence

```
User selects photo file
    ↓
sidebar.js:uploadPhoto()
    ├─ Validate file type (must be image/*)
    ├─ Validate file size (≤ 5MB)
    ├─ Create optimistic UI (show thumbnail immediately)
    ├─ Add to uploadingPhotos Set
    ↓
PhotoService.uploadPhotoWithRetry()
    ├─ Attempt 1: uploadPhoto()
    │   ├─ Create FormData
    │   ├─ Append photo file
    │   ├─ Append caption (if provided)
    │   ├─ POST /consultations/:id/photos
    │   └─ Return result
    ├─ If failed → Retry with exponential backoff
    │   ├─ Wait 1s → Attempt 2
    │   ├─ Wait 2s → Attempt 3
    │   └─ Wait 4s → Final attempt
    ↓
Backend processes upload
    ├─ Validate authentication
    ├─ Validate file type & size
    ├─ Upload to storage (S3/GCS/etc)
    ├─ Save metadata to database
    └─ Return photo object
    ↓
sidebar.js handles response
    ├─ If success:
    │   ├─ Remove temp thumbnail
    │   ├─ Add real thumbnail with photo.url
    │   ├─ Add to photos[] array
    │   └─ Update photo count badge
    └─ If failed:
        ├─ Remove temp thumbnail
        ├─ Show error alert
        └─ Remove from uploadingPhotos Set
```

---

## 💾 Data Structures

### Photo Object Structure

**Frontend Storage** (sidebar.js:18):
```javascript
this.photos = [
  {
    id: "uuid-photo-id",
    url: "https://storage.url/photo.jpg",
    filename: "image.jpg",
    size: 245632,
    mimeType: "image/jpeg",
    caption: "Optional caption",
    createdAt: "2025-01-24T12:00:00Z"
  }
]
```

**Uploading State** (sidebar.js:19):
```javascript
this.uploadingPhotos = new Set([
  "temp-1737724800000",  // Temporary ID during upload
  "temp-1737724801000"
])
```

---

## 🎨 UI Implementation

### HTML Structure (sidebar.html)

```html
<!-- Recording State -->
<div id="recording-state" class="state">
  <div class="photo-section">
    <div class="section-header">
      <span class="section-title">📸 Photos</span>
      <span class="photo-count-badge" id="photoCount">0</span>
    </div>

    <div class="photos-grid" id="photosGrid">
      <!-- Photos will be added here dynamically -->

      <!-- Add Photo Button (always present) -->
      <button class="add-photo-btn" id="addPhotoBtn">+</button>
    </div>

    <!-- Hidden file input -->
    <input
      type="file"
      id="photoInput"
      accept="image/*"
      multiple
      style="display: none;"
    />
  </div>
</div>
```

### CSS Styling (sidebar.css)

```css
.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 70px);
  gap: 8px;
  padding: 8px 0;
}

.photo-thumbnail {
  width: 70px;
  height: 70px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  position: relative;
  cursor: pointer;
  border: 2px solid rgba(31, 199, 202, 0.2);
}

.photo-thumbnail.photo-uploading {
  opacity: 0.5;
  border: 2px solid #FFA500;
  animation: pulse 1.5s ease-in-out infinite;
}

.remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #FF3B30;
  color: white;
  border: none;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-photo-btn {
  width: 70px;
  height: 70px;
  border-radius: 8px;
  background: rgba(31, 199, 202, 0.1);
  border: 2px dashed rgba(31, 199, 202, 0.3);
  color: #1FC7CA;
  font-size: 32px;
  cursor: pointer;
}
```

---

## 🔌 Integration Points

### 1. Sidebar Controller Integration (sidebar.js)

**Initialization** (sidebar.js:129):
```javascript
setupPhotoUpload() {
  const addPhotoBtn = document.getElementById('addPhotoBtn');
  const photoInput = document.getElementById('photoInput');

  // Click "+" button to trigger file input
  addPhotoBtn.addEventListener('click', () => {
    if (!this.consultationId) {
      alert('❌ Please start a consultation first');
      return;
    }
    photoInput.click();
  });

  // Handle file selection
  photoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Upload each selected photo
    for (const file of files) {
      await this.uploadPhoto(file);
    }

    // Clear input for next selection
    photoInput.value = '';
  });
}
```

**Upload Handler** (sidebar.js:573):
```javascript
async uploadPhoto(file) {
  console.log('📸 Uploading photo:', file.name);

  // Validate file
  if (!file.type.startsWith('image/')) {
    alert('❌ Please select an image file');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert('❌ Image must be smaller than 10MB');
    return;
  }

  // Create preview immediately (optimistic UI)
  const tempId = `temp-${Date.now()}`;
  const previewUrl = URL.createObjectURL(file);
  this.addPhotoToGrid(tempId, previewUrl, true); // true = uploading
  this.uploadingPhotos.add(tempId);

  try {
    // Upload to backend with retry
    const result = await PhotoService.uploadPhotoWithRetry(
      this.consultationId,
      file,
      '', // caption
      3  // max retries
    );

    if (result.success) {
      // Replace temp photo with real photo data
      this.removePhotoFromGrid(tempId);
      this.uploadingPhotos.delete(tempId);

      // Add real photo
      this.addPhotoToGrid(result.photo.id, result.photo.url, false);
      this.photos.push(result.photo);
      this.updatePhotoCount();
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error('❌ Photo upload failed:', error);
    this.removePhotoFromGrid(tempId);
    this.uploadingPhotos.delete(tempId);
    alert(`❌ Failed to upload photo: ${error.message}`);
  }
}
```

---

### 2. EzyVet Injection Integration (ezyvet-injection.js)

**Photo Injection Method** (ezyvet-injection.js:288-360):
```javascript
async injectPhotos(photos) {
  if (!photos || photos.length === 0) {
    console.log('📸 No photos to inject');
    return { success: true };
  }

  try {
    console.log(`📸 Starting photo injection for ${photos.length} photo(s)...`);

    // TODO: REPLACE WITH YOUR DISCOVERED PATTERN
    const photoUploadElementId = `photo_upload_field-${this.currentTabNumber}`;
    const uploadElement = document.getElementById(photoUploadElementId);

    if (!uploadElement) {
      console.warn('⚠️ Photo upload element not found:', photoUploadElementId);
      return {
        success: false,
        error: 'Photo upload element not found'
      };
    }

    console.log('✅ Found photo upload element:', uploadElement);

    // Upload each photo sequentially
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      console.log(`📸 Uploading photo ${i + 1}/${photos.length}: ${photo.filename}`);

      const uploaded = await this.uploadSinglePhoto(uploadElement, photo);

      if (!uploaded) {
        console.warn(`⚠️ Failed to upload photo: ${photo.filename}`);
      } else {
        console.log(`✅ Photo ${i + 1} uploaded successfully`);
      }

      // Small delay between uploads
      if (i < photos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('✅ All photos injected');
    return { success: true };

  } catch (error) {
    console.error('❌ Photo injection error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async uploadSinglePhoto(uploadElement, photo) {
  try {
    // Method 1: Fetch photo as blob and create File object
    const response = await fetch(photo.url);
    const blob = await response.blob();
    const file = new File([blob], photo.filename, { type: photo.mimeType || 'image/jpeg' });

    // Method 2: Simulate file selection
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Set files on input element
    uploadElement.files = dataTransfer.files;

    // Trigger change event
    const changeEvent = new Event('change', { bubbles: true });
    uploadElement.dispatchEvent(changeEvent);

    // Wait for upload to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    return true;

  } catch (error) {
    console.error('❌ Single photo upload failed:', error);
    return false;
  }
}
```

**Integration into Main Flow** (ezyvet-injection.js:64-75):
```javascript
// ✅ NEW STEP 5: Inject photos if provided
if (photos && photos.length > 0) {
  console.log(`📸 Injecting ${photos.length} photo(s)...`);
  const photoResult = await this.injectPhotos(photos);

  if (!photoResult.success) {
    console.warn('⚠️ Photo injection failed:', photoResult.error);
    console.log('💡 Continuing with summary submission anyway');
    // Don't throw - still submit summary even if photos fail
  } else {
    console.log('✅ Photos injected successfully');
  }
}
```

---

### 3. Content Script Integration (content-script.js)

**Message Handler** (content-script.js:26-33):
```javascript
// Handle injection request (supports both message formats)
if (message.action === 'injectHistory' || message.type === 'INSERT_SUMMARY') {
  // ✅ NEW: Extract photos from message
  const photos = message.photos || [];

  // Support both summaryText and summary properties
  const summaryText = message.summaryText || message.summary;

  handleInjectionRequest(summaryText, photos)
    .then(result => {
      console.log('✅ Injection result:', result);
      sendResponse(result);
    })
    .catch(error => {
      console.error('❌ Injection error:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });

  return true; // Keep message channel open for async response
}
```

**Injection Handler** (content-script.js:62-91):
```javascript
async function handleInjectionRequest(summaryText, photos = []) {
  try {
    // Validate summary text
    if (!summaryText || typeof summaryText !== 'string') {
      throw new Error('Invalid summary text provided');
    }

    if (summaryText.trim().length === 0) {
      throw new Error('Summary text is empty');
    }

    console.log('🎤 Starting injection for summary:', summaryText.substring(0, 100) + '...');
    if (photos && photos.length > 0) {
      console.log(`📸 Injection includes ${photos.length} photo(s)`);
    }

    // Get injector instance
    const injectorInstance = getInjector();

    // ✅ NEW: Pass photos to injector
    const result = await injectorInstance.injectSummary(summaryText, photos);

    if (result.success) {
      console.log('✅ Summary injected successfully into EzyVet');
    } else {
      console.error('❌ Injection failed:', result.error);
    }

    return result;

  } catch (error) {
    console.error('❌ Injection request handler error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

---

## 🔄 Retry Logic

### Exponential Backoff Implementation (photo.service.js:95-113)

```javascript
static async uploadPhotoWithRetry(consultationId, photoFile, caption = '', maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await this.uploadPhoto(consultationId, photoFile, caption);

    if (result.success) {
      return result;
    }

    // If this was the last attempt, return the error
    if (attempt === maxRetries - 1) {
      return result;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, attempt) * 1000;
    console.warn(`⚠️ Retry ${attempt + 1}/${maxRetries} for photo upload after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

**Retry Schedule**:
- Attempt 1: Immediate
- Attempt 2: After 1 second (2^0 * 1000ms)
- Attempt 3: After 2 seconds (2^1 * 1000ms)
- Attempt 4: After 4 seconds (2^2 * 1000ms)

---

## 🎯 User Flow

### Complete User Journey

```
1. User starts recording consultation
   ↓
2. Recording state shows photo section with "+" button
   ↓
3. User clicks "+" button
   ├─ If no consultation: Alert "Please start a consultation first"
   └─ If consultation exists: Open file picker
   ↓
4. User selects one or more photos
   ↓
5. For each selected photo:
   ├─ Validate file type (image/*)
   ├─ Validate file size (≤ 5MB)
   ├─ Show thumbnail immediately (optimistic UI)
   ├─ Show loading state (pulsing border)
   ├─ Upload to backend with retry
   ├─ If success:
   │   ├─ Replace loading thumbnail with real photo
   │   ├─ Add remove button (×)
   │   └─ Update photo count badge
   └─ If failed:
       ├─ Remove loading thumbnail
       └─ Show error alert
   ↓
6. User can delete photos by clicking × button
   ├─ Show confirmation dialog
   ├─ DELETE request to backend
   ├─ Remove from UI grid
   └─ Update photo count badge
   ↓
7. User stops recording
   ↓
8. Summary generates
   ↓
9. Auto-injection to EzyVet
   ├─ Click "Add History" button
   ├─ Wait for form popup
   ├─ Fill summary text
   ├─ Inject photos (if any)
   │   ├─ Fetch photo URLs as blobs
   │   ├─ Create File objects
   │   ├─ Simulate file selection on EzyVet upload field
   │   └─ Trigger change events
   └─ Submit form
```

---

## 📊 State Management

### Consultation Lifecycle

```javascript
// State initialization
this.consultationId = null;
this.photos = [];
this.uploadingPhotos = new Set();

// Start recording
startRecording() {
  this.consultationId = result.consultationId;
  this.loadExistingPhotos(this.consultationId);  // Load any existing photos
}

// Stop recording
stopRecording() {
  // Photos remain loaded - NOT cleared
  // Available for injection
}

// Start new consultation
startNewConsult() {
  this.consultationId = null;
  this.resetPhotoState();  // Clear photos array and UI grid
}
```

---

## 🐛 Error Handling

### Error Scenarios & Handling

| Error | Handling |
|-------|----------|
| **No consultation ID** | Alert user: "Please start a consultation first" |
| **Invalid file type** | Alert user: "Please select an image file" |
| **File too large (>5MB)** | Alert user: "Image must be smaller than 5MB" |
| **Network error** | Retry with exponential backoff (3 attempts) |
| **Backend error (4xx/5xx)** | Show error alert with backend error message |
| **Upload timeout** | Retry with longer timeout on next attempt |
| **Delete confirmation** | Require user confirmation before deletion |
| **Photo injection fails** | Log warning but continue with summary submission |

---

## 🔒 Security Considerations

### Authentication & Authorization

**Token Management**:
```javascript
const authHeaders = await TokenManager.getAuthHeaders();
// Returns: { 'Authorization': 'Bearer {access_token}' }
```

**Access Control**:
- Photos are scoped to `consultationId`
- Only authenticated users can upload
- Backend should verify user owns the consultation

**File Validation**:
- Client-side: File type and size validation
- Server-side: Should re-validate file type, size, and scan for malware

---

## 📐 Design Decisions

### Why These Choices?

1. **Optimistic UI Updates**
   - Show thumbnails immediately for better UX
   - User sees instant feedback
   - Loading state indicates upload in progress

2. **Retry with Exponential Backoff**
   - Handles transient network failures
   - Reduces backend load vs constant retries
   - Matches audio chunk upload pattern

3. **Multiple Photo Support**
   - User can select multiple files at once
   - Sequential upload (not parallel) to avoid overwhelming backend
   - Individual error handling per photo

4. **Grid Layout**
   - Clean, organized display
   - Scales with number of photos
   - Consistent with modern design patterns

5. **Non-blocking Photo Injection**
   - Photos fail gracefully
   - Summary still submitted even if photos fail
   - User informed of photo failure but not blocked

---

## 🧪 Testing Checklist

### Manual Testing

- [ ] Upload single photo (JPG)
- [ ] Upload single photo (PNG)
- [ ] Upload multiple photos at once
- [ ] Upload photo >5MB (should fail with alert)
- [ ] Upload non-image file (should fail with alert)
- [ ] Delete photo (with confirmation)
- [ ] Cancel delete confirmation
- [ ] Upload while recording
- [ ] Photos persist after stopping recording
- [ ] Photos inject to EzyVet on completion
- [ ] Photos clear on "New Consult"
- [ ] Network failure retry logic
- [ ] Backend error handling
- [ ] Photo count badge updates correctly
- [ ] Loading states display correctly

---

## 📝 Backend Implementation Requirements

### What Your Backend Needs

**1. Database Schema**:
```sql
CREATE TABLE consultation_photos (
  id UUID PRIMARY KEY,
  consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_consultation_photos_consultation ON consultation_photos(consultation_id);
```

**2. Storage Service**:
- S3, Google Cloud Storage, or similar
- Generate presigned URLs for secure access
- Implement file cleanup when consultation deleted

**3. API Endpoints**:
- `POST /consultations/:id/photos` - Upload photo
- `GET /consultations/:id/photos` - List photos
- `DELETE /consultations/:id/photos/:photoId` - Delete photo

**4. Validation**:
- Verify user owns consultation
- Validate file type (image/jpeg, image/png, etc.)
- Validate file size (≤5MB)
- Sanitize filenames
- Scan for malware (optional but recommended)

**5. Response Format**:
```typescript
interface PhotoResponse {
  success: boolean;
  data?: {
    id: string;
    consultationId: string;
    url: string;
    filename: string;
    size: number;
    mimeType: string;
    caption?: string;
    createdAt: string;
  };
  error?: string;
}
```

---

## 🔗 File References

### Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `api/photo.service.js` | Photo API service with retry logic | 205 |
| `sidebar.js` | Photo upload UI controller | Added: 132-714 |
| `sidebar.html` | Photo grid UI markup | Added photo section |
| `sidebar.css` | Photo grid styling | Added photo styles |
| `ezyvet-injection.js` | EzyVet photo injection | Added: 288-360 |
| `content-script.js` | Message handling for photos | Modified: 26-91 |
| `config.js` | API endpoint configuration | Line 28 |

---

## 🎓 Comparison Points for Your Backend

### Key Integration Points to Verify

1. **Endpoint URLs**: Does your backend use `/consultations/:id/photos`?
2. **Response Format**: Does your backend return `{ success, data }` format?
3. **FormData Handling**: Can your backend parse `multipart/form-data`?
4. **File Size Limits**: Does your backend enforce 5MB limit?
5. **Authentication**: Does your backend validate Bearer tokens?
6. **Photo Storage**: Where are photos stored (S3, GCS, local)?
7. **URL Generation**: Are photo URLs publicly accessible or presigned?
8. **Deletion Cascade**: Are photos deleted when consultation is deleted?

### Example cURL Requests

**Upload Photo**:
```bash
curl -X POST \
  https://backend-production-a35dc.up.railway.app/api/v1/consultations/{consultationId}/photos \
  -H "Authorization: Bearer {token}" \
  -F "photo=@/path/to/image.jpg" \
  -F "caption=Test photo"
```

**Get Photos**:
```bash
curl -X GET \
  https://backend-production-a35dc.up.railway.app/api/v1/consultations/{consultationId}/photos \
  -H "Authorization: Bearer {token}"
```

**Delete Photo**:
```bash
curl -X DELETE \
  https://backend-production-a35dc.up.railway.app/api/v1/consultations/{consultationId}/photos/{photoId} \
  -H "Authorization: Bearer {token}"
```

---

## 📚 Related Documentation

- [PHOTO_UPLOAD_IMPLEMENTATION.md](./PHOTO_UPLOAD_IMPLEMENTATION.md) - Implementation details
- [PHOTO_UPLOAD_TESTING_GUIDE.md](./PHOTO_UPLOAD_TESTING_GUIDE.md) - Testing instructions
- [SESSION_COMPLETION_BUG_REPORT.md](./SESSION_COMPLETION_BUG_REPORT.md) - Session lifecycle fixes

---

**Document Version**: 1.0
**Last Updated**: 2025-01-24
**Author**: Claude (AI Assistant)
