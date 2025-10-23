# Chrome Extension Recording Flow - Complete Code Summary

## Architecture Overview

```
User clicks record in sidebar.html
    ↓
sidebar.js → RecordingManager.startRecording()
    ↓
RecordingManager → MediaRecorderService.startRecording()
    ↓
MediaRecorderService → chrome.runtime.sendMessage('START_RECORDING') → background.js
    ↓
background.js → creates offscreen.html document
    ↓
offscreen.html → media-recorder-offscreen.service.js → getUserMedia() + MediaRecorder
    ↓
Every 15 seconds: offscreen stops recorder → creates chunk → sends to background.js
    ↓
background.js → forwards chunk to sidebar.js
    ↓
sidebar.js → MediaRecorderService receives chunk via chrome.runtime.onMessage
    ↓
MediaRecorderService → calls chunkCallback(blob, duration, chunkNumber)
    ↓
RecordingManager.handleChunk() → adds to upload queue
    ↓
RecordingManager.processUploadQueue() → RecordingService.uploadChunkWithRetry()
    ↓
RecordingService uploads to backend API /recordings/sessions/:id/chunks
    ↓
Backend transcribes chunk asynchronously (fire-and-forget)
    ↓
User stops recording → RecordingManager.stopRecording()
    ↓
Waits for final chunks to arrive and upload
    ↓
Polls /recordings/sessions/:id/chunks for transcription completion
    ↓
Calls /recordings/sessions/:id/complete to trigger summary generation
```

---

## File 1: `/sidebar.html` (Line 172)

```html
<script src="recording/media-recorder.service.js"></script>
```

**KEY**: Extension loads `media-recorder.service.js`, NOT `media-recorder-offscreen.service.js`

---

## File 2: `/recording/media-recorder.service.js`

### Purpose
Manages recording lifecycle in sidebar context and handles chunk message routing.

### Key Code Sections

#### Constructor & Setup (Lines 1-50)
```javascript
class MediaRecorderService {
  constructor() {
    this.isActive = false;
    this.chunkCallback = null;
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // DEBUG: Log ALL messages to understand sender
      if (message.type === 'AUDIO_CHUNK') {
        console.log(`🔍 DEBUG SENDER:`, sender);
        console.log(`🔍 DEBUG sender.url:`, sender.url);
        console.log(`🔍 DEBUG sender.id:`, sender.id);
      }

      if (message.type === 'AUDIO_CHUNK') {
        console.log(`📦 Received chunk ${message.chunk.chunkNumber} from offscreen`);
        console.log(`🔍 DEBUG: chunkCallback exists?`, !!this.chunkCallback);
        console.log(`🔍 DEBUG: chunkCallback type:`, typeof this.chunkCallback);

        if (this.chunkCallback) {
          console.log(`🔍 DEBUG: About to call chunkCallback...`);
          // Convert base64 back to Blob
          const byteCharacters = atob(message.chunk.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: message.chunk.mimeType });

          console.log(`🔍 DEBUG: About to call chunkCallback with blob size ${blob.size}`);
          this.chunkCallback(
            blob,
            message.chunk.duration,
            message.chunk.chunkNumber
          );
          console.log(`🔍 DEBUG: chunkCallback completed for chunk ${message.chunk.chunkNumber}`);
        } else {
          console.error(`❌ ERROR: chunkCallback is NULL for chunk ${message.chunk.chunkNumber}!`);
        }
      }

      // Handle recording errors
      if (message.type === 'RECORDING_ERROR') {
        console.error('❌ Recording error from offscreen:', message.error);
      }
    });
  }
}
```

**CRITICAL FLOW**:
1. Listens for `AUDIO_CHUNK` messages from background.js
2. Converts base64 data back to Blob
3. Calls `chunkCallback(blob, duration, chunkNumber)` which is set by RecordingManager

#### startRecording (Lines 52-95)
```javascript
async startRecording(chunkCallback) {
  try {
    console.log('🎬 Starting recording...');

    if (this.isActive) {
      console.warn('⚠️ Recording already active');
      return;
    }

    // Store callback
    this.chunkCallback = chunkCallback;

    // Tell background.js to start recording
    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING'
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to start recording');
    }

    this.isActive = true;
    console.log('✅ Recording started');

  } catch (error) {
    console.error('❌ Failed to start recording:', error);
    this.chunkCallback = null;
    throw error;
  }
}
```

