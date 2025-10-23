# Photo Upload Testing Guide

## Quick Test Steps

### 1. Load Extension
```bash
1. Open Chrome
2. Go to chrome://extensions
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select: /Users/caleb/Desktop/brobyvets-working
6. Extension should load successfully
```

### 2. Test Basic Upload Flow
```
1. Open extension sidebar
2. Login with credentials
3. Select patient in EzyVet
4. Click "Start Consult"
5. Look for photo section with "+" button
6. Click "+" button
7. Select 1-2 photos
8. Verify:
   ✓ Photos show upload indicator (⏳)
   ✓ Photos appear in grid after upload
   ✓ Counter updates (shows "2")
   ✓ Hover shows delete button (×)
```

### 3. Test Delete
```
1. Hover over uploaded photo
2. Click × button
3. Confirm deletion
4. Verify:
   ✓ Photo removed from grid
   ✓ Counter decrements
   ✓ Backend deletion successful
```

### 4. Test Error Cases
```
Test large file (>10MB):
- Should show: "Image must be smaller than 10MB"

Test non-image file:
- Should show: "Please select an image file"

Test upload before consultation:
- Should show: "Please start a consultation first"
```

### 5. Test State Management
```
1. Upload 2 photos during recording
2. Click "Submit" to complete consultation
3. Click "New Consult" button
4. Verify:
   ✓ Photos cleared
   ✓ Counter reset to 0
   ✓ Grid shows only "+" button
```

## Console Verification

### Expected Console Messages

**On Upload:**
```
📸 1 photo(s) selected
📸 Uploading photo: image.jpg
✅ Photo uploaded successfully: [photo-id]
```

**On Delete:**
```
🗑️ Deleting photo: [photo-id]
✅ Photo deleted successfully
```

**On Load:**
```
📸 Loading existing photos for consultation: [consultation-id]
✅ Loaded 2 photos
```

**On Reset:**
```
🔄 Resetting photo state
```

## Manual Verification Checklist

### Visual Elements
- [ ] Photo section visible in recording state
- [ ] "+" button styled correctly (dashed border)
- [ ] Photos display as square thumbnails
- [ ] Photos scale on hover with teal border
- [ ] Remove button appears on hover (red circle)
- [ ] Upload indicator visible during upload (⏳)
- [ ] Counter badge shows correct number

### Functionality
- [ ] File picker opens on "+" click
- [ ] Multiple file selection works
- [ ] Photos upload successfully
- [ ] Photos display correctly
- [ ] Delete confirmation appears
- [ ] Delete removes photo
- [ ] Counter updates accurately
- [ ] Photos persist during pause/resume

### Error Handling
- [ ] Large file rejection works
- [ ] Non-image rejection works
- [ ] Pre-consultation blocking works
- [ ] Network errors handled gracefully
- [ ] Retry logic works (check console)

### Integration
- [ ] Photos load on consultation start
- [ ] Photos visible during recording
- [ ] Photos reset on new consultation
- [ ] No console errors
- [ ] No memory leaks (check DevTools)

## Backend API Testing

### Test Endpoints

**Upload Photo:**
```bash
POST https://backend-production-a35dc.up.railway.app/api/v1/consultations/{id}/photos
Headers: Authorization: Bearer {token}
Body: FormData { photo: File }
Expected: 200 OK with photo object
```

**Get Photos:**
```bash
GET https://backend-production-a35dc.up.railway.app/api/v1/consultations/{id}/photos
Headers: Authorization: Bearer {token}
Expected: 200 OK with photos array
```

**Delete Photo:**
```bash
DELETE https://backend-production-a35dc.up.railway.app/api/v1/consultations/{id}/photos/{photoId}
Headers: Authorization: Bearer {token}
Expected: 200 OK
```

## Debugging Tips

### Console Logs to Watch
```javascript
// Photo service logs
📸 Uploading photo
✅ Photo uploaded
❌ Photo upload failed

// UI updates
📸 Loading existing photos
🔄 Resetting photo state
🗑️ Deleting photo
```

### Common Issues

**Photos not showing:**
- Check console for errors
- Verify consultationId is set
- Check network tab for API responses

**Upload fails:**
- Check file size (<10MB)
- Check file type (image/*)
- Verify auth token is valid
- Check network connectivity

**Delete not working:**
- Verify backend endpoint exists
- Check auth headers
- Look for 404/403 errors

**Counter wrong:**
- Check `this.photos` array in console
- Verify `updatePhotoCount()` called
- Check badge element exists

## Performance Testing

### Test Scenarios
1. Upload 10 photos sequentially
2. Upload 3 photos with slow network (throttle in DevTools)
3. Delete all photos rapidly
4. Start/stop consultation multiple times

### Expected Behavior
- No UI freezing
- Smooth animations
- Proper cleanup
- No memory leaks

## Browser Compatibility

### Tested Browsers
- [ ] Chrome (primary target)
- [ ] Edge (Chromium)
- [ ] Brave (Chromium)

### Expected Issues
- File API support (should be fine in modern browsers)
- FormData upload (universally supported)
- Object URLs (cleanup required)

## Ready for Production?

### Checklist Before Going Live
- [ ] All tests pass
- [ ] Backend endpoints working
- [ ] No console errors
- [ ] Error messages user-friendly
- [ ] Performance acceptable
- [ ] Security validated
- [ ] Documentation complete

## Contact for Issues

If you encounter issues:
1. Check console logs
2. Verify backend is running
3. Check network tab for failed requests
4. Review implementation in claudedocs/PHOTO_UPLOAD_IMPLEMENTATION.md
