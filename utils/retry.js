// Retry Utility
// Exponential backoff retry logic matching web app pattern

/**
 * Execute a function with exponential backoff retry
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry configuration
 * @param {number} options.maxAttempts - Maximum retry attempts (default: 3)
 * @param {number} options.delay - Initial delay in ms (default: 1000)
 * @param {number} options.backoff - Backoff multiplier (default: 2)
 * @param {Function} options.onRetry - Callback on retry (attempt, error) => void
 * @returns {Promise<any>} - Result from fn
 * @throws {Error} - Last error if all attempts fail
 */
async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    onRetry
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        console.error('🔴 Max retry attempts reached', { attempt, error });
        throw error;
      }

      const waitTime = delay * Math.pow(backoff, attempt - 1);
      console.warn(`⚠️ Retry attempt ${attempt}/${maxAttempts} after ${waitTime}ms`, { error });

      if (onRetry) {
        onRetry(attempt, error);
      }

      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

// Make withRetry available globally
if (typeof window !== 'undefined') {
  window.withRetry = withRetry;
}
