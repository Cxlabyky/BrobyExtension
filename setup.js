console.log('🎙️ Setup page loaded');

const allowBtn = document.getElementById('allowBtn');
const statusDiv = document.getElementById('status');
const btnText = allowBtn.querySelector('.btn-text');
const btnSpinner = allowBtn.querySelector('.btn-spinner');

// Check if already set up
async function checkSetupStatus() {
  const { setupComplete } = await chrome.storage.local.get('setupComplete');

  if (setupComplete) {
    console.log('✅ Setup already complete');
    showSuccess();
    return true;
  }

  return false;
}

// Request microphone permission
async function requestMicrophonePermission() {
  console.log('🎤 Requesting microphone permission...');

  // Show loading state
  allowBtn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-block';
  statusDiv.innerHTML = '<p class="status-info">Please allow microphone access when prompted...</p>';

  try {
    // Request microphone access
    console.log('📞 Calling getUserMedia...');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    console.log('✅ Microphone access granted!');

    // Stop the stream immediately - we just needed the permission
    stream.getTracks().forEach(track => {
      track.stop();
      console.log('🛑 Stopped track:', track.label);
    });

    // Store that setup is complete
    await chrome.storage.local.set({
      setupComplete: true,
      setupTimestamp: Date.now()
    });

    console.log('💾 Saved setup status to storage');

    // Show success
    showSuccess();

  } catch (error) {
    console.error('❌ Microphone permission error:', error);

    // Reset button state
    allowBtn.disabled = false;
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';

    // Show error message based on error type
    if (error.name === 'NotAllowedError') {
      statusDiv.innerHTML = `
        <p class="status-error">
          ❌ Microphone access was denied.
        </p>
        <p class="status-hint">
          Please click the button again and select "Allow" when Chrome asks for permission.
        </p>
      `;
    } else if (error.name === 'NotFoundError') {
      statusDiv.innerHTML = `
        <p class="status-error">
          ❌ No microphone found.
        </p>
        <p class="status-hint">
          Please connect a microphone and try again.
        </p>
      `;
    } else {
      statusDiv.innerHTML = `
        <p class="status-error">
          ❌ Error: ${error.message}
        </p>
        <p class="status-hint">
          Please try again. If the problem persists, contact support.
        </p>
      `;
    }
  }
}

// Show success state
function showSuccess() {
  allowBtn.disabled = true;
  btnText.textContent = '✓ Setup Complete';
  btnText.style.display = 'inline';
  btnSpinner.style.display = 'none';

  statusDiv.innerHTML = `
    <div class="status-success">
      <p><strong>✅ Microphone access granted!</strong></p>
      <p>This tab will close in 2 seconds...</p>
      <p class="status-next">Go to any EzyVet patient page and open the BrobyVets sidebar to start.</p>
    </div>
  `;

  // Auto-close tab after 2 seconds
  setTimeout(() => {
    window.close();
  }, 2000);
}

// Button click handler
allowBtn.addEventListener('click', async () => {
  await requestMicrophonePermission();
});

// Check if already set up on page load
checkSetupStatus();
