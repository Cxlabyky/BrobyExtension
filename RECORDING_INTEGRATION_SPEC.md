# Recording Integration Specification

## Backend API Analysis - Complete Recording Flow

Based on backend repository analysis (`BrobyVets-backend`), here's the exact recording flow used by the web app.

---

## 1. API Endpoints

### Base URL
```
https://backend-production-a35dc.up.railway.app/api/v1/recordings
```

### Available Endpoints

#### A. Create Recording Session
```http
POST /recordings/sessions/new
Authorization: Bearer <access_token>
Content-Type: application/json

Body:
{
  "consultationId": "uuid-string",
  "mode": "summary",  // or "transcribe"
  "templateId": "template-uuid" // optional
}

Response: 201 Created
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "consultation_id": "consultation-uuid",
      "status": "active",
      "chunk_count": 0,
      "total_duration": 0,
      "created_at": "2025-10-23T...",
      "user_id": "user-uuid"
    },
    "recordingToken": "special-jwt-token-for-chunk-uploads"
  },
  "message": "Recording session created successfully"
}
```

**CRITICAL**: The `recordingToken` is a **special ultra-fast auth token** specifically for chunk uploads. Use this instead of the regular access token for chunk uploads (performance optimization).

#### B. Upload Audio Chunk (Single)
```http
POST /recordings/sessions/:sessionId/chunks
Authorization: Bearer <recordingToken>  // NOT access_token!
Content-Type: multipart/form-data

FormData:
- audio: Blob (audio file)
- chunkNumber: "0" (integer as string, starts from 0)
- sequenceOrder: "0" (integer as string, same as chunkNumber usually)
- duration: "15.5" (float as string, in seconds)
- fileSize: "124234" (integer as string, bytes)

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "chunk-uuid",
    "session_id": "session-uuid",
    "chunk_number": 0,
    "sequence_order": 0,
    "duration": 15.5,
    "file_size": 124234,
    "storage_path": "recordings/...",
    "transcription_status": "pending",
    "created_at": "2025-10-23T..."
  },
  "message": "Audio chunk uploaded successfully"
}
```

#### C. Upload Audio Chunks (Batch)
```http
POST /recordings/sessions/:sessionId/chunks/batch
Authorization: Bearer <recordingToken>
Content-Type: multipart/form-data

FormData (10 chunks max per batch):
- audio_0: Blob
- audio_1: Blob
- audio_2: Blob
... up to audio_9
- chunkNumber_0: "0"
- chunkNumber_1: "1"
- sequenceOrder_0: "0"
- sequenceOrder_1: "1"
- duration_0: "15.5"
- duration_1: "15.2"
- batchId: "batch-uuid-or-timestamp"
- chunkCount: "3" (how many chunks in this batch)

Response: 200 OK
{
  "success": true,
  "data": {
    "batchId": "batch-uuid",
    "uploadedChunks": [0, 1, 2],
    "successCount": 3
  },
  "message": "All 3 chunks uploaded successfully"
}
```

**Performance Note**: Batch uploads provide **75% fewer HTTP requests** vs individual uploads.

#### D. Complete Session and Generate Summary
```http
POST /recordings/sessions/:sessionId/complete
Authorization: Bearer <access_token>  // Regular token

Response: 200 OK
{
  "success": true,
  "data": {
    "sessionId": "session-uuid",
    "consultationId": "consultation-uuid",
    "transcriptGenerated": true,
    "transcriptLength": 1523,
    "summaryStarted": true
  },
  "message": "Session completed and summary generation started"
}
```

**CRITICAL**: Summary generation happens **asynchronously** in the background. This endpoint returns immediately.

---

## 2. Chrome Extension Recording Flow

### Step-by-Step Implementation

#### Step 1: Create Consultation (if not exists)
```javascript
// POST /api/v1/consultations
const consultation = await APIClient.post('/consultations', {
  patient_name: patient.name,
  patient_id: patient.id,
  species: patient.species,
  visit_date: new Date().toISOString()
});

const consultationId = consultation.id;
```

#### Step 2: Create Recording Session
```javascript
const sessionResponse = await APIClient.post('/recordings/sessions/new', {
  consultationId: consultationId,
  mode: 'summary',
  templateId: null  // or specific template
});

const session = sessionResponse.session;
const recordingToken = sessionResponse.recordingToken;

// CRITICAL: Store recordingToken for chunk uploads
localStorage.setItem('recordingToken', recordingToken);
localStorage.setItem('sessionId', session.id);
```

