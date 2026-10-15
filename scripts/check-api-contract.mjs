import { readFile } from 'node:fs/promises';

const spec = JSON.parse(await readFile('openapi/ticket-booking.openapi.json', 'utf8'));
const requiredOperations = [
  ['post', '/api/v1/auth/register'],
  ['post', '/api/v1/auth/email/verify'],
  ['post', '/api/v1/auth/email/resend'],
  ['post', '/api/v1/auth/login'],
  ['post', '/api/v1/auth/logout'],
  ['get', '/api/v1/health/ready'],
  ['get', '/api/v1/showtimes/{id}/seats'],
  ['post', '/api/v1/bookings/hold'],
  ['post', '/api/v1/bookings/{id}/cancel'],
  ['post', '/api/v1/payments/bookings/{bookingId}/checkout'],
  ['post', '/api/v1/payments/sepay/webhook'],
];

for (const [method, path] of requiredOperations) {
  if (!spec.paths?.[path]?.[method]) {
    throw new Error(`Missing OpenAPI operation: ${method.toUpperCase()} ${path}`);
  }
}

const schemas = spec.components?.schemas ?? {};
for (const schema of ['AuthResponseDto', 'BookingResponseDto', 'SepayCheckoutResponseDto', 'SepayWebhookDto']) {
  if (!schemas[schema]) throw new Error(`Missing OpenAPI schema: ${schema}`);
}

const holdParameters = spec.paths['/api/v1/bookings/hold'].post.parameters ?? [];
if (!holdParameters.some((parameter) => parameter.name === 'idempotency-key')) {
  throw new Error('Booking hold is missing the idempotency-key contract');
}

console.log(`OpenAPI contract checks passed (${requiredOperations.length} operations, 4 schemas)`);
