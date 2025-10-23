console.log('🐾 Sidebar loaded');

class BrobyVetsSidebar {
  constructor() {
    this.currentPatient = null;
    this.lastUpdate = 0;
    this.pollCount = 0;
    this.isAuthenticated = false;
    this.init();
  }

  async init() {
    console.log('⚙️ Initializing...');

    // Check authentication first
    await this.checkAuthentication();

    // Setup event listeners
    this.setupEventListeners();

    // If authenticated, start patient polling
    if (this.isAuthenticated) {
      await this.checkStorage();
      this.startPolling();
    }

    console.log('✅ Sidebar initialized');
  }

  async checkAuthentication() {
    console.log('🔐 Checking authentication...');

    const { authenticated, user } = await Auth.checkAuth();
    this.isAuthenticated = authenticated;

    const loginModal = document.getElementById('login-modal');
    const mainContent = document.getElementById('main-content');
    const logoutBtn = document.getElementById('logoutBtn');

    if (authenticated) {
      console.log('✅ User authenticated', { userId: user?.id });
      loginModal.style.display = 'none';
      mainContent.style.display = 'block';
      logoutBtn.style.display = 'block';

      // Auto-focus email on next login
      document.getElementById('email')?.blur();
    } else {
      console.log('❌ User not authenticated');
      loginModal.style.display = 'flex';
      mainContent.style.display = 'none';
      logoutBtn.style.display = 'none';

      // Auto-focus email input
      setTimeout(() => {
        document.getElementById('email')?.focus();
      }, 100);
    }
  }

  setupEventListeners() {
    // Login button in modal
    document.getElementById('login-btn')?.addEventListener('click', async (e) => {
      await this.handleLogin(e);
    });

    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await this.handleLogout();
    });

    // Start button
    document.getElementById('startBtn')?.addEventListener('click', () => {
      if (this.currentPatient) {
        alert(`✅ Recording started for ${this.currentPatient.name}`);
      } else {
        alert('❌ No patient selected');
      }
    });

    // Enter key in email/password fields
    document.getElementById('email')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('password')?.focus();
      }
    });

    document.getElementById('password')?.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        await this.handleLogin();
      }
    });

    // Storage change listener
    chrome.storage.onChanged.addListener((changes, area) => {
      console.log('📨 STORAGE CHANGED:', changes);
      if (area === 'local' && changes.currentPatient) {
        const patient = changes.currentPatient.newValue;
        console.log('👤 Patient from storage change:', patient?.name);
        this.updatePatient(patient);
      }
    });
  }

  async handleLogin(e) {
    e?.preventDefault();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnSpinner = loginBtn.querySelector('.btn-spinner');
    const errorMessage = document.getElementById('error-message');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Validation
    if (!email || !password) {
      this.showError('Please enter both email and password');
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showError('Please enter a valid email address');
      return;
    }

    // Show loading state
    loginBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'block';
    errorMessage.style.display = 'none';

    try {
      console.log('🔐 Attempting login...', { email });

      const result = await Auth.login(email, password);

      if (result.success) {
        console.log('✅ Login successful!', { userId: result.user.id });

        // Show success message briefly
        errorMessage.textContent = 'Login successful!';
        errorMessage.style.display = 'block';
        errorMessage.style.background = 'rgba(52, 199, 89, 0.1)';
        errorMessage.style.borderColor = 'rgba(52, 199, 89, 0.3)';
        errorMessage.style.color = '#34C759';

        // Close modal and show main content
        setTimeout(() => {
          this.checkAuthentication();
          emailInput.value = '';
          passwordInput.value = '';
        }, 500);

      } else {
        console.error('❌ Login failed:', result.error);
        this.showError(result.error || 'Login failed. Please try again.');
        loginBtn.disabled = false;
        btnText.style.display = 'block';
        btnSpinner.style.display = 'none';
      }

    } catch (error) {
      console.error('❌ Login error:', error);
      this.showError('Network error. Please check your connection.');
      loginBtn.disabled = false;
      btnText.style.display = 'block';
      btnSpinner.style.display = 'none';
    }
  }

  showError(message) {
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    errorMessage.style.background = 'rgba(255, 59, 48, 0.1)';
    errorMessage.style.borderColor = 'rgba(255, 59, 48, 0.3)';
    errorMessage.style.color = '#FF3B30';
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async handleLogout() {
    console.log('🔄 Logging out...');

    const result = await Auth.logout();

    if (result.success) {
      console.log('✅ Logout successful');

      // Clear local state
      this.currentPatient = null;
      this.lastUpdate = 0;

      // Show login screen
      await this.checkAuthentication();
    } else {
      console.error('❌ Logout failed:', result.error);
      alert('Logout failed. Please try again.');
    }
  }

  startPolling() {
    console.log('🔄 Starting polling interval...');
    setInterval(() => {
      this.pollCount++;
      console.log('⏰ Poll #' + this.pollCount);
      this.checkStorage();
    }, 1000);
  }

  async checkStorage() {
    try {
      const data = await chrome.storage.local.get(['currentPatient', 'lastUpdate']);
      
      console.log('📂 Storage check:', data);
      
      if (data.currentPatient) {
        if (data.lastUpdate !== this.lastUpdate) {
          console.log('🎯 NEW UPDATE DETECTED:', data.currentPatient.name);
          this.lastUpdate = data.lastUpdate;
          this.updatePatient(data.currentPatient);
        } else {
          console.log('✓ No changes (lastUpdate:', data.lastUpdate, ')');
        }
      } else {
        console.log('⚠️ No patient in storage');
      }
    } catch (error) {
      console.error('❌ Storage error:', error);
    }
  }

  updatePatient(patient) {
    console.log('🎯 UPDATE UI:', patient.name);
    this.currentPatient = patient;
    
    const nameEl = document.querySelector('.patient-name');
    const detailsEl = document.querySelector('.patient-details');
    
    if (nameEl) {
      nameEl.textContent = patient.name;
      nameEl.style.color = '#1FC7CA';
      setTimeout(() => nameEl.style.color = '#FFFFFF', 500);
    }
    
    if (detailsEl) {
      detailsEl.textContent = `${patient.species} • ID: ${patient.id} • ${patient.date}`;
    }
    
    console.log('✅ UI updated');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loading...');
    window.brobyVets = new BrobyVetsSidebar();
  });
} else {
  console.log('📄 DOM ready');
  window.brobyVets = new BrobyVetsSidebar();
}
