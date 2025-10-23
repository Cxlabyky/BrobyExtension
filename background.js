console.log('🐾 BrobyVets: Background STARTED');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log('✅ Side panel ready'))
  .catch(e => console.error('❌ Side panel error:', e));

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url?.includes('ezyvet.com')) {
    console.log('✅ EzyVet tab detected:', tabId);
    chrome.sidePanel.setOptions({ tabId, enabled: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 BACKGROUND RECEIVED MESSAGE:', message);
  
  if (message.type === 'PATIENT_CHANGED') {
    console.log('💾 STORING PATIENT:', message.patient);
    
    chrome.storage.local.set({ 
      currentPatient: message.patient,
      lastUpdate: Date.now()
    }).then(() => {
      console.log('✅ STORED TO CHROME.STORAGE:', message.patient.name);
      sendResponse({ success: true });
    }).catch(error => {
      console.error('❌ STORAGE ERROR:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep channel open for async response
  }
  
  return false;
});

console.log('✅ Background initialized - ready to receive messages');
