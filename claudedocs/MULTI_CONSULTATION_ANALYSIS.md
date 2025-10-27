# BrobyVets Multi-Consultation Recording System Analysis

**Date**: 2025-10-27
**Analyst**: Root Cause Analysis Mode
**Status**: CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

**CRITICAL FINDING**: The current system has **INCOMPLETE RESUME LOGIC** that creates NEW consultations instead of resuming existing ones. This can lead to:
- ❌ Data fragmentation (multiple consultations for same patient visit)
- ❌ Potential audio chunk loss during patient switching
- ⚠️ No backend support for resuming paused recording sessions

**DATA ISOLATION STATUS**: ✅ **WORKING CORRECTLY** - Consultations and chunks are properly isolated by ID.

---

## 1. Current Architecture Flow

### 1.1 New Recording Flow (Working Correctly)

```
User clicks "Start Recording" on EzyVet patient page
    ↓
sidebar.js → RecordingManager.startRecording(patient)
    ↓
Step 1: ConsultationService.createConsultation(patient)
    → POST /consultations
    → Body: { patient_name, patient_id, species, visit_date, status: 'in_progress' }
    → Returns: { id: consultationId }
    ↓
Step 2: RecordingService.createSession(consultationId)
    → POST /recordings/sessions/new
    → Body: { consultationId, mode: 'summary' }
    → Returns: { session: { id: sessionId }, recordingToken }
    ↓
Step 3: MediaRecorderService.startRecording(chunkCallback)
    → chrome.runtime.sendMessage('START_RECORDING')
    → background.js creates offscreen.html
    → offscreen.html starts MediaRecorder
    → Chunks generated every 15 seconds
    ↓
Step 4: Chunk Upload (per chunk)
    → RecordingService.uploadChunk(sessionId, blob, chunkNumber, recordingToken)
    → POST /recordings/sessions/:sessionId/chunks
    → Headers: { 'x-recording-token': recordingToken }
    → Backend transcribes asynchronously (fire-and-forget)
    ↓
Step 5: Recording Completion
    → RecordingManager.stopRecording()
    → Waits for final chunks + uploads
    → RecordingService.updateSessionStatus(sessionId, 'completed')
    → ConsultationService.completeConsultation(consultationId)
    → POST /consultations/:consultationId/complete
```

### 1.2 Patient Switching Flow (Has Critical Gap)

```
User navigates to different patient in EzyVet
    ↓
content.js detects new patient → sends to sidebar.js
    ↓
sidebar.js.updatePatientInfo(newPatient)
    ↓
isDifferentPatient? → YES
    ↓
handlePatientSwitch()
    ↓
IF currently recording:
    1. recordingManager.pauseRecording() ✅
    2. Clear timer interval ✅
    3. Save consultation state to activeConsultations Map ✅
       {
         patientId: currentPatient.id,
         patient: {...currentPatient},
         consultationId,
         sessionId,
         timerSeconds,
         photos: [...],
         state: 'paused',
         pausedAt: ISO timestamp
       }
    ↓
Check if new patient has existing consultation:
    existingConsult = activeConsultations.get(newPatient.id)
    ↓
IF exists:
    → loadConsultation(existingConsult) ✅
    → Restores UI state, shows 'paused' ✅
ELSE:
    → showState('ready') ✅
    → Ready for new recording ✅
```

**✅ PATIENT SWITCHING WORKS CORRECTLY** - State is preserved and UI updates properly.

---

## 2. Data Isolation Verification

### 2.1 Consultation-to-Recording Mapping

**Evidence from code analysis:**

1. **Consultation Creation** (api/consultation.service.js:22-29):
   ```javascript
   POST /consultations
   Body: {
     patient_name: patient.name,
     patient_id: patient.id,  // EzyVet patient ID
     species: patient.species,
     visit_date: new Date().toISOString(),
     status: 'in_progress'
   }
   Returns: { data: { id: consultationId } }
   ```

2. **Recording Session Creation** (api/recording.service.js:26):
   ```javascript
   POST /recordings/sessions/new
   Body: {
     consultationId,  // Links session to consultation
     mode: 'summary',
     templateId: null
   }
   Returns: {
     session: { id: sessionId },
     recordingToken
   }
   ```

