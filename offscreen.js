// Offscreen Document for Audio Recording - VERSION 2.0
// Chrome extensions need an offscreen document to access getUserMedia()

console.log('🎙️ Offscreen audio recorder loaded - VERSION 2.0');
console.log('🎙️ Ready to receive recording messages');

// Audio recording state
let mediaRecorder = null;
let audioStream = null;
let chunkNumber = 0;
let chunkTimer = null;
let chunkStartTime = 0;
let currentChunks = [];  // Collect Blob fragments for current chunk
let isSwapping = false;  // Track if we're currently swapping recorders
const chunkDuration = 15000; // 15 seconds

// Listen for messages from sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Offscreen received message:', message.type);

  switch (message.type) {
    case 'START_RECORDING':
      startRecording()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    case 'STOP_RECORDING':
      stopRecording()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'PAUSE_RECORDING':
      pauseRecording();
      sendResponse({ success: true });
      return true;

    case 'RESUME_RECORDING':
      resumeRecording();
      sendResponse({ success: true });
      return true;

    case 'GET_STATE':
      sendResponse({
        success: true,
        state: mediaRecorder ? mediaRecorder.state : 'inactive'
      });
      return true;
  }
});

/**
 * Get supported MIME type for audio recording
 */
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log('✅ Supported MIME type:', type);
      return type;
    }
  }

  throw new Error('No supported audio MIME type found');
}

/**
 * Setup event handlers for MediaRecorder
 * Centralized to avoid duplicate handlers
 */
function setupRecorderHandlers(recorder, mimeType) {
  // Handle data available - collect Blob fragments
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      console.log(`📦 Blob fragment received: ${event.data.size} bytes`);
      currentChunks.push(event.data);
    }
  };

  // Handle recording stop - process complete chunk
  recorder.onstop = () => {
    console.log('🛑 MediaRecorder stopped, processing complete chunk');

    if (currentChunks.length > 0) {
      const actualMimeType = currentChunks[0]?.type || mimeType;
      const combinedBlob = new Blob(currentChunks, { type: actualMimeType });
      const durationInSeconds = (Date.now() - chunkStartTime) / 1000;

      console.log(`✅ Complete chunk ${chunkNumber} ready:`, {
        fragments: currentChunks.length,
        totalSize: combinedBlob.size,
        duration: durationInSeconds,
        type: combinedBlob.type
      });

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];

        chrome.runtime.sendMessage({
          type: 'AUDIO_CHUNK',
          chunk: {
            data: base64data,
            mimeType: combinedBlob.type,
            duration: durationInSeconds,
            chunkNumber: chunkNumber,
            size: combinedBlob.size
          }
        });

        chunkNumber++;
        currentChunks = [];
      };
      reader.readAsDataURL(combinedBlob);
    }
  };

  // Handle errors
  recorder.onerror = (event) => {
    console.error('❌ MediaRecorder error:', event.error);
    chrome.runtime.sendMessage({
      type: 'RECORDING_ERROR',
      error: event.error.message
    });
  };
}

/**
 * Start audio recording
 */
async function startRecording() {
  try {
    console.log('🎤 Requesting microphone access...');
    console.log('🔍 Checking if getUserMedia is available...');
    console.log('🔍 navigator.mediaDevices:', navigator.mediaDevices);
    console.log('🔍 navigator.mediaDevices.getUserMedia:', navigator.mediaDevices?.getUserMedia);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia is not available in this context');
    }

    // Check current permissions state
    console.log('🔐 Checking microphone permission state...');
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      console.log('🔐 Current permission state:', permissionStatus.state);

      if (permissionStatus.state === 'denied') {
        throw new Error('Microphone permission was previously denied by user. Please allow microphone access in browser settings.');
      }
    } catch (permError) {
      console.warn('⚠️ Could not query permission status:', permError);
      // Continue anyway, getUserMedia will show the prompt
    }

    // Request microphone access
    console.log('📞 Calling getUserMedia...');
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      }
    });

    console.log('✅ Microphone access granted');

    const mimeType = getSupportedMimeType();

    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 128000
    });

    chunkNumber = 0;
    currentChunks = [];
    chunkStartTime = Date.now();

    // Setup event handlers (centralized function)
    setupRecorderHandlers(mediaRecorder, mimeType);

    // Start recording WITHOUT timeslice (webapp pattern)
    mediaRecorder.start();
    console.log(`✅ Recording started (continuous, manual ${chunkDuration}ms chunks)`);

    // Start manual chunk timer (webapp pattern)
    chunkTimer = setInterval(() => {
      console.log('⏰ Chunk timer triggered - swapping recorder');
      swapRecorder(mimeType);
    }, chunkDuration);

    return {
      success: true,
      mimeType
    };

  } catch (error) {
    console.error('❌ Failed to start recording (FULL ERROR):', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);

    let errorMessage = error.message;
    if (error.name === 'NotAllowedError') {
      errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
      console.error('❌ This is a NotAllowedError - Chrome blocked microphone access');
      console.error('❌ This should NOT happen in offscreen document!');
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'No microphone found. Please connect a microphone and try again.';
    }

    console.error('❌ Returning error to background script:', errorMessage);

    return {
      success: false,
      error: errorMessage,
      errorName: error.name,
      errorDetails: error.message
    };
  }
}

