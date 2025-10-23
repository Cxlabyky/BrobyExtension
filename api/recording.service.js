// Recording Service
// Handles recording session management and API calls

class RecordingService {
  /**
   * Create a new recording session
   * @param {string} consultationId
   * @param {object} options - { mode: 'summary', templateId: null }
   * @returns {Promise<{success: boolean, session?: object, recordingToken?: string, error?: string}>}
   */
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

  /**
   * Upload a single audio chunk
   * @param {string} sessionId
   * @param {Blob} audioBlob
   * @param {number} chunkNumber
   * @param {number} duration - in seconds
   * @param {string} recordingToken
   * @returns {Promise<{success: boolean, chunk?: object, error?: string}>}
   */
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

  /**
   * Upload chunk with retry logic
   * @param {string} sessionId
   * @param {Blob} audioBlob
   * @param {number} chunkNumber
   * @param {number} duration
   * @param {string} recordingToken
   * @param {number} maxRetries
   * @returns {Promise<{success: boolean, chunk?: object, error?: string}>}
   */
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

  /**
   * Complete recording session (triggers summary generation)
   * @param {string} sessionId
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  static async completeSession(sessionId) {
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
        console.error('❌ Session completion failed:', data.error);
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

  /**
   * Get chunks for a session (with transcription progress)
   * @param {string} sessionId
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
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
}

// Make RecordingService available globally
if (typeof window !== 'undefined') {
  window.RecordingService = RecordingService;
}