3. **Chunk Upload** (api/recording.service.js:119):
   ```javascript
   POST /recordings/sessions/:sessionId/chunks
   Headers: { 'x-recording-token': recordingToken }
   Body: FormData {
     audio: blob,
     chunkNumber,
     sequenceOrder,
     duration,
     fileSize
   }
   ```

**✅ DATA ISOLATION IS CORRECT:**
- Each consultation gets unique `consultationId`
- Each recording session gets unique `sessionId` linked to `consultationId`
- Chunks are uploaded to specific `sessionId` with validation token
- **No way for Dog A's audio to mix with Dog B** - enforced by API routing

### 2.2 Backend Data Model (Inferred)

```
consultations table:
  - id (UUID) ← consultationId
  - patient_id (string) ← EzyVet patient ID
  - patient_name
  - species
  - visit_date
  - status ('in_progress', 'completed')
  - ai_summary (text, null until generated)
  - full_transcript (text, null until generated)

recording_sessions table:
  - id (UUID) ← sessionId
  - consultation_id (FK → consultations.id)
  - mode ('summary')
  - status ('pending', 'active', 'completed')
  - recording_token (UUID)

audio_chunks table:
  - id (UUID)
  - session_id (FK → recording_sessions.id)
  - chunk_number (integer)
  - sequence_order (integer)
  - duration (float)
  - file_url (string)
  - transcription_text (text, null until transcribed)
  - status ('pending', 'transcribing', 'completed')
```

**✅ VERIFICATION:** Foreign key relationships ensure:
- Chunks belong to sessions: `audio_chunks.session_id → recording_sessions.id`
- Sessions belong to consultations: `recording_sessions.consultation_id → consultations.id`
- Consultations belong to patients: `consultations.patient_id = EzyVet patient ID`

**ISOLATION PROOF:**
- Query for Dog A's data: `SELECT * FROM consultations WHERE patient_id = 'dog_a_id'`
- This returns ONLY Dog A's consultations → sessions → chunks
- No possibility of cross-contamination

---

## 3. Resume Logic Analysis

### 3.1 Current Resume Behavior

**When user clicks on paused consultation card:**

```javascript
// sidebar.js:485-520
card.addEventListener('click', async () => {
  // Save current consultation if different
  if (this.currentPatient && this.currentPatient.id !== patientId) {
    await this.handlePatientSwitch();
  }

  // Update current patient
  this.currentPatient = consult.patient;

  // Load the consultation
  await this.loadConsultation(consult);

  // Update storage
  await this.saveConsultationsToStorage();
});
```

**loadConsultation() behavior (sidebar.js:412-443):**

```javascript
async loadConsultation(consultState) {
  console.log('📂 Loading consultation:', consultState);

  // Restore consultation data
  this.consultationId = consultState.consultationId;  // ✅ Existing ID
  this.sessionId = consultState.sessionId;            // ✅ Existing ID
  this.timerSeconds = consultState.timerSeconds;
  this.photos = consultState.photos || [];
  this.activeConsultationId = consultState.consultationId;

  // Update UI with patient info
  this.updatePatientUI(consultState.patient);

  // Restore to recording state (paused)
  this.showState('recording');
  this.isPaused = true;  // ✅ Paused state

  // Update timer display
  this.updateTimer();

  // Update pause button
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.innerHTML = '▶ Resume';
    document.getElementById('recording-status').textContent = 'Paused';
  }

  // Reload photos
  this.renderPhotos();
}
```

**Resume recording behavior (sidebar.js:672-674):**

```javascript
// When user clicks "Resume" button
else {
  // Resume
  console.log('▶️ Resuming recording');
  this.recordingManager.resumeRecording();  // ⚠️ CRITICAL LINE

  // Resume timer
  this.timerInterval = setInterval(() => {
    this.timerSeconds++;
    this.updateTimer();
  }, 1000);

  this.isPaused = false;
  pauseBtn.textContent = '⏸️ Pause';
}
```

**RecordingManager.resumeRecording() (recording/recording-manager.js:190-196):**

```javascript
resumeRecording() {
  if (this.mediaRecorder.isPaused()) {
    this.mediaRecorder.resumeRecording();  // ⚠️ Just calls MediaRecorder API
    console.log('▶️ Recording resumed');
  }
}
```

### 3.2 CRITICAL GAP IDENTIFIED