**KEY**: Sends `START_RECORDING` message to background.js and stores the callback

#### stopRecording (Lines 111-141) - **CRITICAL FIX**
```javascript
async stopRecording() {
  try {
    console.log('🛑 Stopping recording...');

    if (!this.isActive) {
      return;
    }

    // Tell offscreen document to stop recording
    const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

    if (!response.success) {
      throw new Error(response.error || 'Failed to stop recording');
    }

    this.isActive = false;

    // ⚠️ CRITICAL: Don't clear callback immediately - final chunk may still arrive!
    // Wait a bit for any final chunks to be processed
    console.log('⏳ Waiting 1 second for final chunks...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    this.chunkCallback = null;

    console.log('✅ Recording stopped');

  } catch (error) {
    console.error('❌ Failed to stop recording:', error);
    this.isActive = false;
    // Still wait for chunks even on error
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.chunkCallback = null;
  }
}
```

**CRITICAL FIX**: Delays clearing `chunkCallback` by 1 second to allow final chunk to arrive and be processed. Without this delay, final chunks arrive to a NULL callback and are lost.

---

## File 3: `/background.js`

### Purpose
Manages offscreen document lifecycle and routes messages between offscreen and sidebar.

### Key Code
```javascript
let isRecording = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_RECORDING') {
    startRecording(sendResponse);
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording(sendResponse);
    return true;
  }

  // Forward audio chunks from offscreen to sidebar
  if (message.type === 'AUDIO_CHUNK') {
    chrome.runtime.sendMessage(message).catch(error => {
      console.error('Failed to forward chunk to sidebar:', error);
    });
  }

  if (message.type === 'RECORDING_ERROR') {
    chrome.runtime.sendMessage(message).catch(error => {
      console.error('Failed to forward error to sidebar:', error);
    });
  }
});

async function startRecording(sendResponse) {
  try {
    if (isRecording) {
      sendResponse({ success: false, error: 'Already recording' });
      return;
    }

    // Create offscreen document if not exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Recording audio for consultation'
      });
    }

    // Tell offscreen document to start
    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING_OFFSCREEN'
    });

    if (response.success) {
      isRecording = true;
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: response.error });
    }
  } catch (error) {
    console.error('Failed to start recording:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function stopRecording(sendResponse) {
  try {
    if (!isRecording) {
      sendResponse({ success: false, error: 'Not recording' });
      return;
    }

    // Tell offscreen to stop
    const response = await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING_OFFSCREEN'
    });

    isRecording = false;
    sendResponse({ success: true });

  } catch (error) {
    console.error('Failed to stop recording:', error);
    isRecording = false;
    sendResponse({ success: false, error: error.message });
  }
}
```

**CRITICAL FLOW**:
1. Creates offscreen.html document for getUserMedia() access
2. Routes `START_RECORDING` → `START_RECORDING_OFFSCREEN` to offscreen
3. Routes `STOP_RECORDING` → `STOP_RECORDING_OFFSCREEN` to offscreen
4. Forwards `AUDIO_CHUNK` messages from offscreen → sidebar

---

## File 4: `/offscreen.html` + `/recording/media-recorder-offscreen.service.js`

### Purpose
Actual MediaRecorder implementation in offscreen document context (only context with getUserMedia access).

### Key Code - media-recorder-offscreen.service.js

#### Constructor & Chunk Timer
```javascript
class MediaRecorderOffscreenService {
  constructor() {
    this.mediaRecorder = null;
    this.audioStream = null;
    this.isRecording = false;
    this.chunkNumber = 0;
    this.chunkStartTime = null;
    this.chunkTimer = null;
    this.CHUNK_INTERVAL_MS = 15000; // 15 seconds per chunk
  }
}
```

**KEY**: Uses 15-second timer to manually create chunks (no timeslice)

#### startRecording
```javascript
async startRecording() {
  try {
    console.log('[Offscreen] 🎬 Starting recording...');

    // Get microphone access
    this.audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.audioStream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    // Handle data available
    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        await this.handleChunk(event.data);
      }
    };

    // Handle errors
    this.mediaRecorder.onerror = (error) => {
      console.error('[Offscreen] ❌ MediaRecorder error:', error);
      chrome.runtime.sendMessage({
        type: 'RECORDING_ERROR',
        error: error.message
      });
    };

    // Start recording
    this.mediaRecorder.start();
    this.isRecording = true;
    this.chunkStartTime = Date.now();

    // Start chunk timer
    this.startChunkTimer();

    console.log('[Offscreen] ✅ Recording started');
    return { success: true };

  } catch (error) {
    console.error('[Offscreen] ❌ Failed to start recording:', error);
    return { success: false, error: error.message };
  }
}
```

