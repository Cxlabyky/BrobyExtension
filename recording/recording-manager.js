// Recording Manager
// Orchestrates the complete recording workflow

class RecordingManager {
  constructor() {
    this.mediaRecorder = new MediaRecorderService();
    this.consultationId = null;
    this.sessionId = null;
    this.recordingToken = null;
    this.isActive = false;
    this.uploadQueue = [];
    this.isUploading = false;
  }

  /**
   * Start recording for a patient
   * @param {object} patient - Patient information
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startRecording(patient) {
    try {
      console.log('🎬 Starting recording workflow for:', patient.name);

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

  /**
   * Handle a new audio chunk
   * @param {Blob} blob
   * @param {number} duration
   * @param {number} chunkNumber
   */
  handleChunk(blob, duration, chunkNumber) {
    console.log(`📦 Received chunk ${chunkNumber}, adding to upload queue`);

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

  /**
   * Pause recording
   */
  pauseRecording() {
    if (this.mediaRecorder.isRecording()) {
      this.mediaRecorder.pauseRecording();
      console.log('⏸️ Recording paused');
    }
  }

  /**
   * Resume recording
   */
  resumeRecording() {
    if (this.mediaRecorder.isPaused()) {
      this.mediaRecorder.resumeRecording();
      console.log('▶️ Recording resumed');
    }
  }

  /**
   * Stop recording and complete session
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async stopRecording() {
    try {
      console.log('🛑 Stopping recording...');

      // Stop MediaRecorder
      await this.mediaRecorder.stopRecording();

      // Wait for all uploads to complete
      console.log('⏳ Waiting for all uploads to complete...');
      let attempts = 0;
      const maxAttempts = 30;  // 30 seconds max

      while (this.uploadQueue.length > 0 && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        console.log(`⏳ Upload queue: ${this.uploadQueue.length} chunks remaining...`);
      }

      if (this.uploadQueue.length > 0) {
        console.warn(`⚠️ Timeout: ${this.uploadQueue.length} chunks not uploaded`);
      } else {
        console.log('✅ All chunks uploaded');
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

  /**
   * Check if recording is active
   * @returns {boolean}
   */
  isRecordingActive() {
    return this.isActive && this.mediaRecorder.isRecording();
  }

  /**
   * Check if recording is paused
   * @returns {boolean}
   */
  isRecordingPaused() {
    return this.isActive && this.mediaRecorder.isPaused();
  }

  /**
   * Get recording state
   * @returns {string}
   */
  getRecordingState() {
    return this.mediaRecorder.getState();
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.mediaRecorder.cleanup();
    this.consultationId = null;
    this.sessionId = null;
    this.recordingToken = null;
    this.isActive = false;
    this.uploadQueue = [];
    this.isUploading = false;
    console.log('🧹 RecordingManager cleaned up');
  }
}

// Make RecordingManager available globally
if (typeof window !== 'undefined') {
  window.RecordingManager = RecordingManager;
}
