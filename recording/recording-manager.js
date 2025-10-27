// Recording Manager - REWRITTEN TO MATCH WEB APP
// Multi-Consultation Support with Map-based State Management
// Matches: BrobyVets/frontend/services/recording/RecordingManager.ts

/**
 * Full consultation session state
 * Tracks everything needed to pause/resume/switch consultations independently
 */
class ConsultationSession {
  constructor(consultationId, sessionId, templateId = null) {
    this.consultationId = consultationId;
    this.sessionId = sessionId;
    this.startTime = 0; // Will be set after permission granted
    this.pausedDuration = 0; // Accumulated paused time in milliseconds
    this.lastPauseTime = null;
    this.status = 'recording'; // 'recording' | 'paused' | 'stopped'
    this.transcription = ''; // Accumulated transcription
    this.partialTranscript = ''; // WebSocket streaming partial transcript
    this.templateId = templateId; // Template selected for this recording
    this.lastUpdated = Date.now(); // For staleness detection
    this.recordingToken = null; // Recording token for uploads
  }
}

/**
 * PROPER Multi-Consultation Recording Manager
 *
 * KEY FEATURES:
 * - Tracks multiple consultations independently in a Map
 * - Each consultation maintains its own state (recording/paused/stopped)
 * - Timer continues from where it left off when resuming
 * - No data loss - all transcription, duration preserved per consultation
 * - Can switch between consultations freely
 * - Chrome storage persistence across extension reloads
 */
class RecordingManager {
  constructor() {
    // PROPER STATE: Map of consultationId -> full session state
    this.sessions = new Map();

    // Current active consultation (the one actually recording NOW)
    this.activeConsultationId = null;

    // MediaRecorder service
    this.mediaRecorder = new MediaRecorderService();

    // Upload queue management
    this.uploadQueue = [];
    this.isUploading = false;
    this.processedChunks = new Set(); // Track chunks we've already queued

    console.log('[RecordingManager] ✅ Initialized with Map-based multi-consultation state');

    // Restore from chrome.storage on initialization
    setTimeout(() => this.restoreFromStorage(), 0);
  }

  /**
   * Activate a session (change status from pending to active)
   */
  async activateSession(sessionId) {
    try {
      const result = await RecordingService.updateSessionStatus(sessionId, 'active');

      if (result.success) {
        console.log('[RecordingManager] Session activated:', sessionId);
      } else {
        console.warn('[RecordingManager] Failed to activate session:', result.error);
      }
    } catch (error) {
      console.error('[RecordingManager] Failed to activate session:', error);
      // Continue anyway - session might already be active
    }
  }

