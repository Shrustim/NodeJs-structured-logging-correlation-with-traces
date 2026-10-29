const pino = require('pino');

const {
  trace,
  context
} = require('@opentelemetry/api');

const {
  requestStorage
} = require('./request-context');

const sensitiveKey =
  /^(password|passwd|token|secret|authorization|cookie|set-cookie|apikey|access_token|refresh_token)$/i;

function redactText(value) {
  return String(value)
    .replace(
      /\bBearer\s+\S+/gi,
      'Bearer [REDACTED]'
    )
    .replace(
      /\bBasic\s+[A-Za-z0-9+/=]+/gi,
      'Basic [REDACTED]'
    )
    .replace(
      /\b(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;&]+/gi,
      '$1=[REDACTED]'
    )
    .replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      '[REDACTED_EMAIL]'
    )
    .slice(0, 4096);
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return redactText(value);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (depth >= 5) {
    return '[TRUNCATED]';
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((item) => sanitize(item, depth + 1, seen));
  }

  const safe = {};

  for (const [key, item] of
    Object.entries(value).slice(0, 40)) {

    const normalizedKey =
      key.replace(/[-_.]/g, '');

    safe[key] =
      sensitiveKey.test(normalizedKey)
        ? '[REDACTED]'
        : sanitize(item, depth + 1, seen);
  }

  return safe;
}

function normalizeError(error) {
  const err = error instanceof Error
    ? error
    : new Error('Unknown application error');

  return {
    'error.type': redactText(err.name),
    'error.message': redactText(err.message),
    'error.stack_trace': redactText(
      err.stack || err.message
    )
  };
}

function createLogger(output = process.stdout) {
  const rawLogger = pino({
    level: process.env.LOG_LEVEL || 'info',

    messageKey: 'message',

    base: {
      'ecs.version': '8.11.0',
      'service.name': 'node11-orders-api',
      'service.environment':
        process.env.NODE_ENV || 'development'
    },

    timestamp: () =>
      `,"@timestamp":"${new Date().toISOString()}"`,

    formatters: {
      level(label) {
        return {
          'log.level': label
        };
      }
    },

    mixin() {
      const stored = requestStorage.getStore();

      const currentSpan = trace.getSpan(
        context.active()
      );

      const spanContext =
        currentSpan?.spanContext() ||
        stored?.requestSpanContext;

      return {
        'trace.id':
          spanContext?.traceId || null,

        'span.id':
          spanContext?.spanId || null,

        'labels.correlation_id':
          stored?.correlationId || null
      };
    }
  }, output);

  return {
    info(action, fields = {}) {
      rawLogger.info({
        ...sanitize(fields),
        'event.action': action
      }, action);
    },

    warn(action, fields = {}) {
      rawLogger.warn({
        ...sanitize(fields),
        'event.action': action
      }, action);
    },

    error(action, error, fields = {}) {
      rawLogger.error({
        ...sanitize(fields),
        ...normalizeError(error),
        'event.action': action
      }, action);
    }
  };
}

module.exports = {
  createLogger,
  redactText,
  sanitize,
  normalizeError
};
