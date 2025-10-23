// BrobyVets Content Script
console.log('🐾 BrobyVets: Content script LOADED');

if (!window.brobyVetsInitialized) {
  window.brobyVetsInitialized = true;
  let currentPatient = null;
  let isExtensionValid = true;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Store references so we can clean them up
  let observer = null;
  let checkInterval = null;

  function extractPatientInfo() {
    const popupTitle = document.querySelector('.popupFormHeader .titleHolder');

    if (popupTitle) {
      const titleText = popupTitle.textContent.trim();
      const match = titleText.match(/New History for (.+?) \((\d+)\)/);

      if (match) {
        return {
          name: match[1].trim(),
          id: match[2],
          species: extractSpecies(),
          date: new Date().toLocaleDateString()
        };
      }
    }

    const allText = document.body.innerText;
    const patientMatch = allText.match(/Patient\s+([^\n]+)\s+Animal ID:\s*_?(\d+)/);

    if (patientMatch) {
      return {
        name: patientMatch[1].trim(),
        id: patientMatch[2],
        species: extractSpecies(),
        date: new Date().toLocaleDateString()
      };
    }

    return null;
  }

  function extractSpecies() {
    const text = document.body.textContent;
    if (text.includes('Canine') || text.includes('Dog')) return 'Dog';
    if (text.includes('Feline') || text.includes('Cat')) return 'Cat';
    return 'Unknown';
  }

  function handleInvalidContext() {
    if (isExtensionValid) {
      isExtensionValid = false;
      console.log('⚠️ BrobyVets: Extension reloaded. Patient detection paused.');

      // Stop observer and intervals to prevent error spam
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }

      // Attempt reconnection
      attemptReconnect();
    }
  }

  function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('ℹ️ BrobyVets: Please refresh the page to restore patient detection.');
      return;
    }

    reconnectAttempts++;
    setTimeout(() => {
      // Test if extension context is now valid
      try {
        if (chrome.runtime?.id) {
          // Try a simple connection test
          chrome.runtime.sendMessage({ type: 'PING' }, () => {
            if (!chrome.runtime.lastError) {
              console.log('✅ BrobyVets: Connection restored! Reinitializing...');
              isExtensionValid = true;
              reconnectAttempts = 0;
              initialize();
            } else {
              attemptReconnect();
            }
          });
        } else {
          attemptReconnect();
        }
      } catch (e) {
        attemptReconnect();
      }
    }, 2000);
  }

  function notifyPatientChange(patient) {
    console.log('📤 SENDING TO BACKGROUND:', patient);

    // Check if extension context is valid
    if (!chrome.runtime?.id) {
      handleInvalidContext();
      return;
    }

    chrome.runtime.sendMessage({
      type: 'PATIENT_CHANGED',
      patient: patient
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('⚠️ Message failed:', chrome.runtime.lastError.message);
        handleInvalidContext();
      } else {
        console.log('✅ Background confirmed receipt:', response);
      }
    });
  }

  function checkPatient() {
    // Don't check if extension is invalid
    if (!isExtensionValid) return;

    const patient = extractPatientInfo();

    if (patient && patient.id) {
      if (!currentPatient || currentPatient.id !== patient.id) {
        console.log('🎯 NEW PATIENT:', patient.name, 'ID:', patient.id);
        currentPatient = patient;
        notifyPatientChange(patient);
      }
    }
  }

  function initialize() {
    console.log('🚀 Initializing patient detection...');

    // Setup message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'REQUEST_PATIENT') {
        console.log('🔄 Sidebar requested patient');
        checkPatient();
        sendResponse({ success: true });
      }
      return true;
    });

    // Initial patient checks
    setTimeout(checkPatient, 1000);
    setTimeout(checkPatient, 2000);

    // Setup mutation observer
    observer = new MutationObserver(() => {
      if (!isExtensionValid) return;

      if (document.querySelector('.popupFormHeader') && !currentPatient) {
        setTimeout(checkPatient, 300);
      }

      if (location.href !== window.lastUrl) {
        window.lastUrl = location.href;
        currentPatient = null;
        setTimeout(checkPatient, 500);
      }
    });

    observer.observe(document.body, { subtree: true, childList: true });

    // Periodic check
    checkInterval = setInterval(checkPatient, 5000);

    console.log('✅ Patient detection initialized');
  }

  // Start initialization
  initialize();
}
