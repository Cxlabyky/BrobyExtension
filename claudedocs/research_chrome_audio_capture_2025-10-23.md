# Research: Chrome Extension Audio Capture - The Real Solution

**Date**: 2025-10-23
**Research Topic**: Audio capture in Chrome Manifest V3 extensions using side panels
**Confidence Level**: HIGH (based on multiple developer sources and Chrome documentation)

---

## Executive Summary

**The Problem**: You're getting "Microphone permission denied" when trying to record audio in a Chrome extension side panel using offscreen documents.

**Root Cause**: **Side panels, popups, and offscreen documents CANNOT show microphone permission prompts.** This is a Chrome security restriction, not a bug in our code.

**The Solution**: You MUST request microphone permission in a **regular extension tab** FIRST, then the offscreen document can use it.

---

## Key Findings from Research

### 1. **Offscreen Documents Cannot Request Permissions** ⚠️

**Source**: Multiple Stack Overflow discussions (Nov 2024), Chrome Extensions Google Group

> "getUserMedia() will fail in an offscreen document, while it will request web permission if you open a normal extension page in a tab"

> "Requesting web permissions fails not only in offscreen documents but also in popup and side panel pages"

**What This Means**:
- Offscreen documents can USE `getUserMedia()`
- But they CANNOT SHOW the permission prompt
- The permission must already be granted before the offscreen document tries to use it

### 2. **The Two-Step Permission Pattern** ✅

**Source**: Chrome Extensions developers, confirmed across multiple sources

The working pattern is:

```
Step 1: Open a regular extension tab (like options.html or a dedicated permission page)
Step 2: Request microphone permission there (user sees prompt and clicks "Allow")
Step 3: NOW your offscreen document can use getUserMedia()
```

**Quote from developers**:
> "You need to first ask for permission on options.html (or any extension page), and after the user accepts, you are able to use navigator.mediaDevices.getUserMedia() inside offscreen.html"

### 3. **Working Example Repository** 📦

**Source**: https://github.com/justinmann/sidepanel-audio-issue

A developer created a working example specifically for sidepanel audio issues, demonstrating the workaround.

### 4. **Official Chrome Documentation Gaps** 📚

**Source**: https://developer.chrome.com/docs/extensions/reference/api/offscreen

The official Chrome docs say:
- `USER_MEDIA` reason: "Specifies that the offscreen document needs to interact with media streams from user media"
- Requires Chrome 109+, Manifest V3
- Must declare `"offscreen"` permission

**BUT**: The docs do NOT mention that you must request permission separately in a tab first. This is an undocumented limitation discovered by developers.

---

## Why Our Current Implementation Fails

### What We Built:
```
Sidebar → Background → Offscreen Document → getUserMedia()
```

### Why It Fails:
1. User clicks "Start Consult" in sidebar
2. Background creates offscreen document
3. Offscreen calls `getUserMedia()`
4. Chrome tries to show permission prompt
5. **Chrome blocks the prompt** because offscreen documents can't show UI
6. `getUserMedia()` fails with "NotAllowedError"

---

## The Correct Implementation

### Pattern 1: First-Time Permission Request (RECOMMENDED)

```javascript
// 1. On extension install, open a welcome/setup page
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: 'setup.html' });
});

// 2. In setup.html, request microphone permission
async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately, we just needed the permission
    stream.getTracks().forEach(track => track.stop());
    console.log('✅ Microphone permission granted!');
    // Now tell user they can use the extension
  } catch (error) {
    console.error('❌ User denied microphone permission');
  }
}

// 3. NOW when sidebar uses offscreen document, it works!
```

### Pattern 2: Check Permission Before Recording

```javascript
// In sidebar.js before starting recording
async startRecording() {
  // Check if we have permission
  const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

  if (permissionStatus.state === 'prompt') {
    // No permission yet - open a tab to request it
    chrome.tabs.create({ url: 'request-permission.html' });
    alert('Please allow microphone access in the tab that just opened');
    return;
  }

  if (permissionStatus.state === 'denied') {
    alert('Microphone permission was denied. Please enable it in browser settings.');
    return;
  }

  // Permission granted - proceed with offscreen recording
  await this.recordingManager.startRecording(patient);
}
```

### Pattern 3: Iframe Workaround (Advanced)

**Source**: Medium article by Lynchee Owo

Some developers inject an invisible iframe into the host page (via content script) to request microphone permission. This is more complex but works without opening a new tab.

---

## Alternative Approaches Considered

### ❌ Using `tabCapture` API
- **Use case**: Capturing audio FROM a browser tab
- **Not applicable**: We need to record from the user's microphone, not tab audio

### ❌ Using `audioCapture` permission
- **Problem**: Only works for Chrome packaged apps (deprecated)
- **Not available**: For Chrome extensions

### ❌ Requesting in content script
- **Security risk**: Pollutes host page, conflicts with site code
- **Not recommended**: By Chrome security team

---

## Implementation Plan for BrobyVets

### Option A: First-Time Setup Page (BEST UX)

