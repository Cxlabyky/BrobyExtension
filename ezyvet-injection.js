// EzyVet History Injection Service
// Handles automatic injection of AI-generated summaries into EzyVet's History form

class EzyVetHistoryInjector {
  constructor() {
    this.observer = null;
    this.currentTabNumber = null;
    this.isInjecting = false;
  }

  /**
   * Main injection method - orchestrates the complete flow
   * @param {string} summaryText - The AI-generated summary to inject
   * @param {Array} photos - Array of photo objects to inject
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async injectSummary(summaryText, photos = []) {
    if (this.isInjecting) {
      return {
        success: false,
        error: 'Injection already in progress'
      };
    }

    this.isInjecting = true;

    try {
      console.log('🎯 Starting EzyVet history injection...');

      // Step 1: Click "Add History" button
      const addHistoryBtn = await this.waitForElement('[data-testid="AddHistory"]', 5000);
      if (!addHistoryBtn) {
        throw new Error('Add History button not found');
      }

      console.log('✅ Found Add History button');
      addHistoryBtn.click();

      // Step 2: Wait for popup form to appear
      const popupForm = await this.waitForPopupForm(10000);
      if (!popupForm) {
        throw new Error('Popup form did not appear');
      }

      console.log('✅ Popup form appeared');

      // Step 3: Extract dynamic tab number
      this.currentTabNumber = this.extractTabNumber(popupForm);
      if (!this.currentTabNumber) {
        throw new Error('Could not extract tab number from popup form');
      }

      console.log('✅ Extracted tab number:', this.currentTabNumber);

      // Step 4: Fill in the comment textarea
      const textarea = await this.fillComment(summaryText);
      if (!textarea) {
        throw new Error('Failed to fill comment textarea');
      }

      console.log('✅ Filled comment textarea');

      // ✅ NEW STEP 5: Inject photos if provided
      if (photos && photos.length > 0) {
        console.log(`📸 Injecting ${photos.length} photo(s)...`);
        const photoResult = await this.injectPhotos(photos);

        if (!photoResult.success) {
          console.warn('⚠️ Photo injection failed:', photoResult.error);
          console.log('💡 Continuing with summary submission anyway');
          // Don't throw - still submit summary even if photos fail
        } else {
          console.log('✅ Photos injected successfully');
        }
      }

      // Step 6: Submit the form
      const submitted = await this.submitForm();
      if (!submitted) {
        throw new Error('Failed to submit form');
      }

      console.log('✅ Form submitted successfully');

      return {
        success: true
      };

    } catch (error) {
      console.error('❌ EzyVet injection failed:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.cleanup();
      this.isInjecting = false;
    }
  }

  /**
   * Wait for popup form to appear using MutationObserver
   * @param {number} timeout - Maximum time to wait (ms)
   * @returns {Promise<HTMLElement>}
   */
  waitForPopupForm(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Check if already exists
      const existing = document.querySelector('[id^="popupForm-"]');
      if (existing && this.isElementVisible(existing)) {
        resolve(existing);
        return;
      }

      // Set up observer
      this.observer = new MutationObserver((mutations) => {
        const popupForm = document.querySelector('[id^="popupForm-"]');
        if (popupForm && this.isElementVisible(popupForm)) {
          this.observer.disconnect();
          resolve(popupForm);
        }
      });

      // Start observing
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Timeout fallback
      setTimeout(() => {
        if (this.observer) {
          this.observer.disconnect();
        }
        const popupForm = document.querySelector('[id^="popupForm-"]');
        resolve(popupForm || null);
      }, timeout);
    });
  }

  /**
   * Wait for a specific element to appear
   * @param {string} selector - CSS selector
   * @param {number} timeout - Maximum time to wait (ms)
   * @returns {Promise<HTMLElement>}
   */
  waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Extract tab number from popup form ID
   * @param {HTMLElement} popupForm
   * @returns {string|null}
   */
  extractTabNumber(popupForm) {
    const id = popupForm.id;
    const match = id.match(/popupForm-(-?\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Fill the comment textarea with summary text
   * @param {string} summaryText
   * @returns {Promise<HTMLElement>}
   */
  async fillComment(summaryText) {
    const textareaId = `visithistorydata_comments-${this.currentTabNumber}`;
    const textarea = document.getElementById(textareaId);

    if (!textarea) {
      console.error('❌ Textarea not found:', textareaId);
      return null;
    }

    // Set value using multiple methods for compatibility
    textarea.value = summaryText;
    textarea.textContent = summaryText;

    // Trigger input events for any listeners
    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });
    textarea.dispatchEvent(inputEvent);
    textarea.dispatchEvent(changeEvent);

    // Try jQuery if available (EzyVet uses jQuery)
    if (typeof window.$ !== 'undefined') {
      try {
        window.$(textarea).val(summaryText).trigger('input').trigger('change');
      } catch (e) {
        console.warn('⚠️ jQuery trigger failed:', e);
      }
    }

    return textarea;
  }

  /**
   * Submit the form using multiple fallback methods
   * @returns {Promise<boolean>}
   */
  async submitForm() {
    const saveButtonId = `saveRecord-${this.currentTabNumber}`;
    const saveButton = document.getElementById(saveButtonId);

    if (!saveButton) {
      console.error('❌ Save button not found:', saveButtonId);
      return false;
    }

    // Method 1: Try custom buttonClick event (EzyVet pattern)
    try {
      const buttonClickEvent = new Event('buttonClick', { bubbles: true });
      saveButton.dispatchEvent(buttonClickEvent);
      console.log('✅ Dispatched buttonClick event');
    } catch (e) {
      console.warn('⚠️ buttonClick event failed:', e);
    }

    // Wait a bit for event handlers
    await new Promise(resolve => setTimeout(resolve, 100));

    // Method 2: Try custom save event (EzyVet pattern)
    try {
      const saveEvent = new Event('save', { bubbles: true });
      saveButton.dispatchEvent(saveEvent);
      console.log('✅ Dispatched save event');
    } catch (e) {
      console.warn('⚠️ save event failed:', e);
    }

    // Wait a bit for event handlers
    await new Promise(resolve => setTimeout(resolve, 100));

    // Method 3: Direct click (most reliable)
    try {
      saveButton.click();
      console.log('✅ Clicked save button');
    } catch (e) {
      console.error('❌ Click failed:', e);
      return false;
    }

    // Method 4: jQuery click if available (fallback)
    if (typeof window.$ !== 'undefined') {
      try {
        window.$(saveButton).click();
        console.log('✅ jQuery click triggered');
      } catch (e) {
        console.warn('⚠️ jQuery click failed:', e);
      }
    }

    return true;
  }

  /**
   * Inject photos into EzyVet History form
   * @param {Array} photos - Array of photo objects from sidebar
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async injectPhotos(photos) {
    if (!photos || photos.length === 0) {
      console.log('📸 No photos to inject');
      return { success: true };
    }

    try {
      console.log(`📸 Starting photo injection for ${photos.length} photo(s)...`);

      // TODO: REPLACE THIS ID PATTERN WITH YOUR DISCOVERED PATTERN
      // Examples of possible patterns:
      // - `photo_upload-${this.currentTabNumber}`
      // - `attachment_field-${this.currentTabNumber}`
      // - `visithistorydata_photos-${this.currentTabNumber}`

      const photoUploadElementId = `photo_upload_field-${this.currentTabNumber}`;
      const uploadElement = document.getElementById(photoUploadElementId);

      if (!uploadElement) {
        console.warn('⚠️ Photo upload element not found:', photoUploadElementId);
        return {
          success: false,
          error: 'Photo upload element not found'
        };
      }

      console.log('✅ Found photo upload element:', uploadElement);

      // Upload each photo sequentially
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        console.log(`📸 Uploading photo ${i + 1}/${photos.length}: ${photo.filename}`);

        const uploaded = await this.uploadSinglePhoto(uploadElement, photo);

        if (!uploaded) {
          console.warn(`⚠️ Failed to upload photo: ${photo.filename}`);
        }

        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('✅ Photo injection completed');
      return { success: true };

    } catch (error) {
      console.error('❌ Photo injection failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload a single photo to EzyVet
   * @param {HTMLElement} uploadElement - The file input element
   * @param {Object} photo - Photo object {id, url, filename, caption}
   * @returns {Promise<boolean>}
   */
  async uploadSinglePhoto(uploadElement, photo) {
    try {
      console.log('📸 Processing photo:', photo.filename);

      // Step 1: Fetch the image from URL as blob
      const response = await fetch(photo.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch photo: ${response.statusText}`);
      }

      const blob = await response.blob();
      console.log('✅ Photo blob fetched:', blob.size, 'bytes');

      // Step 2: Create File object
      const file = new File([blob], photo.filename, {
        type: blob.type || 'image/jpeg'
      });

      // Step 3: Use DataTransfer API to set files
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      uploadElement.files = dataTransfer.files;

      // Step 4: Trigger events
      const events = ['change', 'input'];
      for (const eventType of events) {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        uploadElement.dispatchEvent(event);
      }

      // Step 5: Try jQuery if available
      if (typeof window.$ !== 'undefined') {
        try {
          window.$(uploadElement).trigger('change');
          console.log('✅ jQuery change event triggered');
        } catch (e) {
          console.warn('⚠️ jQuery trigger failed:', e);
        }
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('✅ Photo upload completed:', photo.filename);
      return true;

    } catch (error) {
      console.error('❌ Failed to upload photo:', error);
      return false;
    }
  }

  /**
   * Check if element is visible
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           element.offsetParent !== null;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.currentTabNumber = null;
  }
}

// Make available globally for content script
if (typeof window !== 'undefined') {
  window.EzyVetHistoryInjector = EzyVetHistoryInjector;
}
