/**
 * Summary Service with HTTP SSE Streaming
 * Matches web app pattern: Progressive HTTP streaming via Server-Sent Events
 * NO WEBSOCKET - Uses regular fetch() with ReadableStream
 */

class SummaryService {
  constructor() {
    this.isStreaming = false;
    this.currentConsultationId = null;
    this.accumulatedSummary = '';
    this.streamingCallbacks = {
      onChunk: null,
      onComplete: null,
      onError: null,
      onProgress: null
    };
  }

  /**
   * Generate summary with HTTP SSE streaming (matches web app)
   * @param {string} consultationId
   * @param {object} options - { onChunk, onComplete, onError, onProgress, templateId }
   * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
   */
  async generateSummary(consultationId, options = {}) {
    try {
      console.log('🤖 Generating summary with HTTP SSE streaming:', consultationId);

      // Store callbacks
      this.streamingCallbacks = {
        onChunk: options.onChunk || null,
        onComplete: options.onComplete || null,
        onError: options.onError || null,
        onProgress: options.onProgress || null
      };

      this.currentConsultationId = consultationId;
      this.accumulatedSummary = '';
      this.isStreaming = true;

      // Build endpoint URL with optional templateId
      const authHeaders = await TokenManager.getAuthHeaders();
      const endpoint = options.templateId
        ? `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GENERATE_SUMMARY_STREAM(consultationId)}?templateId=${options.templateId}`
        : `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GENERATE_SUMMARY_STREAM(consultationId)}`;

      console.log('📡 Triggering HTTP SSE streaming:', endpoint);

      // Make HTTP request (response will be streamed)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }

      console.log('✅ HTTP SSE stream started, reading response body...');

      // Get readable stream from response body
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      // Start reading stream
      await this.readStream(reader);

      return {
        success: true,
        message: 'Summary generation completed'
      };

    } catch (error) {
      console.error('❌ Generate summary error:', error);
      this.isStreaming = false;

      if (this.streamingCallbacks.onError) {
        this.streamingCallbacks.onError(error);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Read HTTP SSE stream and process chunks
   * @param {ReadableStreamDefaultReader} reader
   */
  async readStream(reader) {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('✅ HTTP SSE stream complete');
          this.handleComplete();
          break;
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (SSE format: "data: {json}\n")
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.replace('data: ', '').trim();

            // Check for completion signal
            if (data === '[DONE]') {
              console.log('✅ [DONE] signal received');
              this.handleComplete();
              return;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle content chunk
              if (parsed.content) {
                this.handleChunk(parsed.content);
              }

              // Handle correction event - replace with corrected text
              if (parsed.type === 'correction' && parsed.correctedText) {
                console.log('📤 Correction received, replacing text');
                this.accumulatedSummary = parsed.correctedText;
                if (this.streamingCallbacks.onChunk) {
                  this.streamingCallbacks.onChunk({
                    chunkText: '',
                    accumulated: this.accumulatedSummary,
                    progress: 1.0
                  });
                }
              }

              // Handle error
              if (parsed.error) {
                console.error('❌ Stream error:', parsed.error);
                throw new Error(parsed.error);
              }

            } catch (parseError) {
              // Skip malformed data
              console.warn('⚠️ Skipping malformed SSE data:', data);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Stream reading error:', error);
      this.isStreaming = false;
      if (this.streamingCallbacks.onError) {
        this.streamingCallbacks.onError(error);
      }
    }
  }

  /**
   * Handle incoming summary chunk
   * @param {string} chunkText
   */
  handleChunk(chunkText) {
    console.log('📝 Summary chunk received:', chunkText.length, 'chars');

    // Accumulate chunk
    this.accumulatedSummary += chunkText;

    // Estimate progress based on accumulated text length
    // Typical summary: 300-600 chars, use 500 as target for 100%
    const estimatedProgress = Math.min(0.95, this.accumulatedSummary.length / 500);

    // Call chunk callback
    if (this.streamingCallbacks.onChunk) {
      this.streamingCallbacks.onChunk({
        chunkText: chunkText,
        accumulated: this.accumulatedSummary,
        progress: estimatedProgress
      });
    }

    // Call progress callback
    if (this.streamingCallbacks.onProgress) {
      this.streamingCallbacks.onProgress(estimatedProgress);
    }
  }

  /**
   * Handle summary completion
   */
  handleComplete() {
    console.log('✅ Summary complete:', {
      consultationId: this.currentConsultationId,
      summaryLength: this.accumulatedSummary.length
    });

    this.isStreaming = false;

    // Call complete callback
    if (this.streamingCallbacks.onComplete) {
      this.streamingCallbacks.onComplete({
        summary: this.accumulatedSummary,
        accumulated: this.accumulatedSummary
      });
    }

    // Reset state
    this.currentConsultationId = null;
    this.accumulatedSummary = '';
  }

  /**
   * Cancel streaming
   */
  cancelStreaming() {
    if (this.isStreaming && this.currentConsultationId) {
      console.log('🛑 Canceling summary streaming');
      this.isStreaming = false;
      this.currentConsultationId = null;
      this.accumulatedSummary = '';
    }
  }

  /**
   * Get current streaming status
   * @returns {{isStreaming: boolean, consultationId: string|null, progress: string}}
   */
  getStatus() {
    return {
      isStreaming: this.isStreaming,
      consultationId: this.currentConsultationId,
      accumulatedLength: this.accumulatedSummary.length
    };
  }

  /**
   * Fallback: Poll for summary (for backwards compatibility)
   * Use this only if HTTP streaming fails
   * @param {string} consultationId
   * @param {object} options - { maxAttempts, intervalMs, onProgress }
   * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
   */
  async pollForSummary(consultationId, options = {}) {
    const maxAttempts = options.maxAttempts || 30;
    const intervalMs = options.intervalMs || 1000;
    const onProgress = options.onProgress || null;

    console.log('🔄 Starting summary polling (fallback):', {
      consultationId,
      maxAttempts,
      intervalMs
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (onProgress) {
          onProgress(attempt, maxAttempts);
        }

        console.log(`📡 Polling attempt ${attempt}/${maxAttempts}`);

        const result = await ConsultationService.getConsultation(consultationId);

        if (!result.success) {
          console.error('❌ Failed to fetch consultation:', result.error);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
          continue;
        }

        const consultation = result.consultation;

        // Check if summary is ready
        if (consultation.ai_summary && consultation.ai_summary.trim()) {
          console.log('✅ Summary ready via polling!', {
            attempt,
            summaryLength: consultation.ai_summary.length
          });

          return {
            success: true,
            summary: consultation.ai_summary,
            transcript: consultation.full_transcript
          };
        }

        console.log(`⏳ Summary not ready yet (attempt ${attempt}/${maxAttempts})`);

        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

      } catch (error) {
        console.error(`❌ Polling error on attempt ${attempt}:`, error);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }

    console.warn('⚠️ Summary polling timed out');
    return {
      success: false,
      error: 'Summary generation timed out'
    };
  }
}

// Create singleton instance
const summaryService = new SummaryService();

// Make available globally
if (typeof window !== 'undefined') {
  window.SummaryService = SummaryService;
  window.summaryService = summaryService;
}
