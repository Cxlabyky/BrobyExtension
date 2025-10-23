console.log('🐾 Sidebar loaded');

class BrobyVetsSidebar {
  constructor() {
    this.currentPatient = null;
    this.lastUpdate = 0;
    this.pollCount = 0;
    this.isAuthenticated = false;
    this.currentState = 'ready'; // ready, recording, processing, completed
    this.timerSeconds = 0;
    this.timerInterval = null;
    this.recordingManager = new RecordingManager();
    this.consultationId = null;
    this.sessionId = null;
    this.summaryPollInterval = null;
    this.isPaused = false;
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
      this.startRecording();
    });

    // Pause button
    document.getElementById('pauseBtn')?.addEventListener('click', () => {
      this.pauseRecording();
    });

    // Submit button
    document.getElementById('submitBtn')?.addEventListener('click', () => {
      this.submitRecording();
    });

    // New Consult button
    document.getElementById('newConsultBtn')?.addEventListener('click', () => {
      this.startNewConsult();
    });

    // Insert into EzyVet button
    document.getElementById('insertBtn')?.addEventListener('click', () => {
      this.insertIntoEzyVet();
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

    const nameEls = document.querySelectorAll('.patient-name');
    const detailsEls = document.querySelectorAll('.patient-details');

    nameEls.forEach(nameEl => {
      nameEl.textContent = patient.name;
      nameEl.style.color = '#1FC7CA';
      setTimeout(() => nameEl.style.color = '#FFFFFF', 500);
    });

    detailsEls.forEach(detailsEl => {
      detailsEl.textContent = `${patient.species} • ID: ${patient.id} • ${patient.date}`;
    });

    console.log('✅ UI updated');
  }

  // State Management
  showState(state) {
    console.log(`🔄 Switching to state: ${state}`);
    this.currentState = state;

    // Hide all states
    document.getElementById('ready-state').style.display = 'none';
    document.getElementById('recording-state').style.display = 'none';
    document.getElementById('processing-state').style.display = 'none';
    document.getElementById('completed-state').style.display = 'none';

    // Show requested state
    document.getElementById(`${state}-state`).style.display = 'flex';
  }

  async startRecording() {
    if (!this.currentPatient) {
      alert('❌ No patient selected. Please select a patient in EzyVet first.');
      return;
    }

    console.log('▶️ Starting recording for:', this.currentPatient.name);

    // Check if setup was completed
    console.log('🔍 Checking if microphone setup is complete...');
    const { setupComplete } = await chrome.storage.local.get('setupComplete');

    if (!setupComplete) {
      console.log('⚠️ Setup not complete - opening setup page');
      chrome.tabs.create({ url: 'setup.html' });
      alert('Please complete the microphone setup in the tab that just opened, then try again.');
      return;
    }

    // Check actual permission state
    console.log('🔐 Checking microphone permission state...');
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      console.log('🔐 Permission state:', permissionStatus.state);

      if (permissionStatus.state === 'denied') {
        console.error('❌ Microphone permission was denied');
        chrome.tabs.create({ url: 'setup.html' });
        alert('Microphone permission was denied. Please allow access in the tab that just opened, then try again.');
        return;
      }

      if (permissionStatus.state === 'prompt') {
        console.warn('⚠️ Permission still in prompt state - opening setup page');
        chrome.tabs.create({ url: 'setup.html' });
        alert('Please allow microphone access in the tab that just opened, then try again.');
        return;
      }
    } catch (permError) {
      console.warn('⚠️ Could not query permission status:', permError);
      // Continue anyway - getUserMedia will handle it
    }

    // Permission granted - proceed with recording workflow
    console.log('✅ Permission checks passed, starting recording workflow...');

    const result = await this.recordingManager.startRecording({
      name: this.currentPatient.name,
      id: this.currentPatient.id,
      species: this.currentPatient.species
    });

    if (!result.success) {
      alert(`❌ Failed to start recording: ${result.error}`);
      return;
    }

    // Store consultation and session IDs
    this.consultationId = result.consultationId;
    this.sessionId = result.sessionId;

    console.log('✅ Recording started:', { consultationId: this.consultationId, sessionId: this.sessionId });

    // Show recording state
    this.showState('recording');

    // Start timer
    this.timerSeconds = 0;
    this.isPaused = false;
    this.updateTimer();
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      this.updateTimer();
    }, 1000);
  }

  updateTimer() {
    const hours = Math.floor(this.timerSeconds / 3600);
    const minutes = Math.floor((this.timerSeconds % 3600) / 60);
    const seconds = this.timerSeconds % 60;

    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const timerEl = document.getElementById('timer');
    if (timerEl) {
      timerEl.textContent = timeString;
    }
  }

  pauseRecording() {
    const pauseBtn = document.getElementById('pauseBtn');
    if (!pauseBtn) return;

    if (!this.isPaused) {
      // Pause
      console.log('⏸️ Pausing recording');
      this.recordingManager.pauseRecording();

      // Stop timer
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      this.isPaused = true;
      pauseBtn.textContent = '▶️ Resume';

    } else {
      // Resume
      console.log('▶️ Resuming recording');
      this.recordingManager.resumeRecording();

      // Resume timer
      this.timerInterval = setInterval(() => {
        this.timerSeconds++;
        this.updateTimer();
      }, 1000);

      this.isPaused = false;
      pauseBtn.textContent = '⏸️ Pause';
    }
  }

  async submitRecording() {
    console.log('✓ Submitting recording');

    // Stop timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Show processing state
    this.showState('processing');

    // Stop recording and complete session
    const result = await this.recordingManager.stopRecording();

    if (!result.success) {
      alert(`❌ Failed to submit recording: ${result.error}`);
      // Go back to recording state
      this.showState('recording');
      // Restart timer
      this.timerInterval = setInterval(() => {
        this.timerSeconds++;
        this.updateTimer();
      }, 1000);
      return;
    }

    console.log('✅ Recording submitted');

    // TRIGGER summary generation
    console.log('🤖 Triggering AI summary generation...');

    try {
      const summaryResult = await ConsultationService.generateSummary(this.consultationId);

      if (summaryResult.success) {
        console.log('✅ Summary generated!');
        this.showCompletedState(summaryResult.summary);
      } else {
        console.log('⚠️ Fallback to polling...', summaryResult.error);
        this.startSummaryPolling();
      }
    } catch (error) {
      console.error('❌ Error, falling back to polling...', error);
      this.startSummaryPolling();
    }
  }

  startSummaryPolling() {
    console.log('🔄 Starting summary polling...');

    let pollAttempts = 0;
    const maxAttempts = 60; // 60 attempts = 5 minutes max (5 second intervals)

    this.summaryPollInterval = setInterval(async () => {
      pollAttempts++;
      console.log(`📊 Poll attempt ${pollAttempts}/${maxAttempts} for consultation ${this.consultationId}`);

      try {
        const result = await ConsultationService.getConsultation(this.consultationId);

        if (!result.success) {
          console.error('❌ Failed to get consultation:', result.error);
          return;
        }

        const consultation = result.consultation;
        console.log('📋 Consultation data:', {
          id: consultation.id,
          hasAiSummary: !!consultation.ai_summary,
          aiSummaryLength: consultation.ai_summary?.length || 0
        });

        // Check if AI summary is ready
        if (consultation.ai_summary && consultation.ai_summary.trim() !== '') {
          console.log('✅ AI Summary ready!', {
            summaryLength: consultation.ai_summary.length
          });
          clearInterval(this.summaryPollInterval);
          this.summaryPollInterval = null;
          this.showCompletedState(consultation.ai_summary);
        } else if (pollAttempts >= maxAttempts) {
          console.error('❌ Summary polling timeout after', maxAttempts, 'attempts');
          clearInterval(this.summaryPollInterval);
          this.summaryPollInterval = null;
          alert('⚠️ Summary generation took longer than expected. Please refresh to check status.');
          this.showState('ready');
        } else {
          console.log(`⏳ AI summary not ready yet (attempt ${pollAttempts}/${maxAttempts})`);
        }

      } catch (error) {
        console.error('❌ Polling error:', error);
      }

    }, 5000); // Poll every 5 seconds
  }

  showCompletedState(summary) {
    console.log('✅ Recording complete', { summaryLength: summary?.length });
    this.showState('completed');

    // Display the real AI summary from backend
    const summaryContent = document.getElementById('summaryContent');
    if (summaryContent && summary) {
      // Format the summary for better readability
      const formattedSummary = this.formatSummary(summary);
      summaryContent.innerHTML = formattedSummary;
      console.log('📝 Summary displayed in UI');
    } else {
      console.error('❌ Summary content element not found or summary is empty');
    }
  }

  /**
   * Format AI summary for better display
   * Converts markdown-style text to HTML
   */
  formatSummary(summary) {
    if (!summary) return '';

    // Replace markdown headers with HTML
    let formatted = summary
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // Bold text
      .replace(/\n\n/g, '</p><p>') // Paragraphs
      .replace(/\n/g, '<br>') // Line breaks
      .replace(/^- (.+)/gm, '<li>$1</li>'); // List items

    // Wrap in paragraph tags if not already wrapped
    if (!formatted.startsWith('<p>')) {
      formatted = '<p>' + formatted + '</p>';
    }

    // Wrap list items in <ul> tags
    formatted = formatted.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');

    return formatted;
  }

  startNewConsult() {
    console.log('🆕 Starting new consult');

    // Stop any active polling
    if (this.summaryPollInterval) {
      clearInterval(this.summaryPollInterval);
      this.summaryPollInterval = null;
    }

    // Reset state
    this.consultationId = null;
    this.sessionId = null;
    this.timerSeconds = 0;
    this.isPaused = false;
    this.updateTimer();

    // Go back to ready state
    this.showState('ready');

    // Reset pause button text
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.textContent = '⏸️ Pause';
    }
  }

  insertIntoEzyVet() {
    console.log('📝 Inserting summary into EzyVet');

    const summaryContent = document.getElementById('summaryContent');
    if (!summaryContent) return;

    const summaryText = summaryContent.innerText;

    // Send message to content script to insert into EzyVet
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'INSERT_SUMMARY',
          summary: summaryText
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('❌ Insert failed:', chrome.runtime.lastError);
            alert('Failed to insert into EzyVet. Make sure you\'re on the correct page.');
          } else {
            console.log('✅ Summary inserted successfully');
            alert('✅ Summary inserted into EzyVet!');
          }
        });
      }
    });
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
