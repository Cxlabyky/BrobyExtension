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
        error: error.message
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
        error: error.message
      };
    }
  }
}

// Make ConsultationService available globally
if (typeof window !== 'undefined') {
  window.ConsultationService = ConsultationService;
}
