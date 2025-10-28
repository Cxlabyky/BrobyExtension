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
    // Photo management
    this.photos = [];
    this.uploadingPhotos = new Set();

    // Multi-consult management
    this.activeConsultations = new Map(); // patientId -> consultation state
    this.activeConsultationId = null; // Currently viewing consultation

    // Template management
    this.templates = [];
    this.selectedTemplate = null;
    this.templateDropdownOpen = false;

    this.init();
  }

  async init() {
    console.log('⚙️ Initializing...');

    // Check authentication first
    await this.checkAuthentication();

    // Setup event listeners
    this.setupEventListeners();

    // If authenticated, load templates and start polling
    if (this.isAuthenticated) {
      await this.loadTemplates();
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
    const sidebarLogo = document.getElementById('sidebarLogo');

    if (authenticated) {
      console.log('✅ User authenticated', { userId: user?.id });
      loginModal.style.display = 'none';
      mainContent.style.display = 'block';
      logoutBtn.style.display = 'block';
      if (sidebarLogo) sidebarLogo.style.display = 'flex';

      // Auto-focus email on next login
      document.getElementById('email')?.blur();
    } else {
      console.log('❌ User not authenticated');
      loginModal.style.display = 'flex';
      mainContent.style.display = 'none';
      logoutBtn.style.display = 'none';
      if (sidebarLogo) sidebarLogo.style.display = 'none';

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

    // Photo upload event listeners
    this.setupPhotoUpload();

    // Template dropdown event listeners
    const templateHeader = document.getElementById('template-header');
    const templateDisplay = document.getElementById('template-display');

    // Single click handler for both header and display
    const toggleDropdown = (e) => {
      e.stopPropagation(); // Prevent event bubbling
      if (this.templateDropdownOpen) {
        this.hideTemplateDropdown();
      } else {
        this.showTemplateDropdown();
      }
    };

    templateHeader?.addEventListener('click', toggleDropdown);
    templateDisplay?.addEventListener('click', toggleDropdown);

    // Template search
    document.getElementById('template-search')?.addEventListener('input', (e) => {
      this.populateTemplateList(e.target.value);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('template-dropdown');

      // Check if click is outside both the dropdown and the trigger elements
      if (
        this.templateDropdownOpen &&
        dropdown &&
        !dropdown.contains(e.target) &&
        !templateHeader?.contains(e.target) &&
        !templateDisplay?.contains(e.target)
      ) {
        this.hideTemplateDropdown();
      }
    });

    // Reposition dropdown on scroll (since using fixed positioning)
    const mainContent = document.getElementById('main-content');
    mainContent?.addEventListener('scroll', () => {
      if (this.templateDropdownOpen) {
        this.hideTemplateDropdown(); // Close on scroll for simplicity
      }
    });
  }

  setupPhotoUpload() {
    const addPhotoBtn = document.getElementById('addPhotoBtn');
    const photoInput = document.getElementById('photoInput');

    if (!addPhotoBtn || !photoInput) {
      console.warn('⚠️ Photo upload elements not found');
      return;
    }

    // Click "+" button to trigger file input
    addPhotoBtn.addEventListener('click', () => {
      if (!this.consultationId) {
        alert('❌ Please start a consultation first');
        return;
      }
      photoInput.click();
    });

    // Handle file selection
    photoInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      console.log(`📸 ${files.length} photo(s) selected`);

      // Upload each selected photo
      for (const file of files) {
        await this.uploadPhoto(file);
      }

      // Clear input for next selection
      photoInput.value = '';
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

  async updatePatient(patient) {
    console.log('🎯 UPDATE UI:', patient.name);

    // Check if this is a DIFFERENT patient than current
    const isDifferentPatient = this.currentPatient && this.currentPatient.id !== patient.id;

    if (isDifferentPatient) {
      console.log('🔄 Different patient detected!', {
        from: this.currentPatient.name,
        to: patient.name
      });

      // Auto-pause and save current consultation if recording
      await this.handlePatientSwitch();
    }

    this.currentPatient = patient;

    // Check if consultation exists for this patient
    const existingConsult = this.activeConsultations.get(patient.id);

    if (existingConsult) {
      console.log('📂 Loading existing consultation for', patient.name);
      await this.loadConsultation(existingConsult);
    } else {
      console.log('🆕 New patient - ready to start consultation');
      // Show ready state with patient info
      this.showState('ready');
      this.updatePatientUI(patient);
    }

    // Update paused consultations grid
    this.updatePausedConsultationsGrid();

    console.log('✅ UI updated');
  }

  updatePatientUI(patient) {
    const nameEls = document.querySelectorAll('.patient-name');
    const detailsEls = document.querySelectorAll('.patient-details');

    nameEls.forEach(nameEl => {
      nameEl.textContent = patient.name;
      nameEl.style.color = '#1FC7CA';
    });

    detailsEls.forEach(detailsEl => {
      detailsEl.textContent = `${patient.species} • ID: ${patient.id} • ${patient.date}`;
    });
  }

  // Template Management
  async loadTemplates() {
    try {
      console.log('📋 Loading templates...');

      const result = await TemplateService.getTemplatesWithCache();

      if (result.success) {
        this.templates = result.templates || [];
        console.log('✅ Templates loaded:', this.templates.length, this.templates);

        // Don't auto-select any template - let user choose or use default (no template)
        if (this.templates.length === 0) {
          console.warn('⚠️ No templates found in database');
        }

        // Update display to show "Default (No Template)" initially
        this.updateTemplateDisplay();
      } else {
        console.error('❌ Failed to load templates:', result.error);
        // Update UI to show error
        const templateName = document.getElementById('template-name');
        if (templateName) {
          templateName.textContent = 'Error loading templates';
        }
      }
    } catch (error) {
      console.error('❌ Load templates error:', error);
      // Update UI to show error
      const templateName = document.getElementById('template-name');
      if (templateName) {
        templateName.textContent = 'Error loading templates';
      }
    }
  }

  updateTemplateDisplay() {
    const templateName = document.getElementById('template-name');
    if (templateName) {
      if (this.selectedTemplate) {
        templateName.textContent = this.selectedTemplate.name;
      } else {
        templateName.textContent = 'Default (No Template)';
      }
    }
  }

  showTemplateDropdown() {
    console.log('📋 showTemplateDropdown called');
    const dropdown = document.getElementById('template-dropdown');
    const chevron = document.getElementById('template-chevron');
    const templateSection = document.getElementById('template-section');

    if (!dropdown) {
      console.error('❌ template-dropdown element not found!');
      return;
    }

    console.log('✅ Opening template dropdown, templates count:', this.templates.length);

    // Position dropdown using FIXED positioning (avoids overflow:hidden clipping)
    if (templateSection) {
      const rect = templateSection.getBoundingClientRect();

      dropdown.style.left = (rect.left) + 'px';
      dropdown.style.width = (rect.width) + 'px';

      // Fixed height for dropdown
      const dropdownHeight = 300; // Fixed reasonable height

      // Position dropdown DIRECTLY ABOVE the template section
      // rect.top is the top of the template section, subtract dropdown height to position above
      const dropdownTop = rect.top - dropdownHeight - 8; // 8px gap

      // Ensure dropdown doesn't go above viewport
      const finalTop = Math.max(10, dropdownTop); // At least 10px from top

      dropdown.style.top = finalTop + 'px';
      dropdown.style.maxHeight = dropdownHeight + 'px';

      console.log('📍 Dropdown positioned ABOVE template section:', {
        templateTop: rect.top + 'px',
        dropdownTop: finalTop + 'px',
        dropdownHeight: dropdownHeight + 'px',
        gap: (rect.top - finalTop - dropdownHeight) + 'px'
      });
    }

    this.templateDropdownOpen = true;
    dropdown.style.display = 'block';
    if (chevron) chevron.textContent = '▲';

    // Populate template list
    this.populateTemplateList();
  }

  hideTemplateDropdown() {
    const dropdown = document.getElementById('template-dropdown');
    const chevron = document.getElementById('template-chevron');

    if (!dropdown) return;

    this.templateDropdownOpen = false;
    dropdown.style.display = 'none';
    if (chevron) chevron.textContent = '▼';
  }

  populateTemplateList(searchQuery = '') {
    console.log('📋 populateTemplateList called, searchQuery:', searchQuery, 'templates:', this.templates.length);
    const templateList = document.getElementById('template-list');
    if (!templateList) {
      console.error('❌ template-list element not found!');
      return;
    }

    // Filter templates by search query
    const filtered = searchQuery
      ? this.templates.filter(t =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : this.templates;

    console.log('📋 Filtered templates:', filtered.length);

    // Build "Default (No Template)" option at the top
    const defaultOption = `
      <div class="template-item" data-template-id="none" style="padding:10px; cursor:pointer; border-bottom:1px solid #E5E7EB; font-size:13px; ${!this.selectedTemplate ? 'background:#F0F9FF' : ''}">
        <div style="font-weight:500; color:#111827">Default (No Template)</div>
        <div style="font-size:11px; color:#6B7280; margin-top:2px">Use system default summary format</div>
      </div>
    `;

    if (filtered.length === 0) {
      // Show default option even if no templates match search
      templateList.innerHTML = defaultOption + '<div style="padding:12px; text-align:center; color:#9CA3AF; font-size:12px">No templates found</div>';
      return;
    }

    // Build template items with default option at top
    const templateItems = filtered
      .map(
        template => `
        <div class="template-item" data-template-id="${template.id}" style="padding:10px; cursor:pointer; border-bottom:1px solid #F3F4F6; font-size:13px; ${this.selectedTemplate?.id === template.id ? 'background:#F0F9FF' : ''}">
          <div style="font-weight:500; color:#111827">${template.name}</div>
          ${template.category ? `<div style="font-size:11px; color:#6B7280; margin-top:2px">${template.category}</div>` : ''}
        </div>
      `
      )
      .join('');

    templateList.innerHTML = defaultOption + templateItems;

    // Add click handlers
    templateList.querySelectorAll('.template-item').forEach(item => {
      item.addEventListener('click', () => {
        const templateId = item.getAttribute('data-template-id');
        this.selectTemplate(templateId);
      });
    });
  }

  selectTemplate(templateId) {
    // Handle "Default (No Template)" option
    if (templateId === 'none') {
      console.log('📋 Template cleared - using default (no template)');
      this.selectedTemplate = null;
      this.updateTemplateDisplay();
      this.hideTemplateDropdown();
      return;
    }

    const template = this.templates.find(t => t.id === templateId);

    if (template) {
      console.log('📋 Template selected:', template.name);
      this.selectedTemplate = template;
      this.updateTemplateDisplay();
      this.hideTemplateDropdown();
    }
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

  // Multi-Consult Management
  async handlePatientSwitch() {
    console.log('🔄 Handling patient switch...');

    // If currently recording, auto-pause and save
    if (this.currentState === 'recording' && this.consultationId) {
      console.log('💾 Auto-pausing current consultation');

      // Pause the recording
      if (!this.isPaused) {
        this.recordingManager.pauseRecording();
        this.isPaused = true;
        clearInterval(this.timerInterval);
      }

      // Save current consultation state
      const consultState = {
        patientId: this.currentPatient.id,
        patient: {...this.currentPatient},
        consultationId: this.consultationId,
        sessionId: this.sessionId,
        timerSeconds: this.timerSeconds,
        photos: [...this.photos],
        state: 'paused',
        pausedAt: new Date().toISOString()
      };

      this.activeConsultations.set(this.currentPatient.id, consultState);
      console.log('✅ Consultation saved', consultState);
    }
  }

  async loadConsultation(consultState) {
    console.log('📂 Loading consultation:', consultState);

    // Restore consultation data
    this.consultationId = consultState.consultationId;
    this.sessionId = consultState.sessionId;
    this.timerSeconds = consultState.timerSeconds;
    this.photos = consultState.photos || [];
    this.activeConsultationId = consultState.consultationId;

    // Update UI with patient info
    this.updatePatientUI(consultState.patient);

    // Restore to recording state (paused)
    this.showState('recording');
    this.isPaused = true;

    // Update timer display
    this.updateTimer();

    // Update pause button
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.innerHTML = '▶ Resume';
      document.getElementById('recording-status').textContent = 'Paused';
    }

    // Reload photos
    this.renderPhotos();

    console.log('✅ Consultation loaded');
  }

  updatePausedConsultationsGrid() {
    const pausedGrid = document.getElementById('pausedGrid');
    const pausedSection = document.getElementById('paused-consultations');

    if (!pausedGrid || !pausedSection) return;

    // Clear current grid
    pausedGrid.innerHTML = '';

    // Show/hide section based on active consultations
    if (this.activeConsultations.size === 0) {
      pausedSection.style.display = 'none';
      return;
    }

    pausedSection.style.display = 'block';

    // Add cards for each paused consultation
    this.activeConsultations.forEach((consult, patientId) => {
      const card = document.createElement('div');
      card.className = 'paused-card';
      if (patientId === this.currentPatient?.id) {
        card.classList.add('active');
      }

      const pausedTime = new Date(consult.pausedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      card.innerHTML = `
        <div class="paused-card-name">${consult.patient.name}</div>
        <div class="paused-card-time">
          <span class="pause-icon">⏸</span>
          <span>${pausedTime}</span>
        </div>
      `;

      // Click handler to switch to this consultation
      card.addEventListener('click', async () => {
        console.log('🔄 Switching to paused consultation:', consult.patient.name);

        // Save current consultation if different
        if (this.currentPatient && this.currentPatient.id !== patientId) {
          await this.handlePatientSwitch();
        }

        // Load the clicked consultation
        this.currentPatient = consult.patient;
        await this.loadConsultation(consult);

        // Update active state
        document.querySelectorAll('.paused-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });

      pausedGrid.appendChild(card);
    });
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
      species: this.currentPatient.species,
      templateId: this.selectedTemplate?.id || null  // Include selected template
    });

    if (!result.success) {
      alert(`❌ Failed to start recording: ${result.error}`);
      return;
    }

    // Store consultation and session IDs
    this.consultationId = result.consultationId;
    this.sessionId = result.sessionId;

    console.log('✅ Recording started:', { consultationId: this.consultationId, sessionId: this.sessionId });

    // Load existing photos if any (async, don't block)
    this.loadExistingPhotos(this.consultationId);

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

    // Start progress tracking from 0%
    this.updateProgress(0);

    // Smoothly animate to 10% at start (simulate initial processing)
    await this.animateProgress(0, 10, 300);

    // Track transcription progress while stopping recording
    const totalChunks = this.recordingManager.processedChunks.size || 1;
    let lastChunkCount = 0;
    let currentProgress = 10;

    // Poll chunk progress during stopRecording (10% → 45%)
    const progressInterval = setInterval(() => {
      const currentChunks = this.recordingManager.processedChunks.size;
      if (currentChunks > lastChunkCount) {
        lastChunkCount = currentChunks;
        // Map chunks to 10-45% progress (35% range)
        const targetProgress = Math.min(45, 10 + (currentChunks / Math.max(totalChunks, 1)) * 35);
        if (targetProgress > currentProgress) {
          currentProgress = targetProgress;
          this.updateProgress(currentProgress);
          console.log(`📊 Transcription progress: ${currentChunks}/${totalChunks} chunks = ${Math.round(currentProgress)}%`);
        }
      }
    }, 200);

    // Stop recording and complete session
    const result = await this.recordingManager.stopRecording();

    // Stop progress polling
    clearInterval(progressInterval);

    // Smoothly animate from current to 50% (transcription complete)
    await this.animateProgress(currentProgress, 50, 400);

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

    // TRIGGER summary generation with HTTP SSE streaming
    console.log('🤖 Triggering AI summary generation with HTTP SSE streaming...');

    // Smoothly animate to 55% (preparing summary)
    await this.animateProgress(50, 55, 300);

    // Then animate to 60% (summary generation starting)
    await this.animateProgress(55, 60, 300);

    let firstChunk = true;

    try {
      const summaryResult = await summaryService.generateSummary(
        this.consultationId,
        {
          templateId: this.selectedTemplate?.id || null,
          onChunk: async (data) => {
            // First chunk = animate to 70% progress, switch to completed state
            if (firstChunk) {
              firstChunk = false;
              console.log('📝 First summary chunk arrived - switching to completed state at 70%');
              await this.animateProgress(60, 70, 400);
            }

            // Update UI with streaming chunks (already switches state in displayPartialSummary)
            console.log('📝 Summary chunk:', data.accumulated.length, 'chars');
            this.displayPartialSummary(data.accumulated);
          },
          onProgress: (progress) => {
            // Map summary progress from 70% to 95% (save 95-100 for completion)
            const mappedProgress = 70 + (progress * 25);
            console.log('📊 Summary progress:', Math.round(mappedProgress), '%');
            this.updateProgress(mappedProgress);
          },
          onComplete: async (data) => {
            console.log('✅ Summary complete:', data.summary);
            // Smoothly animate from 95% to 100%
            await this.animateProgress(95, 100, 500);
            // Ensure we're showing completed state with final summary
            this.showCompletedState(data.summary);
          },
          onError: (error) => {
            console.error('❌ Summary error:', error);

            // Check if it's a transcription issue
            if (error.message?.includes('No transcript') || error.message?.includes('transcription')) {
              this.showState('ready');
              alert('⚠️ Recording failed to transcribe.\n\nPossible causes:\n- Recording too short (need 15+ seconds)\n- No audio detected\n- Background transcription issue\n\nPlease try recording again and speak clearly into the microphone.');
            } else {
              alert('❌ Summary generation failed: ' + error.message);
              this.showState('recording');
            }
          }
        }
      );

      if (!summaryResult.success) {
        // Fallback to polling if HTTP SSE streaming fails
        console.warn('⚠️ HTTP SSE streaming unavailable, falling back to polling');
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

  /**
   * Display partial summary during streaming (ChatGPT-like progressive display)
   * Shows directly in completed state, matching web app flow
   * @param {string} text - Accumulated summary text so far
   */
  /**
   * Update progress bar during summary generation
   * @param {number} progress - Progress percentage (0-100)
   */
  updateProgress(progress) {
    const progressBar = document.getElementById('summary-progress-bar');
    const progressText = document.getElementById('summary-progress-text');
    const progressContainer = document.getElementById('summary-progress-container');

    if (progressContainer && progressContainer.style.display === 'none') {
      progressContainer.style.display = 'block';
    }

    if (progressBar) {
      progressBar.style.width = progress + '%';
    }
    if (progressText) {
      progressText.textContent = Math.round(progress) + '%';
    }
  }

  /**
   * Smoothly animate progress bar from start to end value
   * @param {number} start - Starting progress percentage
   * @param {number} end - Ending progress percentage
   * @param {number} duration - Animation duration in milliseconds
   * @returns {Promise<void>}
   */
  animateProgress(start, end, duration) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const diff = end - start;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out function for smooth deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = start + (diff * easeOut);

        this.updateProgress(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.updateProgress(end);
          resolve();
        }
      };

      animate();
    });
  }

  displayPartialSummary(text) {
    if (!text) return;

    // Switch to completed state if not already there
    const currentState = document.getElementById('completed-state');
    if (currentState && currentState.style.display === 'none') {
      console.log('📝 First chunk arrived, switching to completed state');
      this.showState('completed');
    }

    // Update progress bar in processing state (if still visible)
    const progressContainer = document.getElementById('summary-progress-container');
    if (progressContainer && progressContainer.style.display !== 'none') {
      // Estimate progress based on text length (rough heuristic: 500 chars = 100%)
      const estimatedProgress = Math.min(95, (text.length / 500) * 100);
      this.updateProgress(estimatedProgress);
    }

    // Update the summary content in completed state (progressive streaming like ChatGPT)
    const summaryContent = document.getElementById('summaryContent');
    if (summaryContent) {
      const formattedText = this.formatSummary(text);
      summaryContent.innerHTML = formattedText;

      // Auto-scroll to bottom to show latest content (like ChatGPT)
      summaryContent.scrollTop = summaryContent.scrollHeight;
    }
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

      // Automatically inject summary into EzyVet after displaying
      this.autoInjectIntoEzyVet(summary);
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

  // Photo Upload Methods
  async uploadPhoto(file) {
    console.log('📸 Uploading photo:', file.name);

    // Validate file
    if (!file.type.startsWith('image/')) {
      alert('❌ Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('❌ Image must be smaller than 5MB');
      return;
    }

    // Check consultation ID
    if (!this.consultationId) {
      alert('❌ No active consultation');
      return;
    }

    // Create preview immediately (optimistic UI)
    const tempId = `temp-${Date.now()}`;
    const previewUrl = URL.createObjectURL(file);
    this.addPhotoToGrid(tempId, previewUrl, true); // true = uploading
    this.uploadingPhotos.add(tempId);

    try {
      // Upload to backend with retry
      const result = await PhotoService.uploadPhotoWithRetry(
        this.consultationId,
        file,
        '', // caption
        3  // max retries
      );

      if (result.success) {
        console.log('✅ Photo uploaded successfully:', result.photo.id);

        // Replace temp photo with real photo data
        this.removePhotoFromGrid(tempId);
        this.uploadingPhotos.delete(tempId);

        // Add real photo
        this.addPhotoToGrid(result.photo.id, result.photo.url, false);
        this.photos.push(result.photo);
        this.updatePhotoCount();
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('❌ Photo upload failed:', error);
      this.removePhotoFromGrid(tempId);
      this.uploadingPhotos.delete(tempId);
      alert(`❌ Failed to upload photo: ${error.message}`);
    }
  }

  addPhotoToGrid(photoId, photoUrl, isUploading = false) {
    const grid = document.getElementById('photosGrid');
    const addBtn = document.getElementById('addPhotoBtn');

    if (!grid || !addBtn) return;

    const photoDiv = document.createElement('div');
    photoDiv.className = `photo-thumbnail ${isUploading ? 'photo-uploading' : ''}`;
    photoDiv.id = `photo-${photoId}`;
    photoDiv.style.backgroundImage = `url(${photoUrl})`;

    // Add remove button (only for uploaded photos)
    if (!isUploading) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '×';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.deletePhoto(photoId);
      };
      photoDiv.appendChild(removeBtn);
    }

    // Insert before the "+" button
    grid.insertBefore(photoDiv, addBtn);
  }

  removePhotoFromGrid(photoId) {
    const photoEl = document.getElementById(`photo-${photoId}`);
    if (photoEl) {
      photoEl.remove();
    }
  }

  updatePhotoCount() {
    const count = this.photos.length;
    const badge = document.getElementById('photoCount');
    if (badge) {
      badge.textContent = count;
    }
  }

  async deletePhoto(photoId) {
    if (!confirm('Delete this photo?')) return;

    console.log('🗑️ Deleting photo:', photoId);

    try {
      const result = await PhotoService.deletePhoto(this.consultationId, photoId);

      if (result.success) {
        console.log('✅ Photo deleted successfully');
        this.removePhotoFromGrid(photoId);
        this.photos = this.photos.filter(p => p.id !== photoId);
        this.updatePhotoCount();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ Failed to delete photo:', error);
      alert(`❌ Failed to delete photo: ${error.message}`);
    }
  }

  async loadExistingPhotos(consultationId) {
    try {
      console.log('📸 Loading existing photos for consultation:', consultationId);
      const result = await PhotoService.getPhotos(consultationId);

      if (result.success && result.photos) {
        console.log(`✅ Loaded ${result.photos.length} photos`);
        this.photos = result.photos;

        // Display in grid
        result.photos.forEach(photo => {
          this.addPhotoToGrid(photo.id, photo.url, false);
        });

        this.updatePhotoCount();
      }
    } catch (error) {
      console.warn('⚠️ Failed to load existing photos:', error);
    }
  }

  resetPhotoState() {
    console.log('🔄 Resetting photo state');

    // Clear photos array
    this.photos = [];
    this.uploadingPhotos.clear();

    // Clear photo grid (keep only "+" button)
    const grid = document.getElementById('photosGrid');
    const addBtn = document.getElementById('addPhotoBtn');

    if (grid && addBtn) {
      grid.innerHTML = '';
      grid.appendChild(addBtn);
    }

    // Reset counter
    this.updatePhotoCount();
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

    // Reset photos
    this.resetPhotoState();

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
          summary: summaryText,
          photos: this.photos  // ✅ NEW: Include photos
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

  /**
   * Automatically inject summary into EzyVet History form
   * @param {string} summary - The AI-generated summary text
   */
  async autoInjectIntoEzyVet(summary) {
    console.log('🎯 Auto-injecting summary into EzyVet History form...');

    try {
      // Query for EzyVet tabs
      const tabs = await chrome.tabs.query({ url: '*://*.ezyvet.com/*' });

      if (tabs.length === 0) {
        console.warn('⚠️ No EzyVet tabs found - skipping auto-injection');
        return;
      }

      // Use the first EzyVet tab found
      const ezyvetTab = tabs[0];
      console.log('✅ Found EzyVet tab:', ezyvetTab.id);

      // Send injection request to content script
      chrome.tabs.sendMessage(ezyvetTab.id, {
        action: 'injectHistory',
        summaryText: summary,
        photos: this.photos  // ✅ NEW: Include photos
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Auto-injection failed:', chrome.runtime.lastError);
          console.log('💡 User can still manually click "Insert into EzyVet" button');
        } else if (response && response.success) {
          console.log('✅ Summary auto-injected successfully into EzyVet History!');
          // Optional: Show a subtle notification to user
          this.showInjectionSuccess();
        } else {
          console.error('❌ Auto-injection failed:', response?.error);
          console.log('💡 User can still manually click "Insert into EzyVet" button');
        }
      });

    } catch (error) {
      console.error('❌ Auto-injection error:', error);
      console.log('💡 User can still manually click "Insert into EzyVet" button');
    }
  }

  /**
   * Show subtle success notification for auto-injection
   */
  showInjectionSuccess() {
    // Create a temporary success indicator
    const indicator = document.createElement('div');
    indicator.textContent = '✅ Summary auto-injected into EzyVet';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(52, 199, 89, 0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(indicator);

    // Remove after 3 seconds
    setTimeout(() => {
      indicator.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        indicator.remove();
      }, 300);
    }, 3000);
  }

  // ============================================
  // PAUSED CONSULTATIONS MANAGEMENT
  // ============================================

  /**
   * Show paused consultations grid
   */
  showPausedConsultations(pausedConsultations) {
    const pausedSection = document.getElementById('paused-consultations');
    const pausedGrid = document.getElementById('pausedGrid');

    if (!pausedConsultations || pausedConsultations.length === 0) {
      pausedSection.style.display = 'none';
      return;
    }

    // Clear existing cards
    pausedGrid.innerHTML = '';

    // Create card for each paused consultation
    pausedConsultations.forEach(consultation => {
      const card = this.createPausedCard(consultation);
      pausedGrid.appendChild(card);
    });

    pausedSection.style.display = 'block';
  }

  /**
   * Create paused consultation card
   */
  createPausedCard(consultation) {
    const card = document.createElement('div');
    card.className = 'paused-card';

    const patientName = document.createElement('div');
    patientName.className = 'paused-card-patient';
    patientName.textContent = consultation.patientName || 'Unknown Patient';

    const timeContainer = document.createElement('div');
    timeContainer.className = 'paused-card-time';

    const icon = document.createElement('span');
    icon.className = 'paused-card-icon';
    icon.textContent = '⏸️';

    const time = document.createElement('span');
    time.textContent = this.formatPauseTime(consultation.pausedAt);

    timeContainer.appendChild(icon);
    timeContainer.appendChild(time);

    card.appendChild(patientName);
    card.appendChild(timeContainer);

    // Click handler to resume consultation
    card.addEventListener('click', () => {
      this.resumeConsultation(consultation);
    });

    return card;
  }

  /**
   * Format pause time for display
   */
  formatPauseTime(pausedAt) {
    if (!pausedAt) return 'Unknown';

    const pauseDate = new Date(pausedAt);
    const now = new Date();
    const diffMs = now - pauseDate;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  /**
   * Resume a paused consultation
   */
  async resumeConsultation(consultation) {
    console.log('▶️ Resuming consultation:', consultation);

    // Load consultation data
    this.consultationId = consultation.id;
    this.sessionId = consultation.sessionId;
    this.currentPatient = {
      name: consultation.patientName,
      species: consultation.patientSpecies,
      id: consultation.patientId,
      dateOfBirth: consultation.patientDob
    };

    // Load photos if any
    if (consultation.photos && consultation.photos.length > 0) {
      this.photos = consultation.photos;
      this.updatePhotoGrid();
    }

    // Resume recording
    this.switchState('recording');
    this.updatePatientInfo();

    // Start timer from saved duration
    if (consultation.duration) {
      this.timerSeconds = consultation.duration;
    }
    this.startTimer();

    // Resume MediaRecorder
    await this.recordingManager.resumeRecording();
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
