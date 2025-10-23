# How to Reload the Chrome Extension

After making changes to the code, you need to reload the extension:

## Step 1: Go to Chrome Extensions Page
1. Open Chrome
2. Go to `chrome://extensions/`
3. Make sure "Developer mode" is ON (top right toggle)

## Step 2: Reload the Extension
1. Find "BrobyVets" in the list
2. Click the **circular reload icon** (🔄) on the extension card
3. This will reload the extension with your new changes

## Step 3: Reload EzyVet Page
1. Go back to your EzyVet tab
2. **Refresh the page** (Cmd+R or F5)
3. This ensures the content script is also reloaded

## Step 4: Open Sidebar Again
1. Click the BrobyVets extension icon
2. You should now see the updated UI!

## Quick Reload Shortcut
After code changes:
1. `chrome://extensions/` → Click reload icon (🔄)
2. Refresh EzyVet page (Cmd+R)
3. Open extension sidebar

---

**Current Status**: The new recording UI is ready but needs extension reload to appear!

**What You'll See After Reload**:
- Same "Start Consult" button (this is correct - it's the ready state)
- When you click it, you'll see: timer, waveform animation, pause/submit buttons
- BUT: The JavaScript logic isn't wired up yet, so clicking won't do anything

**Next Step**: Wire up the JavaScript state transitions so clicking "Start Consult" actually shows the recording UI.
