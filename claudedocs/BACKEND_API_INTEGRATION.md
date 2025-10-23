# BrobyVets Backend API Integration Guide

## Summary Generation Flow

### Overview
The backend automatically generates AI summaries when a recording session is completed. The extension triggers this by calling the `completeSessionWithSummary` endpoint.

---

## API Endpoints

### Base URL
```
https://backend-production-a35dc.up.railway.app/api/v1
```

### Authentication
All requests require authentication token in header:
```
Authorization: Bearer <token>
```

---

## Recording Flow

### 1. Create Recording Session
**Endpoint**: `POST /recordings/sessions/new`

**Request**:
```json
{
  "consultationId": "uuid",
  "mode": "summary",
  "templateId": "optional-template-id"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "consultation_id": "consultation-uuid",
      "mode": "summary",
      "status": "active"
    },
    "recordingToken": "jwt-token-for-chunk-uploads"
  },
  "message": "Recording session created successfully"
}
```

**Implementation Status**: ✅ Already implemented in `api/recording.service.js`

---

### 2. Upload Audio Chunks
**Endpoint**: `POST /recordings/sessions/:id/chunks`

**Headers**:
```
Authorization: Bearer <recordingToken>
Content-Type: multipart/form-data
```

**Form Data**:
- `audio`: Audio file (Blob/File)
- `chunkNumber`: Integer
- `sequenceOrder`: Integer
- `duration`: Float (seconds)
- `fileSize`: Integer (bytes)

**Response**:
```json
{
  "success": true,
  "data": {
    "chunkId": "chunk-uuid",
    "uploaded": true
  }
}
```

**Implementation Status**: ✅ Already implemented in `recording/media-recorder.service.js`

---

### 3. Complete Session & Trigger Summary Generation
**Endpoint**: `POST /recordings/sessions/:id/complete`

**Headers**:
```
Authorization: Bearer <userToken>
```

**What it does**:
1. Stops the recording session
2. Fetches all audio chunks and transcriptions
3. Combines transcriptions into full transcript
4. Saves transcript to consultation
5. **Triggers AI summary generation** (async, runs in background)
6. Returns immediately (doesn't wait for summary)

**Response**:
```json
{
  "success": true,
  "data": {
    "sessionId": "session-uuid",
    "consultationId": "consultation-uuid",
    "transcriptGenerated": true,
    "transcriptLength": 1234,
    "summaryStarted": true
  },
  "message": "Session completed and summary generation started"
}
```

**Key Point**: Summary generation happens **asynchronously in the background**. The endpoint returns immediately, but the summary takes 10-30 seconds to generate.

**Implementation Status**: ❌ Need to add this call to extension

---

## Fetching the Generated Summary

### 4. Get Consultation with Summary
**Endpoint**: `GET /consultations/:consultationId`

**Headers**:
```
Authorization: Bearer <userToken>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "consultation-uuid",
    "patient_id": "patient-uuid",
    "patient_name": "Fluffy",
    "full_transcript": "Complete transcription text...",
    "ai_summary": "Generated AI summary...",
    "summary_status": "completed",
    "created_at": "2025-10-23T...",
    "updated_at": "2025-10-23T..."
  }
}
```

**Implementation Status**: ❌ Need to implement

---

### 5. Polling for Summary Completion
Since summary generation is async, you need to poll the consultation endpoint until `ai_summary` is populated.

**Polling Strategy**:
```javascript
async function pollForSummary(consultationId) {
  const maxAttempts = 30; // 30 seconds max
  const interval = 1000; // Poll every 1 second

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${API_BASE}/consultations/${consultationId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();

    if (data.data.ai_summary) {
      return data.data.ai_summary; // Summary ready!
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Summary generation timed out');
}
```

**Implementation Status**: ❌ Need to implement

---

## Extension Integration Plan

### Current State
✅ Recording UI states (idle, recording, processing)
✅ MediaRecorder with 15-second chunking
✅ Chunk upload to backend
✅ Recording session creation

### Missing Pieces
❌ Call `/recordings/sessions/:id/complete` when "Stop Consult" is clicked
❌ Show "Generating Summary..." state in UI
❌ Poll `/consultations/:id` for summary
❌ Display summary in sidebar when ready

---

## Implementation Steps

### Step 1: Add Complete Session Call
**File**: `recording/recording-manager.js`

Add method to complete session:
```javascript
async completeRecording() {
  const sessionId = this.currentSession.id;
  const consultationId = this.currentSession.consultationId;

  // Call complete endpoint
  const response = await fetch(
    `${CONFIG.API.BASE_URL}${CONFIG.API.ENDPOINTS.COMPLETE_RECORDING(sessionId)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    }
  );

  const result = await response.json();

  if (result.success && result.data.summaryStarted) {
    // Summary generation started
    return { consultationId, summaryStarted: true };
  }

  throw new Error('Failed to complete recording');
}
```

### Step 2: Add Consultation Service
**File**: `api/consultation.service.js` (already exists)

Add methods:
```javascript
async getConsultation(consultationId) {
  const response = await this.apiClient.get(`/consultations/${consultationId}`);
  return response.data;
}