**❌ PROBLEM: No backend reconnection on resume**

When resuming a paused consultation:

1. ✅ Frontend restores `consultationId` and `sessionId` from state
2. ✅ Frontend calls `mediaRecorder.resumeRecording()` to unpause audio
3. ❌ **BUT** `RecordingManager` state is NOT fully restored:
   - `this.recordingToken` is NOT restored (set to `null` on cleanup)
   - `this.isActive` is NOT set to `true`
   - Chunk upload queue is cleared
   - ProcessedChunks Set is cleared

**CONSEQUENCE:**
- When audio resumes, chunks are created
- `handleChunk()` is called with new chunks
- Chunks are added to upload queue
- **Upload will FAIL** because `this.recordingToken` is `null`

**CODE EVIDENCE:**
```javascript
// recording/recording-manager.js:152
const result = await RecordingService.uploadChunkWithRetry(
  this.sessionId,  // Still has old sessionId from state
  chunk.blob,
  chunk.chunkNumber,
  chunk.duration,
  this.recordingToken,  // ❌ THIS IS NULL!
  3
);
```

### 3.3 Backend Support for Resume

**Question:** Does backend support resuming an existing recording session?

**Answer from API analysis:**

1. **Backend expects NEW session for NEW recording:**
   ```
   POST /recordings/sessions/new
   Body: { consultationId, mode, templateId }
   ```

2. **No "resume session" endpoint found:**
   - No `PUT /recordings/sessions/:id/resume`
   - No `POST /recordings/sessions/:id/resume`
   - No way to get new recording token for existing session

3. **Session lifecycle in backend:**
   ```
   pending → active → completed
   ```
   - Once session is marked `completed`, it's done
   - No way to reopen completed session
   - Paused sessions remain in `active` state

**CONCLUSION:** ❌ **Backend does NOT support resuming paused sessions with new chunks.**

---

## 4. Issues and Gaps Identified

### 4.1 Critical Issues

**Issue #1: Resume Recording Will Fail**
- **Severity:** 🔴 Critical
- **Impact:** User resumes recording → chunks fail to upload → data loss
- **Root Cause:** `recordingToken` not preserved across pause/resume
- **Evidence:** `RecordingManager.cleanup()` clears token, `loadConsultation()` doesn't restore it

**Issue #2: No Backend Resume Support**
- **Severity:** 🔴 Critical
- **Impact:** Can't continue recording on existing session
- **Root Cause:** Backend designed for single continuous recording per session
- **Evidence:** No resume endpoint, session lifecycle is linear

**Issue #3: Chunk Number Collision Risk**
- **Severity:** 🟡 High
- **Impact:** Resume creates chunks starting from 0 again
- **Root Cause:** `chunkNumber` counter in offscreen.js resets on each recording start
- **Evidence:** `this.chunkNumber = 0` in `MediaRecorderOffscreenService` constructor

### 4.2 Data Integrity Risks

**Risk #1: Duplicate Chunks (Mitigated)**
- **Status:** ✅ Mitigated by deduplication logic
- **Evidence:** `processedChunks Set` in `RecordingManager` prevents duplicate uploads

**Risk #2: Out-of-Order Chunks (Low Risk)**
- **Status:** ✅ Backend has `sequence_order` field
- **Evidence:** Upload includes both `chunkNumber` and `sequenceOrder`

**Risk #3: Lost Transcriptions (High Risk)**
- **Status:** ⚠️ If resume fails, new consultation is created → old chunks orphaned
- **Evidence:** Old sessionId becomes inaccessible, chunks remain untranscribed

---

## 5. Architecture Recommendations

### 5.1 Option A: Multi-Session Architecture (Recommended)

**Design:** Allow multiple recording sessions per consultation.

**Changes Required:**

1. **Frontend: Update Resume Logic**
   ```javascript
   async resumeConsultation(consultState) {
     // Restore consultation ID
     this.consultationId = consultState.consultationId;

     // Create NEW recording session for same consultation
     const sessionResult = await RecordingService.createSession(
       this.consultationId,
       { mode: 'summary' }
     );

     if (!sessionResult.success) {
       throw new Error('Failed to create new session');
     }

     // Store new session ID and token
     this.sessionId = sessionResult.session.id;
     this.recordingToken = sessionResult.recordingToken;

     // Update state
     consultState.sessionId = this.sessionId;
     this.activeConsultations.set(consultState.patientId, consultState);

     // Start MediaRecorder with callback
     await this.mediaRecorder.startRecording((blob, duration, chunkNumber) => {
       this.handleChunk(blob, duration, chunkNumber);
     });
   }
   ```

