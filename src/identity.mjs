// Worker identity: an ed25519 keypair generated locally. The private key never leaves
// ~/.swarm. The public key fingerprint is the worker id that appears in receipts.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SWARM_HOME, ensureDir, readJson, sha256, canonicalJson } from './util.mjs';

const keyFile = () => path.join(SWARM_HOME, 'identity.json');

export function fingerprint(publicKeyB64) {
  return sha256(Buffer.from(publicKeyB64, 'base64')).slice(0, 16);
}

/**
 * SWARM_IDENTITY (base64 JSON from `swarm identity export`) lets a cloud environment sign as
 * the same worker on every run. Without it each fresh machine makes its own key.
 */
function fromEnv() {
  if (!process.env.SWARM_IDENTITY) return null;
  try {
    const id = JSON.parse(Buffer.from(process.env.SWARM_IDENTITY, 'base64').toString('utf8'));
    if (!id.publicKey || !id.privateKey) return null;
    return { handle: id.handle || 'anon', publicKey: id.publicKey, privateKey: id.privateKey, id: fingerprint(id.publicKey) };
  } catch {
    return null;
  }
}

export function exportIdentity(identity) {
  return Buffer.from(JSON.stringify({ handle: identity.handle, publicKey: identity.publicKey, privateKey: identity.privateKey })).toString('base64');
}

export function loadIdentity() {
  const env = fromEnv();
  if (env) return env;
  const file = keyFile();
  if (!fs.existsSync(file)) return null;
  const id = readJson(file);
  return { ...id, id: fingerprint(id.publicKey) };
}

export function createIdentity({ handle } = {}) {
  const existing = loadIdentity();
  if (existing) return existing;
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const record = {
    handle: handle || 'anon',
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    createdAt: new Date().toISOString(),
  };
  ensureDir(SWARM_HOME);
  fs.writeFileSync(keyFile(), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  return { ...record, id: fingerprint(record.publicKey) };
}

/** Sign any JSON document. Returns a copy with `signer` and `sig` added. */
export function signDoc(doc, identity) {
  const body = { ...doc, signer: { id: identity.id, handle: identity.handle, publicKey: identity.publicKey } };
  delete body.sig;
  const key = createPrivateKey({ key: Buffer.from(identity.privateKey, 'base64'), type: 'pkcs8', format: 'der' });
  const sig = sign(null, Buffer.from(canonicalJson(body)), key).toString('base64');
  return { ...body, sig };
}

/** Verify a signed document. Returns { ok, reason }. */
export function verifyDoc(doc) {
  if (!doc || !doc.sig || !doc.signer?.publicKey) return { ok: false, reason: 'missing signature' };
  if (fingerprint(doc.signer.publicKey) !== doc.signer.id) return { ok: false, reason: 'signer id does not match key' };
  const { sig, ...body } = doc;
  try {
    const key = createPublicKey({ key: Buffer.from(doc.signer.publicKey, 'base64'), type: 'spki', format: 'der' });
    const valid = verify(null, Buffer.from(canonicalJson(body)), key, Buffer.from(sig, 'base64'));
    return valid ? { ok: true } : { ok: false, reason: 'bad signature' };
  } catch (err) {
    return { ok: false, reason: `invalid key: ${err.message}` };
  }
}
