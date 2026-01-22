import logger from '../logger';

export async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    logger.warn('DATABASE_URL not found - Stripe integration will not be initialized');
    return false;
  }

  try {
    logger.info('Initializing Stripe schema...');
    
    const { runMigrations } = await import('stripe-replit-sync');
    
    const migrationPromise = runMigrations({ 
      databaseUrl,
      schema: 'stripe'
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Stripe migration timed out after 30s')), 30000)
    );
    
    await Promise.race([migrationPromise, timeoutPromise]);
    logger.info('Stripe schema ready');

    const { getStripeSync } = await import('./stripeClient');
    const stripeSync = await getStripeSync();

    logger.info('Setting up managed webhook...');
    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
      try {
        const { webhook } = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        logger.info(`Webhook configured: ${webhook.url}`);
      } catch (webhookError: any) {
        logger.warn('Could not set up webhook (may not have Stripe credentials):', webhookError.message);
      }
    } else {
      logger.warn('REPLIT_DOMAINS not found - webhook not configured');
    }

    logger.info('Syncing Stripe data in background...');
    stripeSync.syncBackfill()
      .then(() => {
        logger.info('Stripe data synced');
      })
      .catch((err: Error) => {
        logger.error('Error syncing Stripe data:', err);
      });

    return true;
  } catch (error: any) {
    logger.error('Failed to initialize Stripe:', error.message || error);
    logger.warn('Stripe features will be unavailable. Server will continue without Stripe.');
    return false;
  }
}

export { paymentRoutes } from './paymentRoutes';
export { WebhookHandlers } from './webhookHandlers';
export { getUncachableStripeClient, getStripePublishableKey, getStripeSync } from './stripeClient';
