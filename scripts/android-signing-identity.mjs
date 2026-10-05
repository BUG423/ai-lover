/** Validate every application signer, including v3.1 certificates for different SDK ranges. */
export function assertAndroidSigningIdentity(verification, expected) {
  const count = /^Number of signers: (\d+)\r?$/mu.exec(verification);
  const certificates = verification
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^Signer.*certificate SHA-256 digest:/iu.test(line));
  if (count?.[1] !== '1' || !certificates.length || !/^[a-f0-9]{64}$/iu.test(expected))
    throw new Error('APK must have exactly one verified signing identity');
  for (const line of certificates) {
    // AOSP prints either Signer #1 or Signer (minSdkVersion=…, maxSdkVersion=…).
    const signer =
      /^Signer (?:#([1-9]\d*)|\(minSdkVersion=(\d+)(?: \(dev release=true\))?, maxSdkVersion=(\d+)\)) certificate SHA-256 digest: ([a-f0-9]{64})$/iu.exec(
        line,
      );
    if (
      !signer ||
      (signer[1] && signer[1] !== '1') ||
      (signer[2] && Number(signer[2]) > Number(signer[3])) ||
      signer[4].toLowerCase() !== expected.toLowerCase()
    )
      throw new Error('APK certificate does not match the explicitly selected test keystore');
  }
}