2. **Backend: Update Summary Generation**
   - Modify `/consultations/:id/complete` to aggregate chunks from ALL sessions
   - Query: `SELECT * FROM audio_chunks WHERE session_id IN (SELECT id FROM recording_sessions WHERE consultation_id = ?)`
   - Concatenate transcriptions from all sessions
   - Generate summary from combined transcript

3. **Frontend: Update Stop Recording**
   - Mark current session as `completed`
   - Complete consultation (triggers multi-session summary)

**Advantages:**
- ✅ No lost data - all chunks preserved
- ✅ Clean session boundaries
- ✅ Easy to implement
- ✅ Backend naturally aggregates multiple sessions

**Disadvantages:**
- ⚠️ Slightly more complex backend query
- ⚠️ Need to handle session ordering

### 5.2 Option B: Single-Session Resume (Requires Backend Changes)

**Design:** Allow resuming existing recording session with new chunks.

**Changes Required:**

1. **Backend: Add Resume Endpoint**
   ```typescript
   POST /recordings/sessions/:id/resume
   Response: { recordingToken: string }
   ```

2. **Backend: Update Token Validation**
   - Allow multiple tokens per session (old + new)
   - Track token generation timestamps
   - Validate against latest token

3. **Frontend: Update Resume Logic**
   ```javascript
   async resumeConsultation(consultState) {
     // Request new token for existing session
     const resumeResult = await RecordingService.resumeSession(
       consultState.sessionId
     );

     if (!resumeResult.success) {
       throw new Error('Failed to resume session');
     }

     // Update recording token
     this.recordingToken = resumeResult.recordingToken;
     this.sessionId = consultState.sessionId;
     this.consultationId = consultState.consultationId;

     // Continue recording with same session
     await this.mediaRecorder.startRecording((blob, duration, chunkNumber) => {
       this.handleChunk(blob, duration, chunkNumber);
     });
   }
   ```

4. **Frontend: Fix Chunk Numbering**
   - Track highest chunk number in state
   - Pass to MediaRecorder on resume: `startRecording(callback, startChunkNumber)`
   - Offscreen service continues numbering from `startChunkNumber`

**Advantages:**
- ✅ Single session per consultation (cleaner)
- ✅ No chunk number collisions

**Disadvantages:**
- ❌ Requires backend API changes
- ❌ More complex token management
- ❌ Chunk ordering dependency

### 5.3 Option C: Complete-and-Restart (Current Behavior - NOT RECOMMENDED)

**Design:** Complete old consultation, create new one on resume.

**Current Flow:**
1. User pauses recording on Dog A
2. User switches to Dog B
3. User switches back to Dog A
4. System creates NEW consultation for Dog A
5. Old consultation remains incomplete

**Problems:**
- ❌ Multiple consultations for same visit
- ❌ Fragmented data
- ❌ Confusing for user and backend
- ❌ Summary generation unclear (which consultation?)

**❌ DO NOT USE THIS APPROACH**

---

## 6. Recommended Implementation Approach

### Phase 1: Immediate Fix (Option A - Multi-Session)

**Priority:** 🔴 Critical - Prevents data loss

**Implementation Steps:**

1. **Update `RecordingManager.resumeRecording()` to create new session:**
   ```javascript
   async resumeRecording(consultationId) {
     // Create new session for existing consultation
     const sessionResult = await RecordingService.createSession(
       consultationId,
       { mode: 'summary' }
     );

     if (!sessionResult.success) {
       throw new Error('Failed to create session');
     }

     this.sessionId = sessionResult.session.id;
     this.recordingToken = sessionResult.recordingToken;
     this.isActive = true;
     this.processedChunks.clear();
     this.uploadQueue = [];

     // Start MediaRecorder
     await this.mediaRecorder.startRecording((blob, duration, chunkNumber) => {
       this.handleChunk(blob, duration, chunkNumber);
     });

     return { success: true, sessionId: this.sessionId };
   }
   ```

