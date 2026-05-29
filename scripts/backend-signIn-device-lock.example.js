/**
 * Backend guidance for single-device login + tokenVersion.
 *
 * IMPORTANT:
 * - Biometric in mobile app does NOT call POST /login.
 * - Biometric only reuses a JWT already issued by password login.
 * - Therefore, biometric itself must NEVER bump tokenVersion.
 *
 * Prisma User model:
 *   registeredDeviceId  String?
 *   registeredDeviceAt  DateTime?
 *   tokenVersion        Int @default(0)
 */

// ---------------------------------------------------------------------------
// 1) Password login controller (POST /api/account/login)
// ---------------------------------------------------------------------------
//
// const { email, password, companyId, deviceId, replaceDevice } = {
//   ...req.query,
//   ...req.body,
// };
// const normalizedDeviceId = String(deviceId || "").trim();
// const now = new Date();
//
// // After password is validated, decide device policy:
// //
// // A) First login on mobile (no registeredDeviceId yet)
// //    - set registeredDeviceId = normalizedDeviceId
// //    - set registeredDeviceAt = now
// //    - DO NOT bump tokenVersion unless you need to revoke prior tokens
// //
// // B) Same device login
// //    - keep registeredDeviceId
// //    - DO NOT bump tokenVersion (avoid unnecessary token churn)
// //
// // C) Different device:
// //    - if within cooldown and !replaceDevice:
// //      return 403 { code: "DEVICE_SWITCH_COOLDOWN", switchAllowedAt }
// //    - else allow switch:
// //      set registeredDeviceId = normalizedDeviceId
// //      set registeredDeviceAt = now
// //      bump tokenVersion by 1 (revokes old device JWTs)
//
// ---------------------------------------------------------------------------
// 2) Auth middleware
// ---------------------------------------------------------------------------
//
// // Reject stale JWTs:
// // if (jwt.tokenVersion !== user.tokenVersion) {
// //   return 401 { code: "TOKEN_VERSION_MISMATCH", message: "Session ended. Please sign in again." }
// // }
//
// // Optional hardening:
// // if (jwt.deviceId && user.registeredDeviceId && jwt.deviceId !== user.registeredDeviceId) {
// //   return 401 { code: "DEVICE_MISMATCH", message: "Session ended. Please sign in again." }
// // }
//
// ---------------------------------------------------------------------------
// 3) Sign-out policy
// ---------------------------------------------------------------------------
//
// // Mobile sign-out (bizbuddy-server): does NOT bump tokenVersion so biometric can
// // reuse the saved JWT on the same device. Use POST /account/logout-all to revoke.
//
// ---------------------------------------------------------------------------
// 4) Biometric endpoint note
// ---------------------------------------------------------------------------
//
// // If you create a dedicated backend endpoint for biometric restore, keep it read-only:
// // - validate presented JWT/session
// // - return profile/session status
// // - NEVER increment tokenVersion in this path