#### Manual Chunk Creation (Double-Buffered Pattern)
```javascript
startChunkTimer() {
  this.chunkTimer = setInterval(async () => {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      console.log('[Offscreen] ⏰ Chunk timer triggered, creating new chunk...');

      // Stop current recorder to get data
      this.mediaRecorder.stop();

      // Wait for ondataavailable to fire
      await new Promise(resolve => setTimeout(resolve, 200));

      // Start new recorder for next chunk
      if (this.isRecording) {
        this.mediaRecorder.start();
        this.chunkStartTime = Date.now();
      }
    }
  }, this.CHUNK_INTERVAL_MS);
}
```

**CRITICAL**: This mimics webapp's double-buffered pattern:
1. Every 15 seconds: stop recorder
2. Wait 200ms for `ondataavailable` to fire
3. Start new recorder for next chunk

#### handleChunk (Send to background.js)
```javascript
async handleChunk(blob) {
  try {
    const duration = (Date.now() - this.chunkStartTime) / 1000; // seconds
    const currentChunkNumber = this.chunkNumber++;

    console.log(`[Offscreen] 📦 Processing chunk ${currentChunkNumber}:`, {
      size: blob.size,
      duration,
      type: blob.type
    });

    // Convert blob to base64 for message passing
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Send to background.js
    chrome.runtime.sendMessage({
      type: 'AUDIO_CHUNK',
      chunk: {
        data: base64,
        chunkNumber: currentChunkNumber,
        duration,
        mimeType: blob.type
      }
    });

    console.log(`[Offscreen] ✅ Chunk ${currentChunkNumber} sent to background`);

  } catch (error) {
    console.error('[Offscreen] ❌ Failed to handle chunk:', error);
  }
}
```

**KEY**: Converts blob to base64 and sends via chrome.runtime.sendMessage

#### stopRecording
```javascript
async stopRecording() {
  try {
    console.log('[Offscreen] 🛑 Stopping recording...');

    this.isRecording = false;

    // Stop chunk timer
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }

    // Stop MediaRecorder and get final chunk
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();

      // Wait for final ondataavailable
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Stop audio stream
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    console.log('[Offscreen] ✅ Recording stopped');
    return { success: true };

  } catch (error) {
    console.error('[Offscreen] ❌ Failed to stop recording:', error);
    return { success: false, error: error.message };
  }
}
```

**CRITICAL**: Stops timer, stops recorder, waits for final chunk to fire `ondataavailable`

---

## File 5: `/recording/recording-manager.js`

### Purpose
Orchestrates complete recording workflow: session creation, chunk queuing, upload management, transcription polling.

### Key Code Sections

#### Constructor & State
```javascript
class RecordingManager {
  constructor() {
    this.mediaRecorder = new MediaRecorderService();
    this.consultationId = null;
    this.sessionId = null;
    this.recordingToken = null;
    this.isActive = false;
    this.uploadQueue = [];
    this.isUploading = false;
    this.processedChunks = new Set(); // Track chunks we've already queued
  }
}
```

**KEY**: Uses `Set` to deduplicate chunks in case of duplicate messages

