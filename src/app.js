const express = require('express');

const {
  randomUUID
} = require('node:crypto');

const {
  trace,
  context
} = require('@opentelemetry/api');

const {
  requestStorage
} = require('./request-context');

const {
  findOrder
} = require('./orders');

function createApp(logger) {
  const app = express();

  app.disable('x-powered-by');

  app.use(express.json({ limit: '8kb' }));

  app.use((req, res, next) => {
    const incomingId = req.get('X-Correlation-ID');

    // Accept only a bounded, safe request ID.
    const correlationId =
      typeof incomingId === 'string' &&
      /^[A-Za-z0-9_-]{8,64}$/.test(incomingId)
        ? incomingId
        : randomUUID();

    // Capture incoming tracing context.
    const requestSpanContext = trace
      .getSpan(context.active())
      ?.spanContext();

    const requestContext = {
      correlationId,
      requestSpanContext
    };

    const start = process.hrtime.bigint();

    requestStorage.run(requestContext, () => {
      res.setHeader(
        'X-Correlation-ID',
        correlationId
      );

      if (requestSpanContext?.traceId) {
        res.setHeader(
          'X-Trace-Id',
          requestSpanContext.traceId
        );
      }

      logger.info('http.request.started', {
        'http.request.method': req.method,
        'url.path': req.path
      });

      let recorded = false;

      function finish() {
        if (recorded) return;
        recorded = true;

        const duration = Number(
          process.hrtime.bigint() - start
        );

        requestStorage.run(requestContext, () => {
          logger.info('http.request.finished', {
            'http.request.method': req.method,
            'http.response.status_code':
              res.statusCode,
            'event.duration': duration
          });
        });
      }

      res.once('finish', finish);
      res.once('close', finish);

      next();
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/orders/:id', async (req, res) => {
    const order = await findOrder(
      req.params.id,
      logger
    );

    if (!order) {
      logger.warn('order.not_found');

      return res.status(404).json({
        error: 'Order not found'
      });
    }

    logger.info('order.response.ready');

    return res.json(order);
  });

  // Express 5 forwards rejected async handlers here.
  app.use((error, req, res, next) => {
    logger.error(
      'http.request.failed',
      error,
      {
        'http.response.status_code': 500
      }
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      error: 'Internal server error'
    });
  });

  return app;
}

module.exports = {
  createApp
};
