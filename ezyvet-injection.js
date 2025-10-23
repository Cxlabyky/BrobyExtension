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
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async injectSummary(summaryText) {
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

      // Step 5: Submit the form
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
