# BrobyVets Extension Testing Guide

## Prerequisites

Before testing, ensure:
- ✅ Chrome extension installed and enabled
- ✅ Microphone permission granted (setup.html completed)
- ✅ Valid BrobyVets account credentials
- ✅ EzyVet account with test patient data

---

## Testing Flow

### 1. Extension Installation & Setup

**Steps**:
1. Go to `chrome://extensions`
2. Turn BrobyVets extension OFF, then ON (to trigger fresh install)
3. **Expected**: setup.html opens automatically in a new tab

**Setup Page**:
4. Click "Allow Microphone Access" button
5. **Expected**: Chrome shows microphone permission prompt
6. Click "Allow" in Chrome's permission prompt
7. **Expected**:
   - Success message appears: "✅ Microphone access granted!"
   - Message shows: "This tab will close in 2 seconds..."
   - Tab auto-closes after 2 seconds

**Verification**:
- Extension should NOT show setup page again on subsequent uses
- Microphone permission should persist after browser restart

---

### 2. Login Flow

**Steps**:
1. Navigate to any EzyVet patient page (e.g., `*.ezyvet.com/patients/...`)
2. Click BrobyVets extension icon to open side panel
3. **Expected**: Login screen appears

**Login**:
4. Enter email and password
5. Click "Login" button
6. **Expected**:
   - Loading spinner appears
   - After ~1-2 seconds, shows "Ready to Start" state
   - Patient information NOT yet displayed (waiting for patient selection)

**Verification**:
- Token should be stored in chrome.storage
- User should remain logged in after page refresh

---

### 3. Patient Detection

**Steps**:
1. With side panel open, navigate to an EzyVet patient page
2. **Expected**:
   - Content script detects patient from URL
   - Patient name, species, and ID appear in side panel
   - "Start Consult" button becomes active

**Test Cases**:
- ✅ Navigate to different patient → Patient info updates
- ✅ Refresh page → Patient info persists
- ✅ Navigate to non-patient page → Patient info clears

---

### 4. Recording Flow

**Steps**:
1. With patient loaded, click "Start Consult" button
2. **Expected**:
   - UI changes to "Recording" state
   - Waveform animation appears
   - Timer starts (00:00)
   - "⏸️ Pause" and "✓ Submit" buttons visible

**Console Logs** (check with F12):
```
🎬 Starting recording workflow for: [Patient Name]
📝 Step 1: Creating consultation...
✅ Consultation created: [consultation-id]
🎤 Step 2: Creating recording session...
✅ Recording session created: [session-id]
🔑 Recording token received
🎙️ Step 3: Starting MediaRecorder...
✅ Recording started successfully!
```

**During Recording**:
3. Speak into microphone for at least 30 seconds
4. **Expected**: Every 15 seconds, you should see:
```
📦 Received chunk [N], adding to upload queue
📤 Uploading chunk [N]...
✅ Chunk [N] uploaded successfully
```

**Pause/Resume**:
5. Click "⏸️ Pause" button
6. **Expected**: Timer stops, waveform freezes, button changes to "▶️ Resume"
7. Click "▶️ Resume" button
8. **Expected**: Timer continues, waveform animates, button changes to "⏸️ Pause"

---

### 5. Stop Recording & Summary Generation

**Steps**:
1. After recording for at least 30 seconds, click "✓ Submit" button
2. **Expected**:
   - Timer stops
   - UI switches to "Processing" state
   - Shows spinning loader with text: "Generating AI Summary..."
   - Subtext: "This may take a few moments"

**Console Logs**:
```
🛑 Stopping recording...
⏳ Waiting for all uploads to complete...
✅ All chunks uploaded
🎯 Completing session...
✅ Session completed: {...}
🎯 Summary generation started in background
✅ Recording submitted, waiting for summary...
🔄 Starting summary polling...
📡 Polling attempt 1/60
📋 Consultation data: { id: '...', hasAiSummary: false, aiSummaryLength: 0 }
⏳ AI summary not ready yet (attempt 1/60)
```

**Polling Behavior**:
- Extension polls backend every 5 seconds
- Maximum 60 attempts (5 minutes total)
- Each attempt logs current status

---

### 6. Summary Display

**Expected Timeline**:
- Short recording (30-60 seconds): ~10-15 seconds to generate summary
- Medium recording (2-5 minutes): ~20-30 seconds
- Long recording (10+ minutes): ~30-60 seconds

**When Summary Ready**:
**Expected**:
- UI switches to "Completed" state
- Green checkmark badge appears: "✓ Consultation Complete"
- AI Summary section displays with:
  - Section header: "📝 AI Summary"
  - Formatted summary content (bold headers, line breaks, lists)

**Console Logs**:
```
✅ AI Summary ready! { summaryLength: 1234 }
✅ Recording complete { summaryLength: 1234 }
📝 Summary displayed in UI
```

**Sample Summary Format**:
```
Chief Complaint: [Reason for visit]

History: [Patient history and symptoms]

Physical Exam: [Examination findings]

Assessment: [Diagnosis]

Plan: [Treatment plan and recommendations]
```

---

### 7. Post-Summary Actions

**New Consult Button**:
1. Click "New Consult" button
2. **Expected**:
   - UI returns to "Ready to Start" state
   - Timer resets to 00:00
   - Patient info remains (if still on same patient page)
   - Ready to start a new recording