async pollForSummary(consultationId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const consultation = await this.getConsultation(consultationId);

    if (consultation.ai_summary) {
      return consultation.ai_summary;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Summary generation timed out');
}
```

### Step 3: Update Sidebar UI
**File**: `sidebar.js`

Add summary display section to HTML:
```html
<!-- Add after recording controls -->
<div id="summarySection" style="display: none;">
  <h3>AI Summary</h3>
  <div id="summaryStatus">Generating summary...</div>
  <div id="summaryContent" style="display: none;"></div>
</div>
```

Update `stopRecording` method:
```javascript
async stopRecording() {
  // ... existing stop logic ...

  // Complete the recording
  this.updateStatus('Completing recording...');
  const result = await this.recordingManager.completeRecording();

  if (result.summaryStarted) {
    // Show summary section
    document.getElementById('summarySection').style.display = 'block';
    document.getElementById('summaryStatus').textContent = 'Generating AI summary...';

    // Poll for summary
    try {
      const summary = await this.consultationService.pollForSummary(
        result.consultationId
      );

      // Display summary
      document.getElementById('summaryStatus').style.display = 'none';
      document.getElementById('summaryContent').style.display = 'block';
      document.getElementById('summaryContent').innerHTML = formatSummary(summary);

    } catch (error) {
      document.getElementById('summaryStatus').textContent =
        'Failed to generate summary. Please try again.';
    }
  }
}

function formatSummary(summary) {
  // Format the markdown summary for display
  return summary.replace(/\n/g, '<br>');
}
```

### Step 4: Update Config
**File**: `config.js`

Already has:
```javascript
COMPLETE_RECORDING: (sessionId) => `/recordings/sessions/${sessionId}/complete`
```

Add consultation endpoints:
```javascript
GET_CONSULTATION: (consultationId) => `/consultations/${consultationId}`,
GET_SUMMARY: (consultationId) => `/consultations/${consultationId}/summary`
```

---

## Summary Display UI Design

### Suggested Layout
```
┌─────────────────────────────────┐
│ Recording Controls              │
│ [Stop Consult] [Pause]          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ AI Summary                      │
│ ╔═══════════════════════════╗   │
│ ║ Generating summary...     ║   │
│ ║ [Loading spinner]         ║   │
│ ╚═══════════════════════════╝   │
└─────────────────────────────────┘

After generation:

┌─────────────────────────────────┐
│ AI Summary                      │
│ ╔═══════════════════════════╗   │
│ ║ Chief Complaint:          ║   │
│ ║ - Limping on right leg    ║   │
│ ║                           ║   │
│ ║ Physical Exam:            ║   │
│ ║ - Swelling in right knee  ║   │
│ ║ - Pain on palpation       ║   │
│ ║                           ║   │
│ ║ Diagnosis:                ║   │
│ ║ - Suspected ACL injury    ║   │
│ ║                           ║   │
│ ║ Plan:                     ║   │
│ ║ - X-rays recommended      ║   │
│ ║ - Pain medication         ║   │
│ ║ - Follow up in 1 week     ║   │
│ ╚═══════════════════════════╝   │
│                                 │
│ [Copy Summary] [Edit]           │
└─────────────────────────────────┘
```

---

## Error Handling

### Common Errors
1. **No transcript generated**: Recording was too short or transcription failed
2. **Summary generation timeout**: OpenAI API took too long
3. **Authentication failure**: Token expired during long recording
4. **Network issues**: Connection lost during polling

### Error Messages
```javascript
const ERROR_MESSAGES = {
  NO_TRANSCRIPT: 'No audio was captured. Please try recording again.',
  TIMEOUT: 'Summary generation is taking longer than expected. You can check back later in the consultation history.',
  AUTH_FAILED: 'Your session has expired. Please refresh and try again.',
  NETWORK_ERROR: 'Network connection lost. Summary may still be generating.'
};
```

---

## Testing Checklist

- [ ] Record a short consultation (30 seconds)
- [ ] Verify chunks upload successfully
- [ ] Click "Stop Consult"
- [ ] Verify `/complete` endpoint is called
- [ ] Verify "Generating summary..." message appears
- [ ] Wait for summary to populate
- [ ] Verify summary displays correctly
- [ ] Test timeout scenario (30+ seconds)
- [ ] Test error handling (network disconnection)

---

## Performance Considerations

### Summary Generation Time
- Short consultation (1-2 min): ~5-10 seconds
- Medium consultation (5-10 min): ~10-20 seconds
- Long consultation (15+ min): ~20-30 seconds

### Optimization Tips
1. Show estimated time based on recording duration
2. Allow user to close sidebar while summary generates
3. Send browser notification when summary is ready
4. Cache consultation data to avoid re-fetching

---

## Next Steps

1. ✅ Complete session endpoint call
2. ✅ Polling mechanism
3. ✅ Summary display UI
4. ✅ Error handling
5. ✅ User feedback (loading states)
6. ✅ Testing with real recordings