/**
 * Stop recording
 */
async function stopRecording() {
  // Clear chunk timer first
  if (chunkTimer) {
    clearInterval(chunkTimer);
    chunkTimer = null;
    console.log('⏱️ Chunk timer cleared');
  }

  // Wait for any pending swap to complete
  let waitCount = 0;
  while (isSwapping && waitCount < 20) {  // Max 2 seconds
    console.log('⏳ Waiting for recorder swap to complete...');
    await new Promise(resolve => setTimeout(resolve, 100));
    waitCount++;
  }

  if (isSwapping) {
    console.warn('⚠️ Swap still in progress, forcing stop');
  }

  return new Promise((resolve) => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('🛑 Stopping recording...');

      mediaRecorder.onstop = () => {
        console.log('✅ Recording stopped, processing final chunk');

        // CRITICAL: Process any remaining audio in currentChunks
        if (currentChunks.length > 0) {
          const mimeType = currentChunks[0]?.type || 'audio/webm;codecs=opus';
          const combinedBlob = new Blob(currentChunks, { type: mimeType });
          const durationInSeconds = (Date.now() - chunkStartTime) / 1000;

          console.log(`📦 Final chunk ${chunkNumber} ready:`, {
            fragments: currentChunks.length,
            totalSize: combinedBlob.size,
            duration: durationInSeconds,
            type: combinedBlob.type
          });

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];

            chrome.runtime.sendMessage({
              type: 'AUDIO_CHUNK',
              chunk: {
                data: base64data,
                mimeType: combinedBlob.type,
                duration: durationInSeconds,
                chunkNumber: chunkNumber,
                size: combinedBlob.size
              }
            });

            console.log('✅ Final chunk sent, cleaning up');

            // Now clean up
            if (audioStream) {
              audioStream.getTracks().forEach(track => track.stop());
              audioStream = null;
            }

            mediaRecorder = null;
            chunkNumber = 0;
            currentChunks = [];
            isSwapping = false;

            resolve({ success: true });
          };
          reader.readAsDataURL(combinedBlob);
        } else {
          console.warn('⚠️ No audio data recorded in final chunk');

          // Clean up anyway
          if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
          }

          mediaRecorder = null;
          chunkNumber = 0;
          currentChunks = [];
          isSwapping = false;

          resolve({ success: true });
        }
      };

      mediaRecorder.stop();
    } else {
      // Stop all audio tracks even if recorder inactive
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }

      isSwapping = false;
      resolve({ success: true });
    }
  });
}

/**
 * Pause recording
 */
function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    console.log('⏸️ Recording paused');
  }
}

/**
 * Resume recording
 */
function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    console.log('▶️ Recording resumed');
  }
}

/**
 * Swap recorder to create chunk boundary (webapp pattern)
 * Stops current recorder → waits → starts new recorder
 */
async function swapRecorder(mimeType) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    console.warn('⚠️ Cannot swap recorder - not active');
    return;
  }

  if (isSwapping) {
    console.warn('⚠️ Already swapping recorder, skipping');
    return;
  }

  isSwapping = true;
  console.log('🔄 Swapping recorder to create chunk boundary');

  try {
    // Stop current recorder (this will trigger onstop → chunk processing)
    mediaRecorder.stop();

    // Wait for stop to process completely and chunk to upload
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check if we're still recording (not stopped by user)
    if (!audioStream) {
      console.log('⚠️ Stream closed, aborting swap');
      isSwapping = false;
      return;
    }

    // Start new recorder for next chunk
    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 128000
    });

    // Reset chunk collection
    currentChunks = [];
    chunkStartTime = Date.now();

    // Setup event handlers (centralized function)
    setupRecorderHandlers(mediaRecorder, mimeType);

    // Start recording again (continuous, no timeslice)
    mediaRecorder.start();
    console.log('✅ New recorder started for next chunk');
  } finally {
    isSwapping = false;
  }
}
