// Offscreen Document for Audio Recording - VERSION 2.0
// Chrome extensions need an offscreen document to access getUserMedia()

console.log('🎙️ Offscreen audio recorder loaded - VERSION 2.0');
console.log('🎙️ Ready to receive recording messages');

// Audio recording state
let mediaRecorder = null;
let audioStream = null;
let chunkNumber = 0;
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

    // Handle data available (chunk ready)
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        const durationInSeconds = chunkDuration / 1000;

        console.log(`📦 Chunk ${chunkNumber} ready:`, {
          size: event.data.size,
          duration: durationInSeconds,
          type: event.data.type
        });

        // Convert blob to base64 for message passing
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];

          // Send chunk to sidebar via background script
          chrome.runtime.sendMessage({
            type: 'AUDIO_CHUNK',
            chunk: {
              data: base64data,
              mimeType: event.data.type,
              duration: durationInSeconds,
              chunkNumber: chunkNumber,
              size: event.data.size
            }
          });

          chunkNumber++;
        };
        reader.readAsDataURL(event.data);
      }
    };

    // Handle recording stop
    mediaRecorder.onstop = () => {
      console.log('🛑 MediaRecorder stopped');
    };

    // Handle errors
    mediaRecorder.onerror = (event) => {
      console.error('❌ MediaRecorder error:', event.error);
      chrome.runtime.sendMessage({
        type: 'RECORDING_ERROR',
        error: event.error.message
      });
    };

    // Start recording with time slices
    mediaRecorder.start(chunkDuration);
    console.log(`✅ Recording started (${chunkDuration}ms chunks)`);

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
  return new Promise((resolve) => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('🛑 Stopping recording...');

      mediaRecorder.onstop = () => {
        console.log('✅ Recording stopped');

        // Stop all audio tracks
        if (audioStream) {
          audioStream.getTracks().forEach(track => track.stop());
          audioStream = null;
        }

        mediaRecorder = null;
        chunkNumber = 0;

        resolve({ success: true });
      };

      mediaRecorder.stop();
    } else {
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
