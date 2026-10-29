const {
  trace,
  SpanStatusCode
} = require('@opentelemetry/api');

const tracer = trace.getTracer('node11-orders');

const orders = new Map([
  ['1', { id: '1', item: 'Laptop' }],
  ['2', { id: '2', item: 'Mouse' }]
]);

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function findOrder(id, logger) {
  return tracer.startActiveSpan(
    'db.orders.findById',

    async (span) => {
      try {
        logger.info('db.order.lookup.started', {
          'db.operation.name': 'SELECT',
          'db.system.name': 'simulated'
        });

        await delay(30);

        // Deliberate failure for observability practice.
        if (id === '500') {
          throw new Error(
            'Simulated database failure'
          );
        }

        const order = orders.get(id) || null;

        logger.info('db.order.lookup.completed', {
          'db.operation.name': 'SELECT',
          'db.rows_affected': order ? 1 : 0
        });

        return order;
      } catch (error) {
        // Record a safe, controlled exception in tracing.
        span.recordException(
          new Error('Database operation failed')
        );

        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'Database operation failed'
        });

        logger.error(
          'db.order.lookup.failed',
          error,
          {
            'db.operation.name': 'SELECT'
          }
        );

        throw error;
      } finally {
        span.end();
      }
    }
  );
}

module.exports = {
  findOrder
};
