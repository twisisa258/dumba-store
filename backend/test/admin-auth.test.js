import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEnv, checkAdminCredentials, dirtyAdminEnv } from '../src/admin-auth.js';

const env = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'Segredo#123', ADMIN_SESSION_SECRET: 'x'.repeat(32) };

test('credenciais certas entram', () => {
  assert.equal(checkAdminCredentials({ username: 'admin', password: 'Segredo#123' }, env).ok, true);
});

test('o teclado do telemóvel (maiúscula na 1ª letra, espaço no fim) não impede a entrada', () => {
  assert.equal(checkAdminCredentials({ username: 'Admin ', password: 'Segredo#123 ' }, env).ok, true);
});

test('a palavra-passe continua a distinguir maiúsculas', () => {
  const r = checkAdminCredentials({ username: 'admin', password: 'segredo#123' }, env);
  assert.equal(r.ok, false);
  assert.equal(r.userOk, true);
  assert.equal(r.passOk, false);
});

test('utilizador errado é recusado e identificado', () => {
  const r = checkAdminCredentials({ username: 'outro', password: 'Segredo#123' }, env);
  assert.equal(r.ok, false);
  assert.equal(r.userOk, false);
});

test('espaços, quebras de linha e aspas coladas no Render são ignorados', () => {
  const sujo = { ADMIN_USERNAME: ' "admin" ', ADMIN_PASSWORD: '"Segredo#123"\n' };
  assert.equal(cleanEnv(sujo.ADMIN_PASSWORD), 'Segredo#123');
  assert.equal(checkAdminCredentials({ username: 'admin', password: 'Segredo#123' }, sujo).ok, true);
  assert.deepEqual(dirtyAdminEnv(sujo), ['ADMIN_USERNAME', 'ADMIN_PASSWORD']);
});

test('se as aspas fizerem mesmo parte da palavra-passe, também entra', () => {
  const e = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: '"abc"' };
  assert.equal(checkAdminCredentials({ username: 'admin', password: '"abc"' }, e).ok, true);
  assert.equal(checkAdminCredentials({ username: 'admin', password: 'abc' }, e).ok, true);
});

test('sem variáveis configuradas ninguém entra (nem com campos vazios)', () => {
  assert.equal(checkAdminCredentials({ username: '', password: '' }, {}).ok, false);
  assert.equal(checkAdminCredentials(undefined, {}).ok, false);
});
