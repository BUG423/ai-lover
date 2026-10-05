import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assertAndroidSigningIdentity } from './android-signing-identity.mjs';

// Explicit final signing avoids AGP's environment-dependent default debug.keystore.
// Only the public certificate fingerprint is logged; keystore bytes/passwords are not.
const apkArgument = process.argv[2];
if (!apkArgument) throw new Error('Usage: node scripts/sign-android-test.mjs <APK path>');
const apk = resolve(apkArgument);
const keystore = resolve(
  process.env.ANDROID_TEST_KEYSTORE_PATH || join(homedir(), '.android', 'debug.keystore'),
);
if (!existsSync(apk) || !existsSync(keystore))
  throw new Error('APK or test signing keystore missing');
const cachedTools = join(homedir(), '.cache', 'ai-lover-tools');
const javaHome = process.env.JAVA_HOME || join(cachedTools, 'jdk21');
const extension = process.platform === 'win32' ? '.exe' : '';
const java = existsSync(join(javaHome, 'bin', `java${extension}`))
  ? join(javaHome, 'bin', `java${extension}`)
  : `java${extension}`;
const keytool = existsSync(join(javaHome, 'bin', `keytool${extension}`))
  ? join(javaHome, 'bin', `keytool${extension}`)
  : `keytool${extension}`;
const sdk =
  process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(cachedTools, 'android-sdk');
const buildTools = join(sdk, 'build-tools');
const toolsVersion = process.env.ANDROID_BUILD_TOOLS_VERSION || '35.0.0';
const apksignerJar = join(buildTools, toolsVersion, 'lib', 'apksigner.jar');
if (!existsSync(apksignerJar))
  throw new Error(`Android Build Tools ${toolsVersion} apksigner.jar missing`);
const signingEnv = {
  ...process.env,
  ANDROID_TEST_STORE_PASSWORD: process.env.ANDROID_TEST_STORE_PASSWORD || 'android',
  ANDROID_TEST_KEY_PASSWORD: process.env.ANDROID_TEST_KEY_PASSWORD || 'android',
};
const alias = process.env.ANDROID_TEST_KEY_ALIAS || 'androiddebugkey';
function run(command, args, label) {
  const result = spawnSync(command, args, { env: signingEnv, timeout: 60_000 });
  if (result.error || result.status !== 0) throw new Error(`${label} failed`);
  return result.stdout;
}
const certificate = run(
  keytool,
  [
    '-exportcert',
    '-keystore',
    keystore,
    '-alias',
    alias,
    '-storepass:env',
    'ANDROID_TEST_STORE_PASSWORD',
  ],
  'Read test signing certificate',
);
const expected = createHash('sha256').update(certificate).digest('hex');
const pinned = process.env.ANDROID_TEST_CERTIFICATE_SHA256?.replace(/[:\s]/gu, '').toLowerCase();
if (pinned && (!/^[a-f0-9]{64}$/u.test(pinned) || pinned !== expected))
  throw new Error('Restored test keystore does not match the pinned public certificate');

function contentsDigest(path) {
  return run(
    process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    [
      '-c',
      `import hashlib,re,sys,zipfile
digest=hashlib.sha256()
with zipfile.ZipFile(sys.argv[1]) as archive:
    for name in sorted(archive.namelist()):
        if name.endswith('/') or re.fullmatch(r'META-INF/(?:MANIFEST\\.MF|[^/]+\\.(?:SF|RSA|DSA|EC))',name,re.I):
            continue
        digest.update(name.encode()+b'\\0'+hashlib.sha256(archive.read(name)).digest())
print(digest.hexdigest())`,
      path,
    ],
    'Read APK application contents',
  )
    .toString('utf8')
    .trim();
}

const originalContents = contentsDigest(apk);
const temporary = mkdtempSync(join(dirname(apk), '.test-signing-'));
const signed = join(temporary, 'signed.apk');
try {
  run(
    java,
    [
      '-jar',
      apksignerJar,
      'sign',
      '--ks',
      keystore,
      '--ks-key-alias',
      alias,
      '--ks-pass',
      'env:ANDROID_TEST_STORE_PASSWORD',
      '--key-pass',
      'env:ANDROID_TEST_KEY_PASSWORD',
      '--out',
      signed,
      apk,
    ],
    'Sign APK with the established test identity',
  );
  const verification = run(
    java,
    ['-jar', apksignerJar, 'verify', '--verbose', '--print-certs', signed],
    'Verify APK signing',
  ).toString('utf8');
  assertAndroidSigningIdentity(verification, expected);
  if (contentsDigest(signed) !== originalContents)
    throw new Error('Application contents changed during APK signing');
  renameSync(signed, apk);
  console.log(
    `APK verified with Build Tools ${toolsVersion}: certificate SHA-256 ${expected}; application contents unchanged.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