#### startRecording (Lines 20-83)
```javascript
async startRecording(patient) {
  try {
    console.log('🎬 Starting recording workflow for:', patient.name);

    // Reset state for new recording
    this.processedChunks.clear();
    this.uploadQueue = [];

    // Check browser support
    if (!MediaRecorderService.isSupported()) {
      throw new Error('Your browser does not support audio recording. Please use Chrome, Edge, or Firefox.');
    }

    // Step 1: Create consultation
    console.log('📝 Step 1: Creating consultation...');
    const consultationResult = await ConsultationService.createConsultation(patient);

    if (!consultationResult.success) {
      throw new Error(consultationResult.error || 'Failed to create consultation');
    }

    this.consultationId = consultationResult.consultation.id;
    console.log('✅ Consultation created:', this.consultationId);

    // Step 2: Create recording session
    console.log('🎤 Step 2: Creating recording session...');
    const sessionResult = await RecordingService.createSession(this.consultationId, {
      mode: 'summary'
    });

    if (!sessionResult.success) {
      throw new Error(sessionResult.error || 'Failed to create recording session');
    }

    this.sessionId = sessionResult.session.id;
    this.recordingToken = sessionResult.recordingToken;
    console.log('✅ Recording session created:', this.sessionId);

    // Step 3: Start MediaRecorder
    console.log('🎙️ Step 3: Starting MediaRecorder...');
    await this.mediaRecorder.startRecording((blob, duration, chunkNumber) => {
      this.handleChunk(blob, duration, chunkNumber);
    });

    this.isActive = true;
    console.log('✅ Recording started successfully!');

    return {
      success: true,
      consultationId: this.consultationId,
      sessionId: this.sessionId
    };

  } catch (error) {
    console.error('❌ Failed to start recording:', error);
    await this.cleanup();

    return {
      success: false,
      error: error.message
    };
  }
}
```

**CRITICAL FLOW**:
1. Create consultation via API
2. Create recording session via API (gets session ID + recording token)
3. Start MediaRecorder with callback pointing to `handleChunk`

#### handleChunk (Lines 85-117) - **DEDUPLICATION**
```javascript
handleChunk(blob, duration, chunkNumber) {
  console.log(`🔍 DEBUG handleChunk CALLED: chunk ${chunkNumber}, blob size ${blob?.size}, duration ${duration}`);
  console.log(`🔍 DEBUG: processedChunks size before:`, this.processedChunks.size);

  // DEDUPLICATION: Check if we've already queued this chunk
  if (this.processedChunks.has(chunkNumber)) {
    console.log(`⚠️ Ignoring duplicate chunk ${chunkNumber}`);
    return;
  }

  console.log(`📦 Received chunk ${chunkNumber}, adding to upload queue`);

  // Mark as processed
  this.processedChunks.add(chunkNumber);

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
```

**CRITICAL**: Uses `Set` to prevent duplicate chunk uploads

#### processUploadQueue (Lines 119-160)
```javascript
async processUploadQueue() {
  if (this.isUploading || this.uploadQueue.length === 0) {
    return;
  }

  this.isUploading = true;

  while (this.uploadQueue.length > 0) {
    const chunk = this.uploadQueue.shift();

    try {
      console.log(`📤 Uploading chunk ${chunk.chunkNumber}...`);

      const result = await RecordingService.uploadChunkWithRetry(
        this.sessionId,
        chunk.blob,
        chunk.chunkNumber,
        chunk.duration,
        this.recordingToken,
        3  // max retries
      );

      if (!result.success) {
        console.error(`❌ Failed to upload chunk ${chunk.chunkNumber}:`, result.error);
        // Re-add to queue for retry
        this.uploadQueue.unshift(chunk);
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`✅ Chunk ${chunk.chunkNumber} uploaded successfully`);
      }

    } catch (error) {
      console.error(`❌ Chunk ${chunk.chunkNumber} upload error:`, error);
    }
  }

  this.isUploading = false;
}
```

**KEY**: Sequential upload processing with retry on failure

