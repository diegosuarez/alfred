// Thin WebAuthn helpers. The backend speaks the python-webauthn JSON
// shape (base64url strings for binary fields); the browser API wants
// ArrayBuffers. These functions handle the conversion both ways.
import { api } from './api';

const b64urlToBuf = (s: string): ArrayBuffer => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
};

const bufToB64url = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
};

/** Returns true when the browser exposes a working WebAuthn surface.
 *  Older Safari and any non-secure context (http) don't qualify. */
export const supportsWebAuthn = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential === 'function' &&
  typeof navigator.credentials?.create === 'function';

/** Add a new passkey to the current account. Asks the browser to
 *  prompt the user for biometric / platform authenticator confirmation. */
export const registerPasskey = async (label?: string): Promise<{ id: number; label: string | null }> => {
  const options: any = await api.passkeyRegisterBegin(label);

  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    user: { ...options.user, id: b64urlToBuf(options.user.id) },
    excludeCredentials: (options.excludeCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  };

  const cred = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential;
  if (!cred) throw new Error('No credential returned');

  const att = cred.response as AuthenticatorAttestationResponse;
  // Some authenticators expose getTransports() — pass it back to the
  // backend so future auth requests can pre-filter.
  const transports =
    typeof (att as any).getTransports === 'function'
      ? (att as any).getTransports()
      : undefined;
  const payload = {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64url(att.clientDataJSON),
      attestationObject: bufToB64url(att.attestationObject),
      transports,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
  return api.passkeyRegisterFinish(label, payload);
};

/** Sign in with a previously-registered passkey. Resolves to the JWT
 *  the backend mints; caller is responsible for storing it. */
export const signInWithPasskey = async (): Promise<{ access_token: string }> => {
  const options: any = await api.passkeyLoginBegin();
  const state: string = options.state;

  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  };

  const assertion = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential;
  if (!assertion) throw new Error('No assertion returned');

  const r = assertion.response as AuthenticatorAssertionResponse;
  const payload = {
    id: assertion.id,
    rawId: bufToB64url(assertion.rawId),
    type: assertion.type,
    response: {
      clientDataJSON: bufToB64url(r.clientDataJSON),
      authenticatorData: bufToB64url(r.authenticatorData),
      signature: bufToB64url(r.signature),
      userHandle: r.userHandle ? bufToB64url(r.userHandle) : null,
    },
    clientExtensionResults: assertion.getClientExtensionResults(),
  };
  return api.passkeyLoginFinish(state, payload);
};