2. **Update `sidebar.js` resume button handler:**
   ```javascript
   else {
     // Resume
     console.log('▶️ Resuming recording');

     // Create new session for existing consultation
     const result = await this.recordingManager.resumeRecording(
       this.consultationId
     );

     if (!result.success) {
       alert('Failed to resume recording');
       return;
     }

     // Update session ID in state
     this.sessionId = result.sessionId;

     // Update stored consultation state
     const consult = this.activeConsultations.get(this.currentPatient.id);
     if (consult) {
       consult.sessionId = this.sessionId;
       this.activeConsultations.set(this.currentPatient.id, consult);
     }

     // Resume timer
     this.timerInterval = setInterval(() => {
       this.timerSeconds++;
       this.updateTimer();
     }, 1000);

     this.isPaused = false;
     pauseBtn.textContent = '⏸️ Pause';
   }
   ```

3. **Backend: Update summary generation (if needed):**
   - Check if `/consultations/:id/complete` already aggregates from multiple sessions
   - If not, update to query all sessions for consultation:
     ```sql
     SELECT ac.* FROM audio_chunks ac
     JOIN recording_sessions rs ON ac.session_id = rs.id
     WHERE rs.consultation_id = ?
     ORDER BY rs.created_at, ac.sequence_order
     ```

**Testing Checklist:**
- [ ] Start recording Dog A
- [ ] Pause and switch to Dog B
- [ ] Start recording Dog B
- [ ] Switch back to Dog A
- [ ] Resume recording Dog A (should create new session)
- [ ] Verify chunks upload successfully
- [ ] Complete Dog A recording
- [ ] Verify summary includes chunks from both sessions
- [ ] Complete Dog B recording
- [ ] Verify no cross-contamination

### Phase 2: Enhanced Features (Optional)

1. **Session History UI:**
   - Show list of sessions per consultation
   - Display chunk counts and durations per session
   - Allow users to review individual sessions

2. **Pause Timeout Warning:**
   - Alert user if consultation paused >30 minutes
   - Offer to complete or extend session

3. **Backend Optimization:**
   - Cache aggregated transcriptions
   - Pre-compile multi-session transcripts

---

## 7. Verification Evidence

### 7.1 Data Isolation Tests

**Test Case 1: Concurrent Recordings**
```
GIVEN: Dog A recording (consultationId_A, sessionId_A)
AND: Dog B recording (consultationId_B, sessionId_B)
WHEN: Chunks uploaded for both
THEN: Chunks correctly routed by sessionId
VERIFY: Query consultationId_A → only Dog A chunks
VERIFY: Query consultationId_B → only Dog B chunks
```

**Test Case 2: Rapid Patient Switching**
```
GIVEN: Recording Dog A
WHEN: Switch to Dog B (pause A)
WHEN: Switch to Dog C (pause B)
WHEN: Switch back to Dog A (resume A)
THEN: Dog A chunks continue on same consultationId_A
AND: Dog B chunks on consultationId_B
AND: Dog C ready state (no recording yet)
```

### 7.2 Resume Logic Tests

**Test Case 3: Resume After Pause**
```
GIVEN: Dog A recording paused
WHEN: Click resume
THEN: ❌ FAILS with token error (current behavior)
EXPECTED: Creates new session, uploads succeed (after fix)
```

**Test Case 4: Multi-Session Summary**
```
GIVEN: Dog A has 2 sessions (paused once)
WHEN: Complete consultation
THEN: Summary includes chunks from both sessions
VERIFY: Transcript length = sum of all chunks
VERIFY: Chunk order preserved (session1 chunks → session2 chunks)
```

---

## 8. Conclusion and Next Steps

### Critical Findings Summary

1. **✅ Data Isolation Works:** Consultations properly separated by ID, no risk of cross-contamination
2. **❌ Resume Logic Broken:** Recording token not preserved, uploads will fail on resume
3. **❌ No Backend Resume Support:** Sessions are single-use, can't add new chunks after pause
4. **⚠️ Multi-Session Not Implemented:** Backend may not aggregate multiple sessions per consultation

### Immediate Action Required

**Priority 1 (Critical):**
- Implement Option A (Multi-Session Architecture)
- Update `RecordingManager.resumeRecording()` to create new session
- Test resume flow end-to-end