1. **On install/update**, show a setup page that:
   - Explains why we need microphone access
   - Requests permission with `getUserMedia()`
   - Immediately closes the stream (we don't actually record yet)

2. **User flow**:
   - Install extension → Setup page opens automatically
   - "Allow microphone access for voice recordings" button
   - User clicks → Chrome shows permission prompt → User allows
   - Setup page: "✅ All set! You can now close this tab"

3. **Recording flow** (after permission granted):
   - User clicks "Start Consult" → Works immediately
   - No permission prompts during actual recording

### Option B: Just-In-Time Permission Request

1. **First recording attempt**:
   - User clicks "Start Consult"
   - Check permission state
   - If not granted: Open `request-permission.html` in new tab
   - User grants permission in that tab
   - User returns to sidebar, clicks "Start Consult" again
   - Now it works

2. **Subsequent recordings**:
   - Permission already granted
   - Recording starts immediately

---

## Code Changes Required

### 1. Create `setup.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>BrobyVets Setup</title>
  <style>
    body { font-family: Arial; max-width: 600px; margin: 50px auto; }
    button { padding: 15px 30px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>🎤 Microphone Access Required</h1>
  <p>BrobyVets needs access to your microphone to record consultations.</p>
  <button id="requestBtn">Allow Microphone Access</button>
  <div id="status"></div>
  <script src="setup.js"></script>
</body>
</html>
```

### 2. Create `setup.js`

```javascript
document.getElementById('requestBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');

  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Stop immediately - we just needed the permission
    stream.getTracks().forEach(track => track.stop());

    statusDiv.innerHTML = '<p style="color: green;">✅ Microphone access granted! You can close this tab.</p>';

    // Store that setup is complete
    chrome.storage.local.set({ setupComplete: true });

  } catch (error) {
    statusDiv.innerHTML = '<p style="color: red;">❌ Microphone access denied. Please try again.</p>';
  }
});
```

### 3. Update `manifest.json`

```json
{
  "web_accessible_resources": [{
    "resources": ["setup.html"],
    "matches": ["<all_urls>"]
  }]
}
```

### 4. Open Setup on Install (in `background.js`)

```javascript
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    chrome.tabs.create({ url: 'setup.html' });
  }
});
```

### 5. Check Permission Before Recording (in `sidebar.js`)

```javascript
async startRecording() {
  // Check if setup was completed
  const { setupComplete } = await chrome.storage.local.get('setupComplete');

  if (!setupComplete) {
    // Open setup page
    chrome.tabs.create({ url: 'setup.html' });
    alert('Please complete the setup in the tab that just opened');
    return;
  }

  // Check actual permission state
  const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

  if (permissionStatus.state !== 'granted') {
    chrome.tabs.create({ url: 'setup.html' });
    alert('Please allow microphone access in the tab that just opened');
    return;
  }

  // Permission granted - proceed with recording
  await this.recordingManager.startRecording(this.currentPatient);
}
```

---

## Testing Checklist

### Test 1: Fresh Install
1. Install extension for first time
2. Setup page should open automatically
3. Click "Allow Microphone Access"
4. Chrome shows permission prompt
5. Click "Allow"
6. See success message
7. Go to EzyVet, click "Start Consult"
8. Recording should start WITHOUT another permission prompt

### Test 2: Permission Already Denied
1. Go to `chrome://settings/content/microphone`
2. Block the extension
3. Try to start recording
4. Setup page should open
5. Try to allow again
6. Should show instructions to unblock in settings

### Test 3: After Permission Granted
1. With permission already granted
2. Click "Start Consult"
3. Should start recording immediately
4. No setup page, no prompts

---

## Sources

1. **Stack Overflow**: "I am trying to access user microphone from offscreen" (Nov 2024)
2. **Stack Overflow**: "Permission dismissed for navigator.mediaDevices.getUserMedia in offscreen" (Nov 2024)
3. **Stack Overflow**: "Accessing the microphone from a chrome extension, sidepanel" (2024)
4. **Chrome Extensions Google Group**: "Recording Mic/Audio from offscreen document"
5. **GitHub**: Chrome extensions samples, Issue #821 - MV3 user's mic and cam permissions
6. **GitHub**: justinmann/sidepanel-audio-issue (working example)
7. **Medium**: "How to Enable Microphone Access in Chrome Extensions by Code" by Lynchee Owo
8. **Chrome Developers**: Official Offscreen API documentation
9. **Chrome Developers Blog**: "Offscreen Documents in Manifest V3"

---

## Confidence Assessment

**HIGH CONFIDENCE** (90%+)

- Multiple independent sources confirm the same solution
- Working code examples exist
- Pattern is consistent across 2024 developer discussions
- Aligns with Chrome's documented security model
- Official docs confirm offscreen documents exist but don't document this limitation

**Why not 100%?**:
- Official Chrome docs don't explicitly state "must request in tab first"
- Some edge cases may exist with different Chrome versions/platforms
- Permission persistence behavior could vary

---

## Recommendation

**Implement Option A: First-Time Setup Page**

This provides the best user experience:
- ✅ Clear permission request flow
- ✅ Only happens once
- ✅ No interruption during actual recording
- ✅ Standard pattern used by professional extensions
- ✅ Matches user expectations from other recording tools

**Estimated implementation time**: 1-2 hours

**Risk level**: LOW (proven pattern with multiple working examples)
