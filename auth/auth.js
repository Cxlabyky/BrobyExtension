// Authentication Module
// Handles login, logout, and session management with backend

class Auth {
  /**
   * Login user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  static async login(email, password) {
    try {
      console.log('🔐 Starting login...', { email });

      const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.LOGIN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Login failed:', data.error);
        return {
          success: false,
          error: data.error || 'Login failed'
        };
      }

      // Extract tokens and user from response
      const { access_token, refresh_token, user } = data.data;

      // Store tokens securely
      await TokenManager.storeTokens(access_token, refresh_token, user);

      console.log('✅ Login successful', {
        userId: user.id,
        email: user.email
      });

      return {
        success: true,
        user
      };

    } catch (error) {
      console.error('❌ Login error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Logout user and clear all session data
   * COMPREHENSIVE LOGOUT: Backend call + local storage clearing
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async logout() {
    try {
      console.log('🔄 Starting comprehensive logout...');

      const accessToken = await TokenManager.getAccessToken();

      // Call backend logout endpoint to clear server-side caches
      if (accessToken) {
        try {
          const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.LOGOUT}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: accessToken })
          });

          if (response.ok) {
            console.log('✅ Backend session cleared');
          } else {
            console.warn('⚠️ Backend logout failed, continuing with local cleanup');
          }
        } catch (error) {
          console.warn('⚠️ Backend logout error, continuing with local cleanup:', error);
        }
      }

      // CRITICAL: Clear all local storage regardless of backend response
      await TokenManager.clearAuth();

      console.log('✅ Comprehensive logout complete - all session data cleared');

      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Logout error:', error);

      // Even on error, try to clear local storage
      await TokenManager.clearAuth();

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if user is authenticated and token is valid
   * @returns {Promise<{authenticated: boolean, user?: object}>}
   */
  static async checkAuth() {
    try {
      // Check if token exists
      const isAuth = await TokenManager.isAuthenticated();

      if (!isAuth) {
        return { authenticated: false };
      }

      // Check if token is expired
      const isExpired = await TokenManager.isTokenExpired();

      if (isExpired) {
        console.warn('⚠️ Token expired, clearing auth');
        await TokenManager.clearAuth();
        return { authenticated: false };
      }

      // Verify token with backend
      const accessToken = await TokenManager.getAccessToken();

      const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.ME}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        // Token invalid - clear auth
        console.warn('⚠️ Token invalid, clearing auth');
        await TokenManager.clearAuth();
        return { authenticated: false };
      }

      const data = await response.json();
      const user = await TokenManager.getUser();

      console.log('✅ Auth check passed', { userId: user?.id });

      return {
        authenticated: true,
        user: user || data.data.user
      };

    } catch (error) {
      console.error('❌ Auth check error:', error);
      return { authenticated: false };
    }
  }

  /**
   * Get current authenticated user
   * @returns {Promise<object|null>}
   */
  static async getCurrentUser() {
    const user = await TokenManager.getUser();
    return user;
  }

}

// Make Auth available globally
if (typeof window !== 'undefined') {
  window.Auth = Auth;
}