#### stopRecording (Lines 186-281) - **CRITICAL FLOW**
```javascript
async stopRecording() {
  try {
    console.log('🛑 Stopping recording...');

    // Stop MediaRecorder
    await this.mediaRecorder.stopRecording();

    // CRITICAL: Wait for the final chunk to arrive and be processed
    console.log('⏳ Waiting for final chunk to arrive and upload...');

    // Track initial state
    const initialProcessedCount = this.processedChunks.size;
    let lastProcessedCount = initialProcessedCount;
    let noChangeCount = 0;
    let totalWait = 0;
    const maxWait = 5000; // 5 seconds max for chunk to arrive

    // Wait until we see at least one chunk arrive, or timeout
    while (totalWait < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 200));
      totalWait += 200;

      const currentProcessedCount = this.processedChunks.size;

      if (currentProcessedCount > lastProcessedCount) {
        console.log(`📦 Chunk arrived! Processed: ${currentProcessedCount}`);
        lastProcessedCount = currentProcessedCount;
        noChangeCount = 0;
      } else {
        noChangeCount++;
      }

      // If we've had a chunk arrive and no new chunks for 1 second, we're done
      if (currentProcessedCount > initialProcessedCount && noChangeCount >= 5) {
        console.log('✅ Final chunk arrived and stabilized');
        break;
      }
    }

    // Wait for all uploads to complete
    console.log('⏳ Waiting for all uploads to complete...');
    let attempts = 0;
    const maxAttempts = 30;  // 30 seconds max

    while ((this.uploadQueue.length > 0 || this.isUploading) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      console.log(`⏳ Upload queue: ${this.uploadQueue.length} chunks remaining, uploading: ${this.isUploading}`);
    }

    if (this.uploadQueue.length > 0) {
      console.warn(`⚠️ Timeout: ${this.uploadQueue.length} chunks not uploaded`);
    } else {
      console.log(`✅ All ${this.processedChunks.size} chunks uploaded`);
    }

    // CRITICAL: Poll for transcription completion before calling /complete
    // Backend transcribes chunks asynchronously in background
    console.log('⏳ Polling for transcription completion...');
    const transcriptionComplete = await this.waitForTranscription();

    if (!transcriptionComplete) {
      console.warn('⚠️ Transcription polling timeout, proceeding anyway');
    }

    // Complete session (triggers summary generation)
    console.log('🎯 Completing session...');
    const completeResult = await RecordingService.completeSession(this.sessionId);

    if (!completeResult.success) {
      throw new Error(completeResult.error || 'Failed to complete session');
    }

    console.log('✅ Session completed, summary generation started');

    const result = {
      success: true,
      consultationId: this.consultationId,
      sessionId: this.sessionId
    };

    // Cleanup
    await this.cleanup();

    return result;

  } catch (error) {
    console.error('❌ Failed to stop recording:', error);
    await this.cleanup();

    return {
      success: false,
      error: error.message
    };
  }
}
```

**CRITICAL FLOW**:
1. Stop MediaRecorder
2. Wait for final chunk to arrive (max 5 seconds)
3. Wait for upload queue to empty (max 30 seconds)
4. **Poll for transcription completion** (max 10 seconds)
5. Call `/complete` endpoint to trigger summary generation

