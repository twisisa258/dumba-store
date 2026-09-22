import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_TIMEOUT_SECONDS, CARD_TIMEOUT_SECONDS, timeoutFor, isMobileMethod,
  phoneFitsMethod, canTransition, outcomeOf,
} from '../src/payment-rules.js';

test('o pedido no telemóvel expira em exatamente 2 minutos; o cartão em 1 hora', () => {
  assert.equal(MOBILE_TIMEOUT_SECONDS, 120);
  assert.equal(timeoutFor('mpesa'), 120);
  assert.equal(timeoutFor('emola'), 120);
  assert.equal(timeoutFor('visa_card'), CARD_TIMEOUT_SECONDS);
  assert.equal(isMobileMethod('visa_card'), false);
});

test('cada método só aceita números da sua operadora', () => {
  assert.equal(phoneFitsMethod('mpesa', '841234567'), true);
  assert.equal(phoneFitsMethod('mpesa', '851234567'), true);
  assert.equal(phoneFitsMethod('mpesa', '861234567'), false);
  assert.equal(phoneFitsMethod('emola', '861234567'), true);
  assert.equal(phoneFitsMethod('emola', '871234567'), true);
  assert.equal(phoneFitsMethod('emola', '841234567'), false);
  assert.equal(phoneFitsMethod('visa_card', '821234567'), true);
});

test('transições de estado: um estado final não é desfeito por eventos atrasados', () => {
  assert.equal(canTransition('pending', 'succeeded'), true);
  assert.equal(canTransition('pending', 'failed'), true);
  assert.equal(canTransition('pending', 'cancelled'), true);
  assert.equal(canTransition('pending', 'pending'), false);
  // expirou (cancelled) e depois o cliente aprovou: aceita-se o pagamento
  assert.equal(canTransition('cancelled', 'succeeded'), true);
  assert.equal(canTransition('failed', 'succeeded'), true);
  // mas não volta a pendente nem muda de recusado para cancelado
  assert.equal(canTransition('cancelled', 'pending'), false);
  assert.equal(canTransition('failed', 'cancelled'), false);
  // pago só pode ser reembolsado
  assert.equal(canTransition('succeeded', 'failed'), false);
  assert.equal(canTransition('succeeded', 'cancelled'), false);
  assert.equal(canTransition('succeeded', 'refunded'), true);
  assert.equal(canTransition('refunded', 'succeeded'), false);
});

test('resultado mostrado ao cliente', () => {
  assert.equal(outcomeOf({ transactionStatus: 'succeeded' }), 'paid');
  assert.equal(outcomeOf({ transactionStatus: 'failed' }), 'declined');
  assert.equal(outcomeOf({ transactionStatus: 'cancelled', failureCode: 'timeout' }), 'expired');
  assert.equal(outcomeOf({ transactionStatus: 'cancelled', failureCode: 'customer_cancelled' }), 'cancelled');
  assert.equal(outcomeOf({ transactionStatus: 'pending' }), 'pending');
  assert.equal(outcomeOf({ transactionStatus: null, paymentStatus: 'failed' }), 'declined');
  assert.equal(outcomeOf({ transactionStatus: null, paymentStatus: 'processing' }), 'pending');
  assert.equal(outcomeOf({ transactionStatus: 'refunded' }), 'refunded');
});
