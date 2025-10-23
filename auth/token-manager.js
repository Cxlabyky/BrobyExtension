// Token Manager - Chrome Storage Wrapper
// Handles secure token storage and retrieval

class TokenManager {
  /**
   * Store authentication tokens after successful login
   */
  static async storeTokens(accessToken, refreshToken, user) {
    try {
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
        [CONFIG.STORAGE_KEYS.REFRESH_TOKEN]: refreshToken,
        [CONFIG.STORAGE_KEYS.USER]: user,
        tokenStoredAt: Date.now()
      });

      console.log('✅ Tokens stored successfully', {
        userId: user.id,
        email: user.email
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to store tokens:', error);
      return false;
    }
  }

  /**
   * Get access token from storage
   */
  static async getAccessToken() {
    try {
      const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
      return result[CONFIG.STORAGE_KEYS.ACCESS_TOKEN] || null;
    } catch (error) {
      console.error('❌ Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Get refresh token from storage
   */
  static async getRefreshToken() {
    try {
      const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
      return result[CONFIG.STORAGE_KEYS.REFRESH_TOKEN] || null;
    } catch (error) {
      console.error('❌ Failed to get refresh token:', error);
      return null;
    }
  }

  /**
   * Get stored user data
   */
  static async getUser() {
    try {
      const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.USER);
      return result[CONFIG.STORAGE_KEYS.USER] || null;
    } catch (error) {
      console.error('❌ Failed to get user data:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated() {
    const accessToken = await this.getAccessToken();
    return !!accessToken;
  }

  /**
   * Clear all authentication data (logout)
   * COMPREHENSIVE CLEARING: tokens, user data, patient data, session state
   */
  static async clearAuth() {
    try {
      // Clear all auth-related storage
      await chrome.storage.local.remove([
        CONFIG.STORAGE_KEYS.ACCESS_TOKEN,
        CONFIG.STORAGE_KEYS.REFRESH_TOKEN,
        CONFIG.STORAGE_KEYS.USER,
        CONFIG.STORAGE_KEYS.CURRENT_PATIENT,
        CONFIG.STORAGE_KEYS.LAST_UPDATE,
        'tokenStoredAt',
        'consultations',
        'activeConsultationId',
        'recordingSession'
      ]);

      console.log('✅ All auth data cleared from storage');
      return true;
    } catch (error) {
      console.error('❌ Failed to clear auth data:', error);
      return false;
    }
  }

  /**
   * Check if token is expired (7-day expiry)
   */
  static async isTokenExpired() {
    try {
      const result = await chrome.storage.local.get('tokenStoredAt');
      const tokenStoredAt = result.tokenStoredAt;

      if (!tokenStoredAt) {
        return true; // No token stored
      }

      const now = Date.now();
      const elapsed = now - tokenStoredAt;

      return elapsed > CONFIG.TOKEN_EXPIRY;
    } catch (error) {
      console.error('❌ Failed to check token expiry:', error);
      return true; // Assume expired on error
    }
  }

  /**
   * Get auth headers for API requests
   */
  static async getAuthHeaders() {
    const accessToken = await this.getAccessToken();

    if (!accessToken) {
      return {};
    }

    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
  }
}

// Make TokenManager available globally
if (typeof window !== 'undefined') {
  window.TokenManager = TokenManager;
}
