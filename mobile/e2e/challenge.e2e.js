/**
 * Challenge Flow E2E Tests
 * Tests the complete challenge flow from creation to voting
 */

describe('Challenge Flow', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { camera: 'YES', notifications: 'YES' },
    });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe('Authentication', () => {
    it('should show sign-in screen when not authenticated', async () => {
      // Check for auth screen elements
      await expect(element(by.id('auth-sign-in'))).toBeVisible();
      await expect(element(by.id('auth-email'))).toBeVisible();
      await expect(element(by.id('auth-password'))).toBeVisible();
      await expect(element(by.id('auth-submit'))).toBeVisible();
    });

    it('should show validation errors for empty fields', async () => {
      await element(by.id('auth-submit')).tap();
      // Should show error message
      await expect(element(by.text('Please fill in all fields'))).toBeVisible();
    });

    it('should navigate to home after successful sign-in', async () => {
      // Fill in test credentials
      await element(by.id('auth-email')).typeText('test@example.com');
      await element(by.id('auth-password')).typeText('password123');
      await element(by.id('auth-submit')).tap();

      // Wait for navigation
      await waitFor(element(by.id('home-screen')))
        .toBeVisible()
        .withTimeout(5000);
    });
  });

  describe('Home Screen', () => {
    beforeEach(async () => {
      // Assume user is signed in for these tests
      await device.launchApp({ newInstance: false });
    });

    it('should show home screen with navigation cards', async () => {
      await expect(element(by.id('home-screen'))).toBeVisible();
      await expect(element(by.text('Find Spots'))).toBeVisible();
      await expect(element(by.text('S.K.A.T.E.'))).toBeVisible();
      await expect(element(by.text('Leaderboard'))).toBeVisible();
      await expect(element(by.text('Profile'))).toBeVisible();
      await expect(element(by.text('Settings'))).toBeVisible();
    });

    it('should navigate to challenges screen', async () => {
      await element(by.text('S.K.A.T.E.')).tap();
      await expect(element(by.text('Your Challenges'))).toBeVisible();
    });

    it('should navigate to settings screen', async () => {
      await element(by.text('Settings')).tap();
      await expect(element(by.text('Notifications'))).toBeVisible();
      await expect(element(by.text('Sign Out'))).toBeVisible();
    });
  });

  describe('Challenge Creation', () => {
    beforeEach(async () => {
      // Navigate to users screen
      await element(by.id('tab-users')).tap();
    });

    it('should display user search', async () => {
      await expect(element(by.text('Find Skaters'))).toBeVisible();
    });

    it('should navigate to challenge creation when tapping challenge button', async () => {
      // Find a user to challenge (first in list)
      await waitFor(element(by.id('user-item-0')))
        .toBeVisible()
        .withTimeout(5000);

      await element(by.id('challenge-button-0')).tap();

      // Should show camera permission or recording screen
      await waitFor(element(by.text('15 seconds')))
        .toBeVisible()
        .withTimeout(3000);
    });
  });

  describe('Settings', () => {
    beforeEach(async () => {
      await element(by.text('Settings')).tap();
    });

    it('should show notification preferences', async () => {
      await expect(element(by.text('Push Notifications'))).toBeVisible();
      await expect(element(by.text('New Challenges'))).toBeVisible();
    });

    it('should navigate to privacy policy', async () => {
      await element(by.text('Privacy Policy')).tap();
      await expect(element(by.text('Privacy Policy'))).toBeVisible();
      await expect(element(by.text('1. Introduction'))).toBeVisible();
    });

    it('should show logout confirmation', async () => {
      await element(by.text('Sign Out')).tap();
      await expect(element(by.text('Are you sure you want to sign out?'))).toBeVisible();
      await element(by.text('Cancel')).tap();
    });
  });

  describe('Offline Mode', () => {
    it('should show offline indicator when network is unavailable', async () => {
      // Note: This test requires network mocking which may not be available
      // in all Detox configurations. Marked as pending.
      pending('Requires network mocking capability');
    });
  });
});

describe('Video Upload', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { camera: 'YES' },
    });
  });

  it('should show upload progress when submitting challenge', async () => {
    // This test requires a full flow setup
    // Marked as pending for initial scaffold
    pending('Requires authenticated user and opponent setup');
  });

  it('should handle upload errors gracefully', async () => {
    pending('Requires network error simulation');
  });
});
