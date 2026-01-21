# White Screen After Logout - Troubleshooting Guide

## Issue
After clicking logout, the app shows a white screen at `/auth/login`

## Likely Causes

1. **Store State Cleared Too Aggressively**
   - The logout function might be clearing localStorage including the auth layout background images

2. **Component Rendering Before Store Initialization**
   - The AuthLayout component tries to render before the store is hydrated

3. **JavaScript Error**
   - Check browser console (F12) for any errors

## Quick Fixes to Try

### Fix 1: Check Browser Console
1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for any red error messages
4. Share those errors for specific fix

### Fix 2: Clear Browser Cache & LocalStorage
1. Open Developer Tools (F12)
2. Go to Application tab
3. Under Storage → Local Storage → select your domain
4. Click "Clear All"
5. Refresh the page
6. Try logging out again

### Fix 3: Check Network Tab
1. Open Developer Tools (F12)  
2. Go to Network tab
3. Clear network log
4. Try logging out
5. Check if any requests are failing (red status)

### Fix 4: Temporary Workaround
Instead of using the Logout menu/button, manually navigate to:
```
http://localhost:5173/#/auth/logout
```

Then click "Yes, Log Out" button

### Fix 5: Code Fix (if above don't work)
The issue might be that the authLayoutStore is being cleared on logout. We can ensure it always has default images.

## Expected Behavior
After logout, you should see the login page with:
- Background carousel images
- Login form
- "Sign in with Google" button

## Need More Help?
Please check the browser console (F12 → Console tab) and share any error messages you see.
