const {
  NodeSDK
} = require('@opentelemetry/sdk-node');

const {
  OTLPTraceExporter
} = require('@opentelemetry/exporter-trace-otlp-proto');

const {
  getNodeAutoInstrumentations
} = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
  serviceName: 'node11-orders-api',

  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      'http://127.0.0.1:4318/v1/traces'
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false
      }
    })
  ]
});

sdk.start();

module.exports = sdk;
