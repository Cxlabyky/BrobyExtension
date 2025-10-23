// MediaRecorder Service (Offscreen Version) - VERSION 2.0
// Communicates with offscreen document for audio capture

class MediaRecorderService {
  constructor() {
    console.log('🎤 MediaRecorderService constructor - VERSION 2.0 (OFFSCREEN)');
    this.chunkCallback = null;
    this.isActive = false;
    this.setupMessageListener();
  }

  /**
   * Setup message listener for audio chunks from offscreen document
   */
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

      if (message.type === 'RECORDING_ERROR') {
        console.error('❌ Recording error from offscreen:', message.error);
        // Cleanup on error
        this.isActive = false;
      }
    });
  }

  /**
   * Check browser support for MediaRecorder
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /**
   * Start recording
   */
  async startRecording(onChunkReady) {
    try {
      console.log('🎤 Starting recording via offscreen document...');

      this.chunkCallback = onChunkReady;

      // Create offscreen document if needed
      console.log('📝 Step 1: Creating offscreen document...');
      const createResult = await chrome.runtime.sendMessage({ type: 'CREATE_OFFSCREEN' });
      console.log('📝 Create offscreen result:', createResult);

      // Tell offscreen document to start recording
      console.log('📝 Step 2: Sending START_RECORDING message...');
      const response = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
      console.log('📝 Start recording response:', response);

      if (!response || !response.success) {
        const errorMsg = response?.error || 'No response from offscreen document';
        console.error('❌ Recording failed:', errorMsg);
        throw new Error(errorMsg);
      }

      this.isActive = true;
      console.log('✅ Recording started via offscreen document');

    } catch (error) {
      console.error('❌ Failed to start recording (full error):', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Stop recording
   */
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

      // CRITICAL: Don't clear callback immediately - final chunk may still arrive!
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

  /**
   * Pause recording
   */
  pauseRecording() {
    if (this.isActive) {
      chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' });
      console.log('⏸️ Recording paused');
    }
  }

  /**
   * Resume recording
   */
  resumeRecording() {
    if (this.isActive) {
      chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
      console.log('▶️ Recording resumed');
    }
  }

  /**
   * Check if currently recording
   */
  isRecording() {
    return this.isActive;
  }

  /**
   * Check if paused (not available in offscreen mode)
   */
  isPaused() {
    // Would need to query offscreen document state
    return false;
  }

  /**
   * Get current recording state
   */
  getState() {
    return this.isActive ? 'recording' : 'inactive';
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.isActive) {
      await this.stopRecording();
    }

    this.chunkCallback = null;
    this.isActive = false;

    // Close offscreen document
    await chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' });

    console.log('🧹 MediaRecorder cleaned up');
  }
}

// Make MediaRecorderService available globally
if (typeof window !== 'undefined') {
  window.MediaRecorderService = MediaRecorderService;
}
