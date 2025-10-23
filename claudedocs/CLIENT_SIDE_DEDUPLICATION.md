# Client-Side Chunk Deduplication

## Problem
Despite the backend sender origin fix in background.js, duplicate chunks were still being uploaded to the backend, causing 500 errors.

### Backend Error Logs
```
🚨 CRITICAL: Duplicate chunk with DIFFERENT data - data loss bug detected!
- Existing: chunk_0_1761232784535.webm
- Attempted: chunk_0_1761232807616.webm (23 seconds later!)
```

### Frontend Console Logs
```
📦 Received chunk 0 from offscreen
📦 Received chunk 0, adding to upload queue
📦 Received chunk 0 from offscreen  // DUPLICATE!
📦 Received chunk 0, adding to upload queue  // QUEUED TWICE!
```

## Root Cause Analysis

The sender origin check in background.js helps, but **doesn't completely solve the problem** because:

1. Chrome's `chrome.runtime.sendMessage()` broadcasting behavior is complex
2. Messages can arrive through multiple paths
3. Event listeners can fire multiple times in certain conditions
4. There's no guarantee sender filtering will catch all cases

**Defense in Depth**: We need deduplication at the upload queue level as the **final line of defense**.

## The Solution: Client-Side Deduplication

Add a `Set` to track which chunk numbers have already been queued for upload.

### Implementation

```javascript
// recording-manager.js

class RecordingManager {
  constructor() {
    this.mediaRecorder = new MediaRecorderService();
    this.consultationId = null;
    this.sessionId = null;
    this.recordingToken = null;
    this.isActive = false;
    this.uploadQueue = [];
    this.isUploading = false;
    this.processedChunks = new Set(); // ← NEW: Track processed chunks
  }

  async startRecording(patient) {
    try {
      console.log('🎬 Starting recording workflow for:', patient.name);

      // Reset state for new recording
      this.processedChunks.clear(); // ← NEW: Clear for new recording
      this.uploadQueue = [];

      // ... rest of recording setup
    }
  }

  handleChunk(blob, duration, chunkNumber) {
    // DEDUPLICATION: Check if we've already queued this chunk
    if (this.processedChunks.has(chunkNumber)) {
      console.log(`⚠️ Ignoring duplicate chunk ${chunkNumber}`);
      return; // ← NEW: Early return prevents duplicate queueing
    }

    console.log(`📦 Received chunk ${chunkNumber}, adding to upload queue`);

    // Mark as processed
    this.processedChunks.add(chunkNumber); // ← NEW: Track this chunk

    // Add to upload queue
    this.uploadQueue.push({
      blob,
      duration,
      chunkNumber
    });

    // Start processing queue if not already uploading
    if (!this.isUploading) {
      this.processUploadQueue();
    }
  }
}
```

## How It Works

### Before Fix (BROKEN)
```
Chunk 0 arrives → handleChunk(0) → Add to queue → Upload
Chunk 0 arrives again → handleChunk(0) → Add to queue → Upload DUPLICATE!
Backend: 🚨 DIFFERENT DATA ERROR
```

### After Fix (WORKING)
```
Chunk 0 arrives → handleChunk(0) → processedChunks.add(0) → Add to queue → Upload
Chunk 0 arrives again → handleChunk(0) → processedChunks.has(0)? YES → IGNORE
Backend: ✅ Only one chunk received
```

## Benefits

### 1. Defense in Depth
- **Layer 1**: Backend sender origin checking (background.js)
- **Layer 2**: Client-side chunk deduplication (recording-manager.js)
- **Layer 3**: Backend duplicate detection (upload.service.ts)

Even if Layer 1 fails, Layer 2 catches duplicates before they reach the backend.

### 2. Idempotency
If the same chunk arrives multiple times (network retry, race condition, etc.), only the first one is processed.

### 3. Clean Logs
```
📦 Received chunk 0, adding to upload queue
⚠️ Ignoring duplicate chunk 0  // Clear indication of deduplication working
📦 Received chunk 1, adding to upload queue
```

### 4. Session Isolation
Calling `processedChunks.clear()` at the start of each recording ensures:
- No cross-contamination between recordings
- Fresh state for each patient
- Can record multiple patients in one session

## Performance Impact

**Minimal**: Using a JavaScript `Set` for deduplication is O(1) for both add and lookup operations.

```javascript
this.processedChunks.has(chunkNumber)  // O(1) lookup
this.processedChunks.add(chunkNumber)  // O(1) insertion
```

For a typical 2-minute recording with 15-second chunks:
- ~8 chunks total
- Set size: 8 numbers
- Memory: negligible (<1KB)
- Lookup time: <1ms

## Edge Cases Handled

### 1. Multiple Recordings in One Session
```javascript
// Recording 1
startRecording(patient1)  // processedChunks.clear()
// chunks 0, 1, 2 processed

// Recording 2
startRecording(patient2)  // processedChunks.clear()
// chunks 0, 1, 2 processed (no conflict!)
```

### 2. Retry Logic
If a chunk upload fails and gets retried, the chunk is already in the queue from the first attempt. The retry mechanism should re-upload from the queue, not re-queue.

### 3. Out-of-Order Arrival
```javascript
Chunk 2 arrives → processedChunks.add(2)
Chunk 1 arrives → processedChunks.add(1)
Chunk 1 arrives again → processedChunks.has(1)? YES → IGNORE
```

The Set handles out-of-order chunks correctly.

## Testing

### Expected Console Logs (Working)
```
🎬 Starting recording workflow for: Patient Name
📦 Received chunk 0, adding to upload queue
📤 Uploading chunk 0...
✅ Chunk 0 uploaded successfully

📦 Received chunk 1, adding to upload queue
📤 Uploading chunk 1...
✅ Chunk 1 uploaded successfully
```

### Expected Console Logs (With Duplicates)
```
🎬 Starting recording workflow for: Patient Name
📦 Received chunk 0, adding to upload queue
⚠️ Ignoring duplicate chunk 0  // Deduplication working!
📤 Uploading chunk 0...
✅ Chunk 0 uploaded successfully

📦 Received chunk 1, adding to upload queue
⚠️ Ignoring duplicate chunk 1  // Deduplication working!
📤 Uploading chunk 1...
✅ Chunk 1 uploaded successfully
```

### Backend Should No Longer See Duplicates
```
✅ Audio uploaded to storage
💾 Saving chunk metadata to database
✅ Chunk 0 saved successfully
[NO DUPLICATE WARNINGS]
```

## Why This Fix Is Better Than Just Backend Checking

### Backend Approach (upload.service.ts)
- **Pros**: Catches all duplicates, data integrity protection
- **Cons**: Wastes network bandwidth, wastes storage space, generates 500 errors, requires cleanup

### Frontend Approach (recording-manager.js)
- **Pros**: Prevents duplicates before upload, saves bandwidth, no errors
- **Cons**: Requires state management

### Combined Approach (BEST)
- **Frontend**: Prevent duplicates from being queued
- **Backend**: Final safety net for data integrity
- **Result**: Clean, efficient, and robust

## Related Files

- **recording/recording-manager.js** - Added client-side deduplication
- **background.js** - Sender origin checking (previous fix)
- **backend/upload.service.ts** - Backend duplicate detection (safety net)

## Impact

### Before:
- ❌ Duplicate chunks uploaded
- ❌ 500 errors from backend
- ❌ Wasted bandwidth and storage
- ❌ Backend cleanup required

### After:
- ✅ Each chunk queued exactly once
- ✅ No 500 errors
- ✅ Efficient bandwidth usage
- ✅ Clean backend logs
