// API Client - Base client for all backend API calls
// Automatically injects auth headers and handles common errors

class APIClient {
  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint path
   * @param {object} options - Fetch options
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  static async request(endpoint, options = {}) {
    try {
      // Get auth headers
      const authHeaders = await TokenManager.getAuthHeaders();

      // Merge headers
      const headers = {
        ...authHeaders,
        ...options.headers
      };

      // Build full URL
      const url = endpoint.startsWith('http')
        ? endpoint
        : `${CONFIG.API_BASE_URL}${endpoint}`;

      console.log('📡 API Request:', {
        method: options.method || 'GET',
        url,
        hasAuth: !!authHeaders.Authorization
      });

      // Make request
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT)
      });

      // Handle 401 Unauthorized - token expired
      if (response.status === 401) {
        console.warn('⚠️ 401 Unauthorized - clearing auth');
        await TokenManager.clearAuth();
        return {
          success: false,
          error: 'Session expired. Please login again.',
          code: 'UNAUTHORIZED'
        };
      }

      // Parse response
      const data = await response.json();

      if (!response.ok) {
        console.error('❌ API Error:', {
          status: response.status,
          error: data.error
        });

        return {
          success: false,
          error: data.error || `Request failed with status ${response.status}`,
          code: data.code,
          status: response.status
        };
      }

      console.log('✅ API Success:', {
        url,
        hasData: !!data.data
      });

      return {
        success: true,
        data: data.data || data
      };

    } catch (error) {
      console.error('❌ API Request Error:', error);

      return {
        success: false,
        error: error.name === 'TimeoutError'
          ? 'Request timeout - please try again'
          : error.message || 'Network error'
      };
    }
  }

  /**
   * GET request
   */
  static async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  static async post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * PUT request
   */
  static async put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  /**
   * DELETE request
   */
  static async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Upload file with FormData
   */
  static async uploadFile(endpoint, formData) {
    try {
      const authHeaders = await TokenManager.getAuthHeaders();

      // Don't set Content-Type for FormData - browser sets it automatically with boundary
      const headers = {
        'Authorization': authHeaders.Authorization
      };

      const url = `${CONFIG.API_BASE_URL}${endpoint}`;

      console.log('📤 Uploading file:', { url });

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT)
      });

      if (response.status === 401) {
        console.warn('⚠️ 401 Unauthorized - clearing auth');
        await TokenManager.clearAuth();
        return {
          success: false,
          error: 'Session expired. Please login again.',
          code: 'UNAUTHORIZED'
        };
      }

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Upload failed',
          status: response.status
        };
      }

      console.log('✅ Upload successful');

      return {
        success: true,
        data: data.data || data
      };

    } catch (error) {
      console.error('❌ Upload error:', error);
      return {
        success: false,
        error: error.message || 'Upload failed'
      };
    }
  }
}

// Make APIClient available globally
if (typeof window !== 'undefined') {
  window.APIClient = APIClient;
}