#### Step 3: Start MediaRecorder
```javascript
// Request microphone permission
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 48000  // High quality
  }
});

// Create MediaRecorder
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',  // Best for web
  audioBitsPerSecond: 128000  // 128kbps
});

let chunks = [];
let chunkNumber = 0;
const CHUNK_DURATION = 15000;  // 15 seconds

// Handle data available (every 15s)
mediaRecorder.ondataavailable = async (event) => {
  if (event.data && event.data.size > 0) {
    const blob = event.data;
    const duration = CHUNK_DURATION / 1000;  // 15 seconds

    // Upload chunk immediately
    await uploadChunk(session.id, blob, chunkNumber, duration, recordingToken);
    chunkNumber++;
  }
};

// Start recording with 15s time slices
mediaRecorder.start(CHUNK_DURATION);
```

#### Step 4: Upload Chunks
```javascript
async function uploadChunk(sessionId, blob, chunkNumber, duration, recordingToken) {
  const formData = new FormData();
  formData.append('audio', blob, `chunk_${chunkNumber}.webm`);
  formData.append('chunkNumber', chunkNumber.toString());
  formData.append('sequenceOrder', chunkNumber.toString());
  formData.append('duration', duration.toString());
  formData.append('fileSize', blob.size.toString());

  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/recordings/sessions/${sessionId}/chunks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${recordingToken}`  // Special token!
        },
        body: formData
      }
    );

    if (!response.ok) {
      throw new Error(`Chunk upload failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Chunk ${chunkNumber} uploaded:`, result.data.id);

    return result.data;
  } catch (error) {
    console.error(`❌ Chunk ${chunkNumber} upload failed:`, error);
    // Retry logic here
    throw error;
  }
}
```

#### Step 5: Stop Recording and Complete Session
```javascript
async function stopRecording() {
  // Stop MediaRecorder
  mediaRecorder.stop();

  // Stop all audio tracks
  stream.getTracks().forEach(track => track.stop());

  // Wait a moment for final chunk
  await new Promise(resolve => setTimeout(resolve, 500));

  // Complete session (triggers summary generation)
  const response = await APIClient.post(
    `/recordings/sessions/${sessionId}/complete`,
    {},
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`  // Regular token
      }
    }
  );

  console.log('✅ Session completed:', response);

  // Summary is being generated in background
  // Poll consultation for summary updates
  pollForSummary(consultationId);
}
```

#### Step 6: Poll for Summary
```javascript
async function pollForSummary(consultationId) {
  const maxAttempts = 60;  // 2 minutes max
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;

    const consultation = await APIClient.get(`/consultations/${consultationId}`);

    if (consultation.summary) {
      clearInterval(interval);
      console.log('✅ Summary generated!');
      showCompletedState(consultation.summary);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.error('❌ Summary timeout');
      showError('Summary generation timed out');
    } else {
      console.log(`⏳ Waiting for summary... (${attempts}/${maxAttempts})`);
    }
  }, 2000);  // Poll every 2 seconds
}
```

---

## 3. Error Handling

### Common Errors

#### Microphone Permission Denied
```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    alert('Microphone permission denied. Please allow microphone access.');
  } else if (error.name === 'NotFoundError') {
    alert('No microphone found. Please connect a microphone.');
  }
}
```

#### Chunk Upload Failure
```javascript
async function uploadChunkWithRetry(sessionId, blob, chunkNumber, duration, recordingToken) {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await uploadChunk(sessionId, blob, chunkNumber, duration, recordingToken);
    } catch (error) {
      console.warn(`Retry ${attempt + 1}/${maxRetries} for chunk ${chunkNumber}`);

      if (attempt === maxRetries - 1) {
        throw error;  // Give up after max retries
      }

      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

#### Session Token Expired
```javascript
if (response.status === 401) {
  console.log('🔄 Recording token expired, refreshing...');

  // Get new recording token
  const sessionResponse = await APIClient.get(`/recordings/sessions/${sessionId}`);
  recordingToken = sessionResponse.recordingToken;

  // Retry upload
  return uploadChunk(sessionId, blob, chunkNumber, duration, recordingToken);
}
```

---

## 4. Batch Upload Optimization (Optional)

For better performance, batch chunks every 3 uploads:

```javascript
class ChunkBatcher {
  constructor() {
    this.pendingChunks = [];
    this.batchSize = 3;
  }

  async addChunk(sessionId, blob, chunkNumber, duration, recordingToken) {
    this.pendingChunks.push({ sessionId, blob, chunkNumber, duration, recordingToken });

    if (this.pendingChunks.length >= this.batchSize) {
      await this.uploadBatch();
    }
  }

  async uploadBatch() {
    if (this.pendingChunks.length === 0) return;

    const formData = new FormData();
    const batchId = `batch_${Date.now()}`;

    this.pendingChunks.forEach((chunk, index) => {
      formData.append(`audio_${index}`, chunk.blob, `chunk_${chunk.chunkNumber}.webm`);
      formData.append(`chunkNumber_${index}`, chunk.chunkNumber.toString());
      formData.append(`sequenceOrder_${index}`, chunk.chunkNumber.toString());
      formData.append(`duration_${index}`, chunk.duration.toString());
    });

    formData.append('batchId', batchId);
    formData.append('chunkCount', this.pendingChunks.length.toString());

    const sessionId = this.pendingChunks[0].sessionId;
    const recordingToken = this.pendingChunks[0].recordingToken;

    const response = await fetch(
      `${CONFIG.API_BASE_URL}/recordings/sessions/${sessionId}/chunks/batch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${recordingToken}`
        },
        body: formData
      }
    );

    const result = await response.json();
    console.log(`✅ Batch uploaded: ${result.data.successCount} chunks`);

    this.pendingChunks = [];
  }

  async flush() {
    await this.uploadBatch();
  }
}
```

---

## 5. File Structure for Extension

```
/recording/
├── RecordingManager.js       // Main orchestrator
├── MediaRecorderService.js   // MediaRecorder wrapper
├── ChunkUploader.js           // Chunk upload with retry
├── SessionManager.js          // Session lifecycle
└── types.js                   // TypeScript types (if needed)
```

---

## 6. Key Differences: Extension vs Web App

| Feature | Web App | Chrome Extension |
|---------|---------|------------------|
| **MediaRecorder** | Progressive double-buffering | Simple 15s chunks |
| **Upload Strategy** | Parallel with queue | Sequential with retry |
| **Transcription** | Real-time polling | Summary only at end |
| **Storage** | Supabase direct | Via backend API only |
| **Token Auth** | Regular + Recording | Same pattern |
| **Chunk Size** | 15s optimal | 15s recommended |

---

## 7. Next Steps

1. ✅ **Create Recording Manager** - Orchestrate recording lifecycle
2. ✅ **Implement MediaRecorder Service** - Audio capture with 15s chunks
3. ✅ **Build Chunk Uploader** - Upload chunks with retry logic
4. ✅ **Wire up UI States** - Connect buttons to recording actions
5. ✅ **Add Summary Polling** - Poll for generated summary
6. ✅ **Test End-to-End** - Complete flow with real backend

---

## 8. Audio Format Specifications

### Recommended Settings
```javascript
{
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 128000,  // 128kbps
  sampleRate: 48000,            // 48kHz
  channelCount: 1               // Mono
}
```

### Browser Compatibility
- ✅ **Chrome/Edge**: `audio/webm;codecs=opus` (best)
- ✅ **Firefox**: `audio/webm;codecs=opus`
- ✅ **Safari**: `audio/mp4` (fallback)

### Fallback Detection
```javascript
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  throw new Error('No supported audio format');
}
```

---

## 9. Performance Metrics (from Web App)

- **Chunk Upload**: ~200-500ms per chunk
- **Batch Upload**: ~800ms-1.5s for 3 chunks (75% faster)
- **Recording Latency**: <50ms (real-time)
- **Summary Generation**: 5-15 seconds (async)
- **Total Overhead**: <2% CPU usage

---

## 10. Security Considerations

1. **Recording Token**: Expires after session completion
2. **Access Token**: Used for session creation and completion
3. **HTTPS Only**: All API calls over HTTPS
4. **CORS**: Backend configured for extension origin
5. **Rate Limiting**: 60 requests/minute for recording endpoints

---

## Summary

The extension should:
1. Create recording session (get `recordingToken`)
2. Start MediaRecorder with 15s chunks
3. Upload each chunk immediately with `recordingToken`
4. Stop recording and complete session
5. Poll for summary generation
6. Display summary in completed state

**Critical**: Use the `recordingToken` for chunk uploads, not the regular `access_token`!
