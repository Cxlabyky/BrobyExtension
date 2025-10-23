// Photo Service
// Handles photo upload and management for consultations

class PhotoService {
  /**
   * Upload photo to consultation
   * @param {string} consultationId - Current consultation ID
   * @param {File} photoFile - Image file from file input
   * @param {string} caption - Optional photo caption
   * @returns {Promise<{success: boolean, photo?: object, error?: string}>}
   */
  static async uploadPhoto(consultationId, photoFile, caption = '') {
    try {
      console.log('📸 Uploading photo:', {
        consultationId,
        fileName: photoFile.name,
        size: photoFile.size,
        type: photoFile.type
      });

      // Validate file type
      if (!photoFile.type.startsWith('image/')) {
        return {
          success: false,
          error: 'Please select an image file'
        };
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (photoFile.size > maxSize) {
        return {
          success: false,
          error: 'Image must be smaller than 10MB'
        };
      }

      // Create FormData
      const formData = new FormData();
      formData.append('photo', photoFile, photoFile.name);
      if (caption) {
        formData.append('caption', caption);
      }

      // Get auth headers
      const authHeaders = await TokenManager.getAuthHeaders();

      // Upload using fetch (similar to chunk upload pattern)
      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.UPLOAD_PHOTO(consultationId)}`,
        {
          method: 'POST',
          headers: {
            ...authHeaders
            // Don't set Content-Type - browser sets it with boundary for FormData
          },
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Photo upload failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to upload photo'
        };
      }

      console.log('✅ Photo uploaded:', data.data?.id);

      return {
        success: true,
        photo: data.data
      };

    } catch (error) {
      console.error('❌ Photo upload error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Upload photo with retry logic
   * @param {string} consultationId
   * @param {File} photoFile
   * @param {string} caption
   * @param {number} maxRetries
   * @returns {Promise<{success: boolean, photo?: object, error?: string}>}
   */
  static async uploadPhotoWithRetry(consultationId, photoFile, caption = '', maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await this.uploadPhoto(consultationId, photoFile, caption);

      if (result.success) {
        return result;
      }

      // If this was the last attempt, return the error
      if (attempt === maxRetries - 1) {
        return result;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`⚠️ Retry ${attempt + 1}/${maxRetries} for photo upload after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Get all photos for a consultation
   * @param {string} consultationId
   * @returns {Promise<{success: boolean, photos?: array, error?: string}>}
   */
  static async getPhotos(consultationId) {
    try {
      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.UPLOAD_PHOTO(consultationId)}`,
        {
          method: 'GET',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to get photos'
        };
      }

      return {
        success: true,
        photos: data.data || []
      };

    } catch (error) {
      console.error('❌ Get photos error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a photo
   * @param {string} consultationId
   * @param {string} photoId
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async deletePhoto(consultationId, photoId) {
    try {
      console.log('🗑️ Deleting photo:', photoId);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.UPLOAD_PHOTO(consultationId)}/${photoId}`,
        {
          method: 'DELETE',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Photo deletion failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to delete photo'
        };
      }

      console.log('✅ Photo deleted successfully');

      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Photo deletion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Make PhotoService available globally
if (typeof window !== 'undefined') {
  window.PhotoService = PhotoService;
}