#### waitForTranscription (Lines 287-336) - **POLLING IMPLEMENTATION**
```javascript
async waitForTranscription() {
  const maxAttempts = 10; // 10 seconds max
  const pollInterval = 1000; // Check every second

  for (let i = 0; i < maxAttempts; i++) {
    try {
      console.log(`🔍 Polling attempt ${i + 1}/${maxAttempts}...`);

      // Check chunks for this session
      const result = await RecordingService.getChunks(this.sessionId);

      console.log(`📊 Poll result:`, result);

      if (result.success && result.data) {
        const chunks = Array.isArray(result.data) ? result.data : result.data.chunks || [];

        console.log(`📦 Found ${chunks.length} chunks`);

        if (chunks.length === 0) {
          console.log(`⚠️ No chunks found yet, continuing to poll...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }

        const allTranscribed = chunks.every(chunk =>
          chunk.transcription_text && chunk.transcription_text.length > 0
        );

        console.log(`📝 Transcription status: ${chunks.filter(c => c.transcription_text).length}/${chunks.length} chunks transcribed`);

        if (allTranscribed) {
          console.log(`✅ All chunks transcribed after ${i + 1} seconds`);
          return true;
        }

        console.log(`⏳ Transcription in progress... (${i + 1}/${maxAttempts})`);
      } else {
        console.error(`❌ Failed to get chunks:`, result.error);
      }
    } catch (error) {
      console.error('❌ Error checking transcription status:', error);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  console.warn('⚠️ Transcription polling timeout after 10 seconds');
  return false;
}
```

**CRITICAL**: Polls GET `/recordings/sessions/:id/chunks` every 1 second for up to 10 seconds, checking if all chunks have `transcription_text` populated.

---

## File 6: `/api/recording.service.js`

### Purpose
API wrapper for all backend recording endpoints.

### createSession (Lines 11-59)
```javascript
static async createSession(consultationId, options = {}) {
  try {
    console.log('🎤 Creating recording session for consultation:', consultationId);

    const authHeaders = await TokenManager.getAuthHeaders();

    const response = await fetch(
      `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.CREATE_RECORDING_SESSION}`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          consultationId,
          mode: options.mode || 'summary',
          templateId: options.templateId || null
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Recording session creation failed:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to create recording session'
      };
    }

    console.log('✅ Recording session created:', data.data.session.id);
    console.log('🔑 Recording token received');

    return {
      success: true,
      session: data.data.session,
      recordingToken: data.data.recordingToken
    };

  } catch (error) {
    console.error('❌ Recording session creation error:', error);
    return {
      success: false,
      error: error.message || 'Network error'
    };
  }
}
```

**API**: `POST /recordings/sessions`
**Returns**: `{ session, recordingToken }`

### uploadChunk (Lines 61-120)
```javascript
static async uploadChunk(sessionId, audioBlob, chunkNumber, duration, recordingToken) {
  try {
    console.log(`📤 Uploading chunk ${chunkNumber}:`, {
      size: audioBlob.size,
      duration,
      type: audioBlob.type
    });

    const formData = new FormData();
    formData.append('audio', audioBlob, `chunk_${chunkNumber}.webm`);
    formData.append('chunkNumber', chunkNumber.toString());
    formData.append('sequenceOrder', chunkNumber.toString());
    formData.append('duration', duration.toString());
    formData.append('fileSize', audioBlob.size.toString());

    const response = await fetch(
      `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.UPLOAD_CHUNK(sessionId)}`,
      {
        method: 'POST',
        headers: {
          'x-recording-token': recordingToken
        },
        body: formData
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Chunk ${chunkNumber} upload failed:`, data.error);
      return {
        success: false,
        error: data.error || 'Failed to upload chunk'
      };
    }

    console.log(`✅ Chunk ${chunkNumber} uploaded:`, data.data.id);

    return {
      success: true,
      chunk: data.data
    };

  } catch (error) {
    console.error(`❌ Chunk ${chunkNumber} upload error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

**API**: `POST /recordings/sessions/:id/chunks`
**Headers**: `x-recording-token: <recordingToken>`
**Body**: FormData with audio file + metadata

### uploadChunkWithRetry (Lines 122-150)
```javascript
static async uploadChunkWithRetry(sessionId, audioBlob, chunkNumber, duration, recordingToken, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await this.uploadChunk(sessionId, audioBlob, chunkNumber, duration, recordingToken);

    if (result.success) {
      return result;
    }

    // If this was the last attempt, return the error
    if (attempt === maxRetries - 1) {
      return result;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, attempt) * 1000;
    console.warn(`⚠️ Retry ${attempt + 1}/${maxRetries} for chunk ${chunkNumber} after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

**RETRY LOGIC**: 3 attempts with exponential backoff (1s, 2s, 4s)

### completeSession (Lines 157-207) - **WITH RETRY**
```javascript
static async completeSession(sessionId, retries = 2) {
  try {
    console.log('✅ Completing recording session:', sessionId);

    const authHeaders = await TokenManager.getAuthHeaders();

    const response = await fetch(
      `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.COMPLETE_RECORDING(sessionId)}`,
      {
        method: 'POST',
        headers: authHeaders
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Session completion failed');
      console.error('❌ Status:', response.status);
      console.error('❌ Full response:', data);
      console.error('❌ Error message:', data.error);
      console.error('❌ Error details:', data.details);

      // Retry on 500 errors (backend issue)
      if (response.status === 500 && retries > 0) {
        console.log(`🔄 Retrying completion... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.completeSession(sessionId, retries - 1);
      }

      return {
        success: false,
        error: data.error || 'Failed to complete session'
      };
    }

    console.log('✅ Session completed:', data.data);
    console.log('🎯 Summary generation started in background');

    return {
      success: true,
      data: data.data
    };

  } catch (error) {
    console.error('❌ Session completion error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

**API**: `POST /recordings/sessions/:id/complete`
**RETRY LOGIC**: On 500 errors, retry up to 2 times with 1-second delay

### getChunks (Lines 215-248)
```javascript
static async getChunks(sessionId) {
  try {
    const authHeaders = await TokenManager.getAuthHeaders();

    const response = await fetch(
      `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GET_CHUNKS(sessionId)}`,
      {
        method: 'GET',
        headers: authHeaders
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to get chunks'
      };
    }

    return {
      success: true,
      data: data.data
    };

  } catch (error) {
    console.error('❌ Get chunks error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

**API**: `GET /recordings/sessions/:id/chunks`
**Returns**: `{ data: [chunks array] }` where each chunk has `transcription_text` field

---

## File 7: `/api/config.js`

### API Endpoints Configuration
```javascript
const CONFIG = {
  API_BASE_URL: 'https://brobyvets-backend-production.up.railway.app',

  ENDPOINTS: {
    // Recording endpoints
    CREATE_RECORDING_SESSION: '/recordings/sessions',
    UPLOAD_CHUNK: (sessionId) => `/recordings/sessions/${sessionId}/chunks`,
    COMPLETE_RECORDING: (sessionId) => `/recordings/sessions/${sessionId}/complete`,
    GET_CHUNKS: (sessionId) => `/recordings/sessions/${sessionId}/chunks`,

    // Consultation endpoints
    CREATE_CONSULTATION: '/consultations',
    // ... other endpoints
  }
};
```

---

## CRITICAL TIMING ISSUES & FIXES

### Issue #1: Callback Cleared Too Early
**Problem**: `media-recorder.service.js` was clearing `chunkCallback` immediately when `stopRecording()` was called, but the final chunk would arrive ~200-1000ms later.

**Fix**: Added 1-second wait before clearing callback (lines 126-131 in media-recorder.service.js)

### Issue #2: Backend Transcribes Asynchronously
**Problem**: Backend's `upload.service.ts:307` does:
```typescript
this.transcribeChunk(chunk.id, fileUrl, audioFile, 'web').catch(error => {
  // fire-and-forget pattern
});
```
Extension was calling `/complete` before transcription finished.

**Fix**: Added `waitForTranscription()` polling that checks chunk status every 1 second for up to 10 seconds before calling `/complete`.

### Issue #3: Backend Completion Fails with 500
**Problem**: Even with transcription complete (100%), `/complete` returns 500 "Failed to stop session".

**Fix**: Added retry logic with 2 retries and 1-second delays (lines 180-185 in recording.service.js)

---

## EXPECTED BACKEND BEHAVIOR (From Webapp Analysis)

### Chunk Upload Flow
1. Extension uploads chunk via `POST /recordings/sessions/:id/chunks`
2. Backend stores chunk in database
3. Backend uploads audio file to storage
4. **Backend starts transcription in background (fire-and-forget)**
5. Backend returns success immediately WITHOUT waiting for transcription

### Transcription Flow
1. Backend calls `transcribeChunk()` asynchronously
2. Uses Groq Whisper Large V3 Turbo (~32x real-time speed)
3. For 15-second chunk: transcription should take ~0.5 seconds
4. Backend updates chunk record with `transcription_text`

### Session Completion Flow
1. Extension calls `POST /recordings/sessions/:id/complete`
2. Backend should:
   - Verify all chunks are uploaded
   - Check transcription status
   - Generate summary from transcriptions
   - Return success

**CURRENT ISSUE**: Step 2 fails with 500 "Failed to stop session" despite transcription being complete.

---

## WHAT EXTENSION IS DOING RIGHT NOW

1. ✅ Creating consultation successfully
2. ✅ Creating recording session successfully
3. ✅ Recording audio in 15-second chunks
4. ✅ Uploading chunks to backend (with retry logic)
5. ✅ Backend transcribing chunks successfully (verified by logs showing 100% progress)
6. ✅ Polling for transcription completion
7. ❌ **Calling `/complete` fails with 500 error "Failed to stop session"**

---

## QUESTIONS FOR YOUR BACKEND ANALYSIS

1. **What does `stop.service.ts` do that could cause "Failed to stop session" error?**
   - Does it check something that extension isn't providing?
   - Does it require transcription to be 100% complete?
   - Does it try to update a database table that doesn't exist?

2. **Why does webapp's `/consultations/:id/complete` work but extension's `/recordings/sessions/:id/complete` fails?**
   - Different endpoints?
   - Different validation logic?
   - Different database state expectations?

3. **Does the polling timeout matter?**
   - Extension polls for 10 seconds, times out, but proceeds anyway
   - Logs show transcription IS complete (100%)
   - So timeout shouldn't matter, but does backend check something else?

4. **What's the difference between webapp's flow and extension's flow?**
   - Webapp: creates chunks → uploads → calls `/consultations/:id/complete`
   - Extension: creates chunks → uploads → calls `/recordings/sessions/:id/complete`
   - Are these different code paths in backend?
