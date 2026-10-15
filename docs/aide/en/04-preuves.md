# Proofs of prior existence

For each imported photo, the site builds by itself a proof that **you held this file on a given date**, verifiable without the site.

## How it is done

1. **Fingerprint:** at import, the site computes the **SHA-256 fingerprint** of the original, a kind of “DNA” of the file. A single changed pixel gives a different fingerprint.
2. **Timestamp:** this fingerprint alone, never the photo, is sent to a **timestamping authority**, which returns a **signed token** attesting the date.
3. **Check:** the site verifies the token (signature, authority, date), then keeps it.

If it fails (network, service unavailable), the site retries by itself: a few minutes later, then every hour.

## On a photo's details

| Item | Meaning |
|---|---|
| SHA-256 fingerprint | the “DNA” of the original |
| **Timestamped on … UTC** | the guaranteed date (universal time: +1 h in winter, +2 h in summer for Paris) |
| Authority, no. | who signed the token, and its number |
| Pending | request not yet completed: **Retry now** button |

Buttons:

- **Original**: the exact file whose fingerprint was timestamped.
- **Token (.tsr)**: the signed token.
- **Proof sheet**: a readable summary, with the verification commands.
- **Authority certificate**: to verify the signature.
- **Verify the proof**: runs all the checks again.
  - “**Valid proof**”: the original is intact, and the signature is verified up to the authority.
  - “**Invalid proof: the original has been modified**”: the file on the server is no longer the one that was timestamped. Restore it from a backup.
  - “**Valid signature… but authority not verified**”: the server does not have the authority's root certificate. Let the person who administers it know.

## In case of dispute

Download the four files and keep them together, outside the site. Anyone can then verify the proof with OpenSSL; the commands are in the proof sheet. Add your **RAW** files and the neighbouring frames from the same session: the site's proof establishes the **date**, the RAW establishes the **author**.

**Before deleting a photo**, download its proof: it is deleted along with the photo.
