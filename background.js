console.log('🐾 BrobyVets: Background STARTED - VERSION 3.0 (SETUP PAGE FIX)');
console.log('✅ Offscreen message forwarding enabled');

// Open setup page on install or update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('📦 Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    console.log('🎉 First install - opening setup page');
    chrome.tabs.create({ url: 'setup.html' });
  } else if (details.reason === 'update') {
    // Check if setup was completed in previous version
    chrome.storage.local.get('setupComplete', (result) => {
      if (!result.setupComplete) {
        console.log('⚠️ Update detected, setup not complete - opening setup page');
        chrome.tabs.create({ url: 'setup.html' });
      } else {
        console.log('✅ Update detected, setup already complete');
      }
    });
  }
});

// Offscreen document management
let offscreenDocumentCreated = false;

async function createOffscreenDocument() {
  if (offscreenDocumentCreated) {
    console.log('ℹ️ Offscreen document already exists');
    return;
  }

  try {
    console.log('📝 Creating offscreen document with USER_MEDIA reason...');
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording audio for veterinary consultation summaries'
    });
    offscreenDocumentCreated = true;
    console.log('✅ Offscreen document created successfully');

    // Wait a bit for offscreen document to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('✅ Offscreen document should be ready now');
  } catch (error) {
    console.error('❌ Failed to create offscreen document:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    throw error;
  }
}

async function closeOffscreenDocument() {
  if (!offscreenDocumentCreated) {
    return;
  }

  try {
    await chrome.offscreen.closeDocument();
    offscreenDocumentCreated = false;
    console.log('✅ Offscreen document closed');
  } catch (error) {
    console.error('❌ Failed to close offscreen document:', error);
  }
}

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

  if (message.type === 'PING') {
    // Connection test for content script reconnection
    sendResponse({ success: true });
    return true;
  }

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

  // Offscreen document control messages
  if (message.type === 'CREATE_OFFSCREEN') {
    createOffscreenDocument()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'CLOSE_OFFSCREEN') {
    closeOffscreenDocument()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Forward recording control messages to offscreen document
  if (message.type === 'START_RECORDING' ||
      message.type === 'STOP_RECORDING' ||
      message.type === 'PAUSE_RECORDING' ||
      message.type === 'RESUME_RECORDING' ||
      message.type === 'GET_STATE') {

    console.log(`🔄 Forwarding ${message.type} to offscreen document`);

    // Forward to offscreen document and wait for response
    chrome.runtime.sendMessage(message)
      .then(response => {
        console.log(`✅ Offscreen response for ${message.type}:`, response);
        sendResponse(response);
      })
      .catch(error => {
        console.error(`❌ Offscreen error for ${message.type}:`, error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  }

  // Forward audio chunks from offscreen to sidebar
  if (message.type === 'AUDIO_CHUNK') {
    console.log('📦 Forwarding audio chunk to sidebar');
    // Broadcast to sidebar
    chrome.runtime.sendMessage(message);
    return false;
  }

  // Forward recording errors from offscreen to sidebar
  if (message.type === 'RECORDING_ERROR') {
    console.log('❌ Forwarding recording error to sidebar');
    chrome.runtime.sendMessage(message);
    return false;
  }

  return false;
});

console.log('✅ Background initialized - ready to receive messages');