  /**
   * Start recording for a consultation
   * - If consultation exists and is paused, resume it
   * - If consultation is new, create fresh session
   * - If actively recording different consultation, pause it first
   */
  async startRecording(patient, templateId = null) {
    try {
      console.log(`[RecordingManager] 🎬 Starting recording for patient: ${patient.name}`);

      // Check if already recording this consultation
      const existingSession = this.sessions.get(patient.id);
      if (existingSession && existingSession.status === 'recording') {
        console.log('[RecordingManager] Already recording this consultation');
        return {
          success: true,
          consultationId: existingSession.consultationId,
          sessionId: existingSession.sessionId
        };
      }

      // If actively recording a DIFFERENT consultation, pause it first
      if (this.activeConsultationId && this.activeConsultationId !== patient.id) {
        console.log(`[RecordingManager] ⏸️ Auto-pausing active consultation: ${this.activeConsultationId}`);
        await this.pauseRecording();
      }

      let sessionState;

      if (existingSession && existingSession.status === 'paused') {
        // RESUME: Existing paused session
        console.log('[RecordingManager] 📂 Resuming paused session');
        sessionState = existingSession;

        // Calculate and add the pause duration before resuming
        if (sessionState.lastPauseTime) {
          const pauseDuration = Date.now() - sessionState.lastPauseTime;
          sessionState.pausedDuration += pauseDuration;
          console.log(`[RecordingManager] Added ${Math.round(pauseDuration / 1000)}s of pause time`);
        }

        sessionState.status = 'recording';
        sessionState.lastPauseTime = null;
        sessionState.lastUpdated = Date.now();
      } else {
        // NEW: Create fresh consultation and session
        console.log('[RecordingManager] 📝 Creating new consultation...');
        const consultationResult = await ConsultationService.createConsultation(patient);

        if (!consultationResult.success) {
          throw new Error(consultationResult.error || 'Failed to create consultation');
        }

        const consultationId = consultationResult.consultation.id;
        console.log('[RecordingManager] ✅ Consultation created:', consultationId);

        // Create recording session
        console.log('[RecordingManager] 🎤 Creating recording session...');
        const sessionResult = await RecordingService.createSession(consultationId, {
          mode: 'summary',
          templateId
        });

        if (!sessionResult.success) {
          throw new Error(sessionResult.error || 'Failed to create recording session');
        }

        sessionState = new ConsultationSession(
          consultationId,
          sessionResult.session.id,
          templateId
        );
        sessionState.recordingToken = sessionResult.recordingToken;

        this.sessions.set(patient.id, sessionState);
        console.log(`[RecordingManager] ✅ Created new session: ${sessionResult.session.id}`);
      }

      // Activate the session in backend
      await this.activateSession(sessionState.sessionId);

      // Reset upload tracking for this session
      this.processedChunks.clear();
      this.uploadQueue = [];

      // Start the actual recording (includes microphone permission request)
      await this.mediaRecorder.startRecording((blob, duration, chunkNumber) => {
        this.handleChunk(sessionState.sessionId, sessionState.recordingToken, blob, duration, chunkNumber);
      });

      // NOW set the actual start time (after permission granted)
      // For resumed sessions, keep original start time
      if (sessionState.startTime === 0) {
        sessionState.startTime = Date.now();
      }

      this.activeConsultationId = patient.id;

      console.log(`[RecordingManager] ✅ Recording started: ${patient.name}, duration: ${this.getDurationFor(patient.id)}s`);

      this.saveToStorage();

      return {
        success: true,
        consultationId: sessionState.consultationId,
        sessionId: sessionState.sessionId
      };

    } catch (error) {
      console.error('[RecordingManager] ❌ Failed to start recording:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Pause current recording
   * - Session stays in Map as 'paused'
   * - Timer stops but accumulated time is preserved
   * - Can be resumed later
   */
  async pauseRecording() {
    try {
      if (!this.activeConsultationId) {
        console.log('[RecordingManager] No active recording to pause');
        return { success: false };
      }

      const session = this.sessions.get(this.activeConsultationId);
      if (!session || session.status !== 'recording') {
        console.log('[RecordingManager] Session not in recording state');
        return { success: false };
      }

      await this.mediaRecorder.pauseRecording();

      session.status = 'paused';
      session.lastPauseTime = Date.now();
      session.lastUpdated = Date.now();

      const patientId = this.activeConsultationId;
      const currentDuration = this.getDurationFor(patientId);

      console.log(`[RecordingManager] ⏸️ Paused: ${patientId}, duration: ${currentDuration}s`);

      this.activeConsultationId = null; // No longer actively recording
      this.saveToStorage();

      return { success: true };

    } catch (error) {
      console.error('[RecordingManager] Pause failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume recording (alias for startRecording on paused session)
   */
  async resumeRecording() {
    // Find the paused session
    for (const [patientId, session] of this.sessions) {
      if (session.status === 'paused') {
        // Use startRecording which handles resume properly
        // Need to reconstruct patient object from session
        const patient = { id: patientId, name: 'Patient' }; // Minimal patient object
        return this.startRecording(patient);
      }
    }

    console.log('[RecordingManager] No paused recording to resume');
    return { success: false };
  }

  /**
   * Stop recording and mark session as completed
   * - Session removed from Map
   * - Timer stops and data is finalized
   */
  async stopRecording() {
    try {
      if (!this.activeConsultationId) {
        console.log('[RecordingManager] No active recording to stop');
        return { success: false };
      }

      const session = this.sessions.get(this.activeConsultationId);
      if (!session) {
        console.log('[RecordingManager] Session not found');
        return { success: false };
      }

      const patientId = this.activeConsultationId;

      console.log('[RecordingManager] 🛑 Stopping recording...');

      // Stop MediaRecorder
      await this.mediaRecorder.stopRecording();

      // CRITICAL: Wait for the final chunk to arrive and be processed
      console.log('[RecordingManager] ⏳ Waiting for final chunk...');
      await this.waitForFinalChunk();

      // Wait for all uploads to complete
      console.log('[RecordingManager] ⏳ Waiting for uploads to complete...');
      await this.waitForUploadsComplete();

      // Calculate total duration
      const totalDurationSeconds = this.getDurationFor(patientId);
      console.log(`[RecordingManager] 📊 Total recording duration: ${totalDurationSeconds} seconds`);

      // CRITICAL: Update session status to 'completed' BEFORE calling /complete
      // This prevents backend cleanup logic from deleting the session
      console.log('[RecordingManager] 📊 Updating session status to completed...');
      const updateResult = await RecordingService.updateSessionStatus(
        session.sessionId,
        'completed'
      );

      if (!updateResult.success) {
        console.warn('[RecordingManager] ⚠️ Failed to update session status:', updateResult.error);
      } else {
        console.log('[RecordingManager] ✅ Session marked as completed');
      }

      // Complete consultation (triggers summary generation)
      console.log('[RecordingManager] 🎯 Completing consultation...');
      const completeResult = await ConsultationService.completeConsultation(
        session.consultationId
      );

      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete consultation');
      }

      console.log('[RecordingManager] ✅ Consultation completed');

      // Mark as stopped and remove from Map
      session.status = 'stopped';
      session.lastUpdated = Date.now();
      this.sessions.delete(patientId);

      this.activeConsultationId = null;

      console.log(`[RecordingManager] 🛑 Stopped: ${patientId}`);

      this.saveToStorage();

      return {
        success: true,
        consultationId: session.consultationId,
        sessionId: session.sessionId
      };

    } catch (error) {
      console.error('[RecordingManager] ❌ Failed to stop recording:', error);
      await this.cleanup();
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for final chunk to arrive
   */
  async waitForFinalChunk() {
    const initialProcessedCount = this.processedChunks.size;
    let lastProcessedCount = initialProcessedCount;
    let noChangeCount = 0;
    let totalWait = 0;
    const maxWait = 5000; // 5 seconds max

    while (totalWait < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 200));
      totalWait += 200;

      const currentProcessedCount = this.processedChunks.size;

      if (currentProcessedCount > lastProcessedCount) {
        console.log(`[RecordingManager] 📦 Chunk arrived! Processed: ${currentProcessedCount}`);
        lastProcessedCount = currentProcessedCount;
        noChangeCount = 0;
      } else {
        noChangeCount++;
      }

      // If we've had a chunk arrive and no new chunks for 1 second, we're done
      if (currentProcessedCount > initialProcessedCount && noChangeCount >= 5) {
        console.log('[RecordingManager] ✅ Final chunk arrived and stabilized');
        break;
      }
    }
  }

  /**
   * Wait for all uploads to complete
   */
  async waitForUploadsComplete() {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    while ((this.uploadQueue.length > 0 || this.isUploading) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      console.log(`[RecordingManager] ⏳ Upload queue: ${this.uploadQueue.length} chunks remaining`);
    }

    if (this.uploadQueue.length > 0) {
      console.warn(`[RecordingManager] ⚠️ Timeout: ${this.uploadQueue.length} chunks not uploaded`);
    } else {
      console.log(`[RecordingManager] ✅ All ${this.processedChunks.size} chunks uploaded`);
    }
  }

  /**
   * Switch to different consultation
   * - Pauses current recording (if any)
   * - Doesn't automatically start new recording
   */
  async switchToConsultation(patientId) {
    try {
      // If switching to same consultation, do nothing
      if (this.activeConsultationId === patientId) {
        return { success: true };
      }

      // Pause current recording instead of stopping it
      if (this.activeConsultationId) {
        await this.pauseRecording();
      }

      // Don't automatically start recording - just switch context
      // User must press play button to start recording
      return { success: true };

    } catch (error) {
      console.error('[RecordingManager] Failed to switch consultation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get duration for a specific consultation (in seconds)
   */
  getDurationFor(patientId) {
    const session = this.sessions.get(patientId);
    if (!session) return 0;

    const currentTime = Date.now();
    const totalElapsed = currentTime - session.startTime;
    let pausedTime = session.pausedDuration;

    // If currently paused, add the current pause duration
    if (session.status === 'paused' && session.lastPauseTime) {
      const currentPauseDuration = currentTime - session.lastPauseTime;
      pausedTime += currentPauseDuration;
    }

    // Duration is total time minus paused time
    const durationMs = totalElapsed - pausedTime;
    return Math.max(0, Math.round(durationMs / 1000));
  }

  /**
   * Handle a new audio chunk
   */
  handleChunk(sessionId, recordingToken, blob, duration, chunkNumber) {
    console.log(`[RecordingManager] 📦 Received chunk ${chunkNumber}`);

    // DEDUPLICATION: Check if we've already queued this chunk
    if (this.processedChunks.has(chunkNumber)) {
      console.log(`[RecordingManager] ⚠️ Ignoring duplicate chunk ${chunkNumber}`);
      return;
    }

    // Mark as processed
    this.processedChunks.add(chunkNumber);

    // Add to upload queue
    this.uploadQueue.push({
      sessionId,
      recordingToken,
      blob,
      duration,
      chunkNumber
    });

    // Start processing queue if not already uploading
    if (!this.isUploading) {
      this.processUploadQueue();
    }
  }

  /**
   * Process the upload queue
   */
  async processUploadQueue() {
    if (this.isUploading || this.uploadQueue.length === 0) {
      return;
    }

    this.isUploading = true;

    while (this.uploadQueue.length > 0) {
      const chunk = this.uploadQueue.shift();

      try {
        console.log(`[RecordingManager] 📤 Uploading chunk ${chunk.chunkNumber}...`);

        const result = await RecordingService.uploadChunkWithRetry(
          chunk.sessionId,
          chunk.blob,
          chunk.chunkNumber,
          chunk.duration,
          chunk.recordingToken,
          3 // max retries
        );

        if (!result.success) {
          console.error(`[RecordingManager] ❌ Failed to upload chunk ${chunk.chunkNumber}:`, result.error);
          // Re-add to queue for retry
          this.uploadQueue.unshift(chunk);
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log(`[RecordingManager] ✅ Chunk ${chunk.chunkNumber} uploaded`);
        }

      } catch (error) {
        console.error(`[RecordingManager] ❌ Chunk ${chunk.chunkNumber} upload error:`, error);
      }
    }

    this.isUploading = false;
  }

  /**
   * Check if recording specific consultation
   */
  isRecordingConsultation(patientId) {
    const session = this.sessions.get(patientId);
    return session?.status === 'recording' && this.activeConsultationId === patientId;
  }

  /**
   * Check if paused on specific consultation
   */
  isPausedOnConsultation(patientId) {
    const session = this.sessions.get(patientId);
    return session?.status === 'paused';
  }

  /**
   * Get all paused sessions
   */
  getPausedSessions() {
    const paused = [];
    for (const [patientId, session] of this.sessions) {
      if (session.status === 'paused') {
        paused.push({
          patientId,
          consultationId: session.consultationId,
          sessionId: session.sessionId,
          duration: this.getDurationFor(patientId),
          pausedAt: session.lastPauseTime
        });
      }
    }
    return paused;
  }

  /**
   * Save ALL sessions to chrome.storage (not just one)
   */
  async saveToStorage() {
    try {
      const sessionsData = {
        sessions: Array.from(this.sessions.entries()).map(([patientId, session]) => ({
          patientId,
          consultationId: session.consultationId,
          sessionId: session.sessionId,
          startTime: session.startTime,
          pausedDuration: session.pausedDuration,
          lastPauseTime: session.lastPauseTime,
          status: session.status,
          transcription: session.transcription,
          partialTranscript: session.partialTranscript,
          templateId: session.templateId,
          recordingToken: session.recordingToken
        })),
        activeConsultationId: this.activeConsultationId,
        lastSaved: Date.now()
      };

      await chrome.storage.local.set({ recordingSessions: sessionsData });
      console.log(`[RecordingManager] 💾 Saved ${sessionsData.sessions.length} sessions to storage`);

    } catch (error) {
      console.error('[RecordingManager] Failed to save to storage:', error);
    }
  }

  /**
   * Restore ALL sessions from chrome.storage
   */
  async restoreFromStorage() {
    try {
      const result = await chrome.storage.local.get('recordingSessions');

      if (!result.recordingSessions) {
        return;
      }

      const sessionsData = result.recordingSessions;

      // Check if saved sessions are recent (within last 24 hours)
      const currentTime = Date.now();
      const hoursSinceLastSaved = (currentTime - sessionsData.lastSaved) / (1000 * 60 * 60);

      if (hoursSinceLastSaved > 24) {
        await chrome.storage.local.remove('recordingSessions');
        return;
      }

      // Restore all sessions
      for (const sessionData of sessionsData.sessions) {
        const session = new ConsultationSession(
          sessionData.consultationId,
          sessionData.sessionId,
          sessionData.templateId
        );

        session.startTime = sessionData.startTime;
        session.pausedDuration = sessionData.pausedDuration;
        session.lastPauseTime = sessionData.lastPauseTime;
        session.status = 'paused'; // Always restore as paused
        session.transcription = sessionData.transcription || '';
        session.partialTranscript = sessionData.partialTranscript;
        session.recordingToken = sessionData.recordingToken;
        session.lastUpdated = currentTime;

        this.sessions.set(sessionData.patientId, session);
      }

      console.log(`[RecordingManager] 📂 Restored ${this.sessions.size} sessions from storage`);

    } catch (error) {
      console.error('[RecordingManager] Failed to restore from storage:', error);
      await chrome.storage.local.remove('recordingSessions');
    }
  }

  /**
   * Clear storage (called when user submits)
   */
  async clearStorage() {
    try {
      await chrome.storage.local.remove('recordingSessions');
      console.log('[RecordingManager] 🗑️ Storage cleared');
    } catch (error) {
      console.warn('[RecordingManager] ⚠️ Failed to clear storage:', error);
    }
  }

  /**
   * Check if recording is active
   */
  isRecordingActive() {
    return this.activeConsultationId !== null && this.mediaRecorder.isRecording();
  }

  /**
   * Check if recording is paused
   */
  isRecordingPaused() {
    return this.mediaRecorder.isPaused();
  }

  /**
   * Get recording state
   */
  getRecordingState() {
    return this.mediaRecorder.getState();
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.mediaRecorder.cleanup();
    this.uploadQueue = [];
    this.isUploading = false;
    this.processedChunks.clear();
    console.log('[RecordingManager] 🧹 RecordingManager cleaned up');
  }
}

// Make RecordingManager available globally
if (typeof window !== 'undefined') {
  window.RecordingManager = RecordingManager;
}