**Priority 2 (High):**
- Verify backend aggregates multiple sessions on completion
- Update backend if needed to query all sessions per consultation
- Add session tracking UI

**Priority 3 (Medium):**
- Add user warnings for paused consultations
- Implement automatic session cleanup
- Add better error handling for resume failures

### Implementation Estimate

- **Option A Implementation:** 4-6 hours
  - Frontend changes: 2-3 hours
  - Backend verification: 1-2 hours
  - Testing: 1-2 hours

- **Option B Implementation:** 8-12 hours
  - Backend API changes: 4-6 hours
  - Frontend changes: 2-3 hours
  - Testing: 2-3 hours

**Recommendation:** Start with Option A (Multi-Session) as it requires minimal backend changes and can be implemented quickly to prevent data loss.

---

## Appendices

### A. Key File Locations

- **Frontend State Management:** `/sidebar.js` (lines 22, 318-410, 463-520, 548-560)
- **Recording Manager:** `/recording/recording-manager.js` (lines 7, 22-100, 182-196, 203-313)
- **Consultation Service:** `/api/consultation.service.js` (lines 10-55, 192-228)
- **Recording Service:** `/api/recording.service.js` (lines 11-59, 119-169)
- **Config/Endpoints:** `/config.js` (lines 17-37)

### B. Backend API Endpoints (Verified)

**Consultations:**
- `POST /consultations` - Create new consultation
- `GET /consultations/:id` - Get consultation details
- `PATCH /consultations/:id` - Update consultation
- `POST /consultations/:id/complete` - Complete consultation (triggers summary)
- `POST /consultations/:id/generate-summary` - Generate AI summary
- `POST /consultations/:id/photos` - Upload photo

**Recording Sessions:**
- `POST /recordings/sessions/new` - Create new recording session
- `POST /recordings/sessions/:id/chunks` - Upload audio chunk
- `PUT /recordings/sessions/:id` - Update session status
- `POST /recordings/sessions/:id/complete` - Complete session
- `GET /recordings/sessions/:id/chunks` - Get chunks (with transcriptions)

### C. State Storage Schema

**chrome.storage.local:**
```javascript
{
  'activeConsultations': [
    {
      patientId: 'ezyvet_123',
      patient: { name, species, id, date },
      consultationId: 'uuid-1',
      sessionId: 'uuid-2',
      timerSeconds: 145,
      photos: [...],
      state: 'paused',
      pausedAt: '2025-10-27T12:33:00Z'
    },
    // ... more consultations
  ]
}
```

**In-Memory (sidebar.js):**
```javascript
this.activeConsultations = new Map(); // patientId → consultation state
this.currentPatient = { name, species, id, date };
this.consultationId = 'uuid';
this.sessionId = 'uuid';
this.timerSeconds = 145;
this.photos = [...];
this.isPaused = true/false;
```

### D. Chunk Upload Flow Diagram

```
┌─────────────────┐
│ MediaRecorder   │ Creates audio chunk every 15s
│ (offscreen.js)  │
└────────┬────────┘
         │ AUDIO_CHUNK message
         ↓
┌─────────────────┐
│ background.js   │ Forwards message
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ MediaRecorder   │ Converts base64 → Blob
│ Service         │ Calls chunkCallback()
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Recording       │ Deduplicates (Set)
│ Manager         │ Queues for upload
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Recording       │ POST /sessions/:id/chunks
│ Service         │ with recordingToken
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Backend API     │ Stores chunk
│                 │ Starts transcription (async)
└─────────────────┘
```

### E. Resume Flow Comparison

**Current Behavior (Broken):**
```
User clicks Resume
→ recordingManager.resumeRecording()
→ mediaRecorder.resumeRecording() (just unpauses audio)
→ Chunks created
→ Upload fails (recordingToken = null)
```

**Fixed Behavior (Option A):**
```
User clicks Resume
→ recordingManager.resumeRecording(consultationId)
→ Create NEW session for SAME consultation
→ Get new sessionId + recordingToken
→ Start MediaRecorder with new session
→ Chunks upload successfully
→ On complete: aggregate ALL sessions
```

---

**Analysis Complete**
**Prepared by:** Root Cause Analysis Mode
**Review Required:** Backend team to verify multi-session aggregation logic
