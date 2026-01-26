/**
 * Error Tracking Service
 * Centralized error capture and reporting
 *
 * This module provides a unified interface for error tracking.
 * Currently uses console logging but is designed to integrate with
 * Sentry or other error tracking services.
 *
 * TODO: Integrate with Sentry once expo-sentry is installed:
 * import * as Sentry from '@sentry/react-native';
 */

import { isProd } from './firebase.config';

export interface ErrorContext {
  [key: string]: unknown;
}

export interface BreadcrumbData {
  category: string;
  message: string;
  data?: Record<string, unknown>;
  level?: 'debug' | 'info' | 'warning' | 'error';
}

/**
 * Initialize error tracking service
 * Call this in app startup
 */
export function initErrorTracking(): void {
  // TODO: Initialize Sentry
  // Sentry.init({
  //   dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  //   environment: isProd() ? 'production' : 'development',
  //   enableAutoSessionTracking: true,
  //   sessionTrackingIntervalMillis: 30000,
  // });

  if (!isProd()) {
    console.log('[ErrorTracking] Initialized (console mode)');
  }
}

/**
 * Capture and report an error
 */
export function captureError(
  error: Error,
  context?: ErrorContext
): string | undefined {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Log in development
  if (!isProd()) {
    console.error('[ErrorTracking] Error captured:', {
      errorId,
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  // TODO: Send to Sentry
  // Sentry.captureException(error, {
  //   extra: context,
  //   tags: { errorId },
  // });

  return errorId;
}

/**
 * Capture an informational message
 */
export function captureMessage(
  message: string,
  context?: ErrorContext
): void {
  // Log in development
  if (!isProd()) {
    console.log('[ErrorTracking] Message:', message, context);
  }

  // TODO: Send to Sentry
  // Sentry.captureMessage(message, {
  //   level: 'info',
  //   extra: context,
  // });
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(data: BreadcrumbData): void {
  if (!isProd()) {
    console.log('[Breadcrumb]', data.category, data.message, data.data);
  }

  // TODO: Send to Sentry
  // Sentry.addBreadcrumb({
  //   category: data.category,
  //   message: data.message,
  //   data: data.data,
  //   level: data.level || 'info',
  // });
}

/**
 * Set user context for error reports
 */
export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
} | null): void {
  if (!isProd() && user) {
    console.log('[ErrorTracking] User set:', user.id);
  }

  // TODO: Set Sentry user
  // if (user) {
  //   Sentry.setUser({
  //     id: user.id,
  //     email: user.email,
  //     username: user.username,
  //   });
  // } else {
  //   Sentry.setUser(null);
  // }
}

/**
 * Add custom tag for filtering
 */
export function setTag(key: string, value: string): void {
  if (!isProd()) {
    console.log('[ErrorTracking] Tag set:', key, value);
  }

  // TODO: Set Sentry tag
  // Sentry.setTag(key, value);
}

/**
 * Start a performance transaction
 */
export function startTransaction(
  name: string,
  op: string
): { finish: () => void } {
  const startTime = Date.now();

  if (!isProd()) {
    console.log(`[Performance] Transaction started: ${name} (${op})`);
  }

  // TODO: Start Sentry transaction
  // const transaction = Sentry.startTransaction({ name, op });

  return {
    finish: () => {
      const duration = Date.now() - startTime;
      if (!isProd()) {
        console.log(`[Performance] Transaction finished: ${name} (${duration}ms)`);
      }
      // TODO: Finish Sentry transaction
      // transaction.finish();
    },
  };
}

/**
 * Error boundary wrapper for components
 */
export function wrapWithErrorBoundary<T>(
  fn: () => T,
  fallback: T,
  context?: string
): T {
  try {
    return fn();
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      context,
    });
    return fallback;
  }
}
