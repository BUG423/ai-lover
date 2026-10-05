import { describe, expect, it } from 'vitest';
import { assertAndroidSigningIdentity } from '../scripts/android-signing-identity.mjs';

const certificate = '1'.repeat(64);
const otherCertificate = '2'.repeat(64);
const header = 'Verifies\nNumber of signers: 1\n';

describe('Android APK signing identity verification', () => {
  it('accepts the numbered signer format from stable Build Tools', () => {
    expect(() =>
      assertAndroidSigningIdentity(
        `${header}Signer #1 certificate SHA-256 digest: ${certificate}\n`,
        certificate,
      ),
    ).not.toThrow();
  });

  it('accepts CRLF output from Windows signing tools', () => {
    expect(() =>
      assertAndroidSigningIdentity(
        `${header}Signer #1 certificate SHA-256 digest: ${certificate}\n`.replaceAll('\n', '\r\n'),
        certificate,
      ),
    ).not.toThrow();
  });

  it('accepts all v3.1 SDK ranges only when every certificate matches the pin', () => {
    const output =
      `${header}Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${certificate}\n` +
      `Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ${certificate}\n`;
    expect(() => assertAndroidSigningIdentity(output, certificate)).not.toThrow();
    expect(() =>
      assertAndroidSigningIdentity(output.replaceAll('33,', '33 (dev release=true),'), certificate),
    ).not.toThrow();
    expect(() =>
      assertAndroidSigningIdentity(
        output.replace(
          `32) certificate SHA-256 digest: ${certificate}`,
          `32) certificate SHA-256 digest: ${otherCertificate}`,
        ),
        certificate,
      ),
    ).toThrow('does not match');
  });

  it.each([
    'Verifies\nNumber of signers: 0\n',
    `Verifies\nNumber of signers: 2\nSigner #1 certificate SHA-256 digest: ${certificate}\n`,
    `${header}Signer #2 certificate SHA-256 digest: ${certificate}\n`,
    `${header}Signer unknown certificate SHA-256 digest: ${certificate}\n`,
    `${header}Signer (minSdkVersion=33, maxSdkVersion=24) certificate SHA-256 digest: ${certificate}\n`,
    `${header}Signer #1 certificate SHA-256 digest: ${otherCertificate}\n`,
    `${header}Signer #1 certificate SHA-256 digest: invalid\n`,
  ])('rejects missing, multiple, unknown, or mismatched signer evidence', (output) => {
    expect(() => assertAndroidSigningIdentity(output, certificate)).toThrow();
  });
});
