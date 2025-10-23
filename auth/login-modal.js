// Login Modal Logic
console.log('🔐 Login modal loaded');

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const btnText = loginBtn.querySelector('.btn-text');
const btnSpinner = loginBtn.querySelector('.btn-spinner');
const errorMessage = document.getElementById('error-message');
const signupLink = document.getElementById('signup-link');

// Handle login form submission
async function handleLogin(e) {
  e?.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Validation
  if (!email || !password) {
    showError('Please enter both email and password');
    return;
  }

  if (!isValidEmail(email)) {
    showError('Please enter a valid email address');
    return;
  }

  // Show loading state
  setLoading(true);
  hideError();

  try {
    console.log('🔐 Attempting login...', { email });

    // Call Auth.login
    const result = await Auth.login(email, password);

    if (result.success) {
      console.log('✅ Login successful!', { userId: result.user.id });

      // Show success message briefly
      showSuccess('Login successful!');

      // Close modal and redirect to sidebar after short delay
      setTimeout(() => {
        // Check if we're in a popup or iframe
        if (window.opener) {
          // Opened as popup - close and notify opener
          window.opener.postMessage({ type: 'LOGIN_SUCCESS', user: result.user }, '*');
          window.close();
        } else if (window.parent !== window) {
          // In iframe - notify parent
          window.parent.postMessage({ type: 'LOGIN_SUCCESS', user: result.user }, '*');
        } else {
          // Standalone - redirect to sidebar
          window.location.href = '../sidebar.html';
        }
      }, 1000);

    } else {
      // Show error
      console.error('❌ Login failed:', result.error);
      showError(result.error || 'Login failed. Please try again.');
      setLoading(false);
    }

  } catch (error) {
    console.error('❌ Login error:', error);
    showError('Network error. Please check your connection.');
    setLoading(false);
  }
}

// Event listeners
loginBtn.addEventListener('click', handleLogin);

emailInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    passwordInput.focus();
  }
});

passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleLogin();
  }
});

signupLink.addEventListener('click', (e) => {
  e.preventDefault();
  // Open signup page in new tab
  chrome.tabs.create({
    url: 'https://backend-production-a35dc.up.railway.app' // TODO: Update with actual signup URL
  });
});

// Helper functions
function setLoading(loading) {
  loginBtn.disabled = loading;

  if (loading) {
    btnText.style.display = 'none';
    btnSpinner.style.display = 'block';
  } else {
    btnText.style.display = 'block';
    btnSpinner.style.display = 'none';
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

function hideError() {
  errorMessage.style.display = 'none';
}

function showSuccess(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  errorMessage.style.background = 'rgba(52, 199, 89, 0.1)';
  errorMessage.style.borderColor = 'rgba(52, 199, 89, 0.3)';
  errorMessage.style.color = '#34C759';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Auto-focus email input
emailInput.focus();

console.log('✅ Login modal initialized');
