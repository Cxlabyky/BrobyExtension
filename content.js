// BrobyVets Content Script
console.log('🐾 BrobyVets: Content script LOADED');

if (!window.brobyVetsInitialized) {
  window.brobyVetsInitialized = true;
  let currentPatient = null;

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

  function notifyPatientChange(patient) {
    console.log('📤 SENDING TO BACKGROUND:', patient);
    
    // Try-catch won't help with invalidated context, but let's be explicit
    if (!chrome.runtime?.id) {
      console.error('❌ Extension context is invalidated - RELOAD THE PAGE');
      return;
    }
    
    chrome.runtime.sendMessage({
      type: 'PATIENT_CHANGED',
      patient: patient
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Message failed:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ Background confirmed receipt:', response);
      }
    });
  }

  function checkPatient() {
    const patient = extractPatientInfo();
    
    if (patient && patient.id) {
      if (!currentPatient || currentPatient.id !== patient.id) {
        console.log('🎯 NEW PATIENT:', patient.name, 'ID:', patient.id);
        currentPatient = patient;
        notifyPatientChange(patient);
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REQUEST_PATIENT') {
      console.log('🔄 Sidebar requested patient');
      checkPatient();
      sendResponse({ success: true });
    }
    return true;
  });

  setTimeout(checkPatient, 1000);
  setTimeout(checkPatient, 2000);
  
  const observer = new MutationObserver(() => {
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
  setInterval(checkPatient, 5000);
  
  console.log('✅ Patient detection initialized');
}
