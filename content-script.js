// Content Script for EzyVet History Injection
// Runs in the context of EzyVet web pages and handles injection requests

console.log('🎯 BrobyVets EzyVet content script loaded');

// Initialize injector instance
let injector = null;

/**
 * Initialize the injector when needed
 */
function getInjector() {
  if (!injector) {
    injector = new window.EzyVetHistoryInjector();
  }
  return injector;
}

/**
 * Handle messages from sidebar/background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Content script received message:', message);

  // Handle injection request (supports both message formats)
  if (message.action === 'injectHistory' || message.type === 'INSERT_SUMMARY') {
    // ✅ NEW: Extract photos from message
    const photos = message.photos || [];

    // Support both summaryText and summary properties
    const summaryText = message.summaryText || message.summary;

    handleInjectionRequest(summaryText, photos)
      .then(result => {
        console.log('✅ Injection result:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('❌ Injection error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  // Handle health check
  if (message.action === 'ping') {
    sendResponse({ success: true, message: 'Content script ready' });
    return true;
  }

  // Unknown action
  console.warn('⚠️ Unknown action:', message.action, message.type);
  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});

/**
 * Handle injection request with validation
 * @param {string} summaryText
 * @param {Array} photos - Array of photo objects
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleInjectionRequest(summaryText, photos = []) {
  try {
    // Validate summary text
    if (!summaryText || typeof summaryText !== 'string') {
      throw new Error('Invalid summary text provided');
    }

    if (summaryText.trim().length === 0) {
      throw new Error('Summary text is empty');
    }

    console.log('🎤 Starting injection for summary:', summaryText.substring(0, 100) + '...');
    if (photos && photos.length > 0) {
      console.log(`📸 Injection includes ${photos.length} photo(s)`);
    }

    // Get injector instance
    const injectorInstance = getInjector();

    // ✅ NEW: Pass photos to injector
    // Perform injection
    const result = await injectorInstance.injectSummary(summaryText, photos);

    if (result.success) {
      console.log('✅ Summary injected successfully into EzyVet');
    } else {
      console.error('❌ Injection failed:', result.error);
    }

    return result;

  } catch (error) {
    console.error('❌ Injection request handler error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Notify background script that content script is ready
 */
function notifyReady() {
  chrome.runtime.sendMessage({
    action: 'contentScriptReady',
    url: window.location.href
  }).catch(error => {
    // Ignore errors if background script isn't listening
    console.log('Background script not ready yet:', error);
  });
}

// Notify when loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', notifyReady);
} else {
  notifyReady();
}

console.log('✅ Content script initialized and ready for injection requests');