**Insert into EzyVet Button**:
1. Click "Insert into EzyVet" button
2. **Expected**:
   - (Future feature - currently placeholder)
   - Should insert summary into EzyVet notes

---

## Error Scenarios

### 1. No Microphone Permission
**Trigger**: Skip setup page or deny permission

**Expected**:
- "Start Consult" button shows error: "Microphone permission denied"
- Alert message directs user to grant permission
- setup.html opens automatically

### 2. Network Error During Upload
**Trigger**: Disconnect network while recording

**Expected**:
- Chunks retry upload with exponential backoff
- Console shows: `⚠️ Retry 1/3 for chunk [N] after 1000ms`
- Recording continues, uploads resume when network restored

### 3. Summary Generation Timeout
**Trigger**: Wait 5+ minutes without summary

**Expected**:
- After 60 attempts (300 seconds), shows alert:
  - "⚠️ Summary generation took longer than expected. Please refresh to check status."
- UI returns to "Ready" state
- Console shows: `❌ Summary polling timeout after 60 attempts`

### 4. Authentication Expiry
**Trigger**: Token expires during long recording

**Expected**:
- API calls fail with 401 Unauthorized
- User redirected to login screen
- Recording state preserved for recovery

---

## Debug Checklist

If something doesn't work, check:

### Browser Console (F12 → Console tab)
```javascript
// Check patient detection
chrome.storage.local.get('currentPatient', console.log)

// Check auth tokens
chrome.storage.local.get('access_token', console.log)

// Check setup completion
chrome.storage.local.get('setupComplete', console.log)

// Manual summary polling test
ConsultationService.getConsultation('[consultation-id]').then(console.log)
```

### Extension Console (chrome://extensions → BrobyVets → Inspect views: background)
- Background script logs
- Offscreen document creation logs
- Message forwarding logs

### Network Tab (F12 → Network tab)
- Check API calls to `backend-production-a35dc.up.railway.app`
- Verify auth headers present
- Check response status codes and data

### Common Issues

**"Failed to start recording: Microphone permission denied"**
- Solution: Complete setup.html flow
- Check: Chrome Settings → Privacy and security → Microphone → Allow for extension

**"Summary polling timeout"**
- Check: Backend is running and accessible
- Check: Consultation actually has recorded audio
- Verify: Transcription service is working

**Patient info not updating**
- Check: Content script injected on EzyVet pages
- Check: URL matches pattern `*.ezyvet.com/*`
- Verify: chrome.storage.local has currentPatient

**Chunks not uploading**
- Check: Recording token present
- Check: Network connectivity
- Verify: Session ID valid and active

---

## Performance Benchmarks

### Expected Metrics:
- **Setup page load**: < 1 second
- **Login response**: 1-2 seconds
- **Session creation**: < 1 second
- **Chunk upload**: 200-500ms per chunk
- **Summary generation**: 10-60 seconds depending on length
- **UI state transitions**: Instant (< 100ms)

### Resource Usage:
- **Memory**: ~50-100MB while recording
- **CPU**: Minimal (< 5% on modern machines)
- **Network**: ~2-5 KB per 15-second audio chunk

---

## Test Scenarios

### Scenario 1: Happy Path (End-to-End)
1. ✅ Install extension → Setup page appears
2. ✅ Grant microphone → Setup completes
3. ✅ Login → Success
4. ✅ Navigate to patient → Patient info loads
5. ✅ Start recording → Recording begins
6. ✅ Record for 1 minute → Chunks upload
7. ✅ Submit recording → Processing state
8. ✅ Wait ~20 seconds → Summary appears
9. ✅ Review summary → Properly formatted
10. ✅ New consult → Reset to ready state

### Scenario 2: Pause/Resume
1. Start recording
2. Pause after 30 seconds
3. Wait 10 seconds
4. Resume recording
5. Record for another 30 seconds
6. Submit → Verify both segments included in summary

### Scenario 3: Multiple Patients
1. Record consult for Patient A
2. Wait for summary
3. Navigate to Patient B
4. Start new recording
5. Verify correct patient info shown
6. Submit → Verify separate consultations created

### Scenario 4: Network Resilience
1. Start recording
2. Disconnect network after 30 seconds
3. Continue recording for 30 seconds
4. Reconnect network
5. Submit → Verify all chunks eventually upload

---

## Known Limitations

1. **Offline Mode**: Recording requires network for uploads (no offline queue)
2. **Browser Support**: Chrome/Edge only (manifest V3)
3. **Audio Format**: WebM/Opus (may not play in all audio players)
4. **Summary Language**: English only (backend limitation)
5. **Concurrent Recordings**: One recording per consultation

---

## Success Criteria

Extension is working correctly if:
- ✅ Microphone permission granted on first use
- ✅ Patient detection automatic and accurate
- ✅ Recording starts/stops reliably
- ✅ Chunks upload successfully in real-time
- ✅ Summary generates within 60 seconds
- ✅ Summary displays properly formatted
- ✅ No JavaScript errors in console
- ✅ No memory leaks after multiple recordings

---

## Reporting Issues

When reporting bugs, include:
1. **Browser version**: Chrome/Edge version number
2. **Extension version**: Check manifest.json
3. **Console logs**: Full console output (F12 → Console)
4. **Network logs**: Failed requests (F12 → Network)
5. **Steps to reproduce**: Exact sequence that caused the issue
6. **Expected vs actual**: What should happen vs what happened
7. **Screenshots**: If UI issue, include screenshots
