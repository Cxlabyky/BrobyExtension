// BrobyVets Extension Configuration
// Production backend configuration

const CONFIG = {
  // Production backend URL
  BACKEND_URL: 'https://backend-production-a35dc.up.railway.app',

  // API version
  API_VERSION: 'v1',

  // Full API base URL
  get API_BASE_URL() {
    return `${this.BACKEND_URL}/api/${this.API_VERSION}`;
  },

  // API endpoints
  ENDPOINTS: {
    // Auth
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',

    // Consultations
    CONSULTATIONS: '/consultations',
    CONSULTATION_BY_ID: (id) => `/consultations/${id}`,
    GENERATE_SUMMARY: (id) => `/consultations/${id}/generate-summary`,
    PROCESSING_STATUS: (id) => `/consultations/${id}/processing-status`,
    UPLOAD_PHOTO: (id) => `/consultations/${id}/photos`,

    // Recordings
    CREATE_RECORDING_SESSION: '/recordings/sessions/new',
    UPLOAD_CHUNK: (sessionId) => `/recordings/sessions/${sessionId}/chunks`,
    COMPLETE_RECORDING: (sessionId) => `/recordings/sessions/${sessionId}/complete`,
  },

  // Storage keys
  STORAGE_KEYS: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
    USER: 'user',
    CURRENT_PATIENT: 'currentPatient',
    LAST_UPDATE: 'lastUpdate'
  },

  // Token expiry (7 days in milliseconds)
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000,

  // Request timeout (30 seconds)
  REQUEST_TIMEOUT: 30000
};

// Make CONFIG available globally for other scripts
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
