// Consultation Service
// Handles consultation creation and management

class ConsultationService {
  /**
   * Create a new consultation for the current patient
   * @param {object} patient - Patient information
   * @returns {Promise<{success: boolean, consultation?: object, error?: string}>}
   */
  static async createConsultation(patient) {
    try {
      console.log('📝 Creating consultation for:', patient.name);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.CONSULTATIONS}`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patient_name: patient.name,
          patient_id: patient.id,
          species: patient.species,
          visit_date: new Date().toISOString(),
          status: 'in_progress'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Consultation creation failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to create consultation'
        };
      }

      console.log('✅ Consultation created:', data.data.id);

      return {
        success: true,
        consultation: data.data
      };

    } catch (error) {
      console.error('❌ Consultation creation error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Get consultation by ID
   * @param {string} consultationId
   * @returns {Promise<{success: boolean, consultation?: object, error?: string}>}
   */
  static async getConsultation(consultationId) {
    try {
      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.CONSULTATION_BY_ID(consultationId)}`,
        {
          method: 'GET',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to get consultation'
        };
      }

      return {
        success: true,
        consultation: data.data
      };

    } catch (error) {
      console.error('❌ Get consultation error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Update consultation status
   * @param {string} consultationId
   * @param {string} status - 'in_progress', 'completed', etc.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async updateConsultationStatus(consultationId, status) {
    try {
      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.CONSULTATION_BY_ID(consultationId)}`,
        {
          method: 'PATCH',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to update consultation'
        };
      }

      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Update consultation error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Generate AI summary for consultation (NON-STREAMING - legacy)
   * @param {string} consultationId
   * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
   */
  static async generateSummary(consultationId) {
    try {
      console.log('🤖 TRIGGER: Generating AI summary for consultation:', consultationId);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GENERATE_SUMMARY(consultationId)}`,
        {
          method: 'POST',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Summary generation failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to generate summary'
        };
      }

      console.log('✅ Summary generated:', data.data?.summary?.length, 'characters');

      return {
        success: true,
        summary: data.data.summary
      };

    } catch (error) {
      console.error('❌ Summary generation error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Generate AI summary with STREAMING (matches web app implementation)
   * Uses Server-Sent Events (SSE) for real-time progressive updates
   * @param {string} consultationId
   * @param {function(string): void} onStreamUpdate - Callback for progressive text updates
   * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
   */
  static async generateSummaryStream(consultationId, onStreamUpdate) {
    const startTime = Date.now();

    try {
      console.log('🎬 Starting STREAMING summary generation for:', consultationId);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.GENERATE_SUMMARY_STREAM(consultationId)}`,
        {
          method: 'POST',
          headers: authHeaders
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Streaming summary generation failed:', errorData.error);
        return {
          success: false,
          error: errorData.error || `HTTP error! status: ${response.status}`
        };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullSummary = '';

      // Read stream chunks
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          const duration = Date.now() - startTime;
          console.log('✅ Stream complete', {
            consultationId,
            summaryLength: fullSummary.length,
            duration: `${duration}ms`
          });
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
              console.log('✅ Summary generation complete (DONE signal)', { consultationId });
              break;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle content chunk - progressive text building
              if (parsed.content) {
                fullSummary += parsed.content;
                if (onStreamUpdate) {
                  onStreamUpdate(fullSummary); // Update UI progressively
                }
              }

              // Handle correction event - replace displayed text with corrected version
              if (parsed.type === 'correction' && parsed.correctedText) {
                console.log('📤 Received correction event', {
                  consultationId,
                  originalLength: fullSummary.length,
                  correctedLength: parsed.correctedText.length
                });
                fullSummary = parsed.correctedText;
                if (onStreamUpdate) {
                  onStreamUpdate(fullSummary); // Update UI with corrected text
                }
              }

              // Handle error event
              if (parsed.type === 'error') {
                console.error('❌ Stream error event:', parsed.message);
                throw new Error(parsed.message || 'Stream error');
              }

            } catch (parseError) {
              // Ignore non-JSON lines (keep-alive pings, etc.)
              if (data && data !== ':keep-alive') {
                console.warn('⚠️ Failed to parse SSE data:', data, parseError);
              }
            }
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log('✅ Streaming summary generated:', fullSummary.length, 'characters in', duration, 'ms');

      return {
        success: true,
        summary: fullSummary
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Streaming summary generation error:', error, `(${duration}ms)`);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Complete consultation (triggers summary generation)
   * Matches webapp's POST /consultations/:id/complete
   * @param {string} consultationId
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  static async completeConsultation(consultationId) {
    try {
      console.log('🎯 Completing consultation:', consultationId);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}/consultations/${consultationId}/complete`,
        {
          method: 'POST',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Consultation completion failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to complete consultation'
        };
      }

      console.log('✅ Consultation completed successfully');
      return {
        success: true,
        data: data.data
      };

    } catch (error) {
      console.error('❌ Consultation completion error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Poll for AI summary generation completion
   * Matches web app pattern: 60 attempts at 5-second intervals = 5 minutes total
   * @param {string} consultationId
   * @param {number} maxAttempts - Maximum polling attempts (default 60)
   * @param {number} intervalMs - Polling interval in milliseconds (default 5000)
   * @param {function} onProgress - Optional callback for progress updates
   * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
   */
  static async pollForSummary(consultationId, maxAttempts = 60, intervalMs = 5000, onProgress = null) {
    console.log('🔄 Starting summary polling:', { consultationId, maxAttempts, intervalMs });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Call progress callback if provided
        if (onProgress) {
          onProgress(attempt, maxAttempts);
        }

        console.log(`📡 Polling attempt ${attempt}/${maxAttempts}`);

        const result = await this.getConsultation(consultationId);

        if (!result.success) {
          console.error('❌ Failed to fetch consultation:', result.error);
          // Continue polling on fetch errors
          await new Promise(resolve => setTimeout(resolve, intervalMs));
          continue;
        }

        const consultation = result.consultation;

        // Check if summary is ready
        if (consultation.ai_summary && consultation.ai_summary.trim()) {
          console.log('✅ Summary ready!', {
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

        // Wait before next attempt (unless this was the last attempt)
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

      } catch (error) {
        console.error(`❌ Polling error on attempt ${attempt}:`, error);
        // Continue polling on errors
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }

    // Timeout - summary not ready after max attempts
    console.warn('⚠️ Summary polling timed out after', maxAttempts, 'attempts');
    return {
      success: false,
      error: 'Summary generation timed out. The summary may still be processing.'
    };
  }
}

// Make ConsultationService available globally
if (typeof window !== 'undefined') {
  window.ConsultationService = ConsultationService;
}
