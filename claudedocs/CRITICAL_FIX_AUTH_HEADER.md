# CRITICAL FIX: Recording Token Authentication Header

## Problem Discovered
Extension was receiving 401 Unauthorized errors when uploading audio chunks, despite having a valid recording token.

## Root Cause
**Header Mismatch:**
- Extension was sending: `Authorization: Bearer ${recordingToken}`
- Backend expects: `x-recording-token: ${recordingToken}`

## Backend Authentication Flow

### Recording Token Creation
Location: `/tmp/brobyvets-backend/backend/src/services/session-token.service.ts`

```typescript
static createRecordingToken(userId: string, recordingSessionId: string): string {
  const token = 'rec_' + crypto.randomBytes(24).toString('hex');
  // Token lasts 4 hours for long recordings
  const expiresAt = now + (4 * 60 * 60 * 1000);
  // ...
}
```

### Recording Token Validation
Location: `/tmp/brobyvets-backend/backend/src/middleware/ultra-fast-session.middleware.ts`

```typescript
export const authenticateRecording = async (req, res, next) => {
  // Backend looks for 'x-recording-token' header
  const recordingToken = req.headers['x-recording-token'] as string;

  if (recordingToken && recordingToken.startsWith('rec_')) {
    const sessionData = SessionTokenService.verifyToken(recordingToken);

    if (sessionData && sessionData.isRecording) {
      req.user = {
        id: sessionData.userId,
        userId: sessionData.userId,
        email: sessionData.email,
        recordingSessionId: sessionData.recordingSessionId
      };
      return next();
    }
  }

  // If no valid recording token, returns 401
}
```

### Route Configuration
Location: `/tmp/brobyvets-backend/backend/src/modules/recordings/routes/recording.routes.ts`

```typescript
router.post('/sessions/:id/chunks',
  authenticateRecordingUltraFast, // Uses x-recording-token header
  upload.single('audio'),
  recordingController.uploadChunk
);
```

## The Fix

### Before (❌ WRONG)
```javascript
// api/recording.service.js:90
headers: {
  'Authorization': `Bearer ${recordingToken}`  // Backend doesn't check this!
}
```

### After (✅ CORRECT)
```javascript
// api/recording.service.js:90
headers: {
  'x-recording-token': recordingToken  // Backend expects this exact header
}
```

## Why This Matters

### Authentication Flow:
1. Extension creates recording session → Backend returns `recording_token`
2. Extension receives audio chunk from MediaRecorder
3. Extension uploads chunk with `x-recording-token` header
4. Backend validates token (0.1ms, no database call)
5. Backend accepts chunk and saves to storage

### Previous Flow (BROKEN):
```
Extension: Authorization: Bearer rec_abc123...
Backend: Looking for x-recording-token header... not found
Backend: Checking Authorization header... not a JWT token
Backend: ❌ 401 Unauthorized
```

### Current Flow (FIXED):
```
Extension: x-recording-token: rec_abc123...
Backend: Found x-recording-token header
Backend: Token starts with 'rec_' ✓
Backend: Token is valid and not expired ✓
Backend: ✅ 200 OK - Chunk uploaded
```

## Impact

### Before Fix:
- ❌ All chunk uploads failed with 401
- ❌ No audio data saved
- ❌ No transcription possible
- ❌ No summary generation

### After Fix:
- ✅ Chunks upload successfully
- ✅ Audio data saved to storage
- ✅ Whisper transcription processes audio
- ✅ AI summary generation works

## Testing

### Expected Console Logs (After Fix):
```
🎬 Starting recording workflow for: [Patient Name]
📝 Step 1: Creating consultation...
✅ Consultation created: [consultation-id]
🎤 Step 2: Creating recording session...
✅ Recording session created: [session-id]
🔑 Recording token received
🎙️ Step 3: Starting MediaRecorder...
✅ Recording started successfully!

[Every 15 seconds]
📦 Received chunk 0, adding to upload queue
📤 Uploading chunk 0...
✅ Chunk 0 uploaded successfully  ← THIS NOW WORKS!

[After stopping]
🛑 Stopping recording...
⏳ Waiting for all uploads to complete...
✅ All chunks uploaded
🎯 Completing session...
✅ Session completed, summary generation started
```

### Expected Railway Backend Logs:
```
🎙️ Recording Auth: Token validated (0.1ms)
✅ Chunk 0 uploaded successfully
🎙️ Recording Auth: Token validated (0.1ms)
✅ Chunk 1 uploaded successfully
🎯 MOBILE COMPLETE: Session completion request
✅ MOBILE_DEBUG: Session stopped successfully
🤖 Generating AI summary
✅ Summary generated successfully
```

## Web App vs Extension

### Why Web App Worked:
The web app likely uses a different authentication method OR correctly uses `x-recording-token` header.

### Why Extension Failed:
Extension was using standard JWT Bearer token format instead of the specialized recording token header.

## Related Files

- **api/recording.service.js** - Fixed chunk upload header
- **backend/src/middleware/ultra-fast-session.middleware.ts** - Token validation logic
- **backend/src/routes/recording.routes.ts** - Route configuration
- **backend/src/services/session-token.service.ts** - Token generation

## Next Steps

1. ✅ Test with extension reload
2. ✅ Record 15-30 seconds of audio
3. ✅ Verify chunks upload successfully (no 401 errors)
4. ✅ Verify transcription completes
5. ✅ Verify summary generates and displays
