/** Shared policy for product delivery and taxi trips. Not an HTTP endpoint.
 * Callers must load all authorization fields from the server/database and
 * revalidate under locks in the same transaction as any position write.
 */
export const TRACKING_POLICY = Object.freeze({
  maxAgeMs: 60_000,
  futureToleranceMs: 5_000,
  minIntervalMs: 5_000,
  staleAfterMs: 60_000,
  maxAccuracyMeters: 1_000,
});
export type TransportKind = 'product' | 'taxi';
export type TransportState = {kind: TransportKind; status: string};
export type Position = {
  latitude: number; longitude: number; accuracy: number; capturedAt: number;
};
export type StoredPosition = Position & {receivedAt: number};
export type TrackingContext = {
  tenantId: string; userId: string; assignedTenantId: string;
  assignedUserId: string; activeMembership: boolean; activeDriver: boolean;
  enabled: boolean; writable: boolean; sharing: boolean;
  expiresAt: number; transport: TransportState;
};
export type Rejection = 'unauthorized' | 'inactive' | 'invalid_position' |
  'old_position' | 'future_position' | 'out_of_order' | 'rate_limited';
export function isActiveTransport(transport: TransportState): boolean {
  return transport.kind === 'product' ? transport.status === 'out_for_delivery'
    : transport.kind === 'taxi' && ['en_route', 'with_pet'].includes(transport.status);
}
export function authorizeTracking(context: TrackingContext, now: number): Rejection | null {
  if (!context.tenantId || !context.userId ||
      context.tenantId !== context.assignedTenantId ||
      context.userId !== context.assignedUserId ||
      !context.activeMembership || !context.activeDriver) return 'unauthorized';
  if (!context.enabled || !context.writable || !context.sharing ||
      !Number.isFinite(now) || !Number.isFinite(context.expiresAt) ||
      now >= context.expiresAt || !isActiveTransport(context.transport)) return 'inactive';
  return null;
}
export function validatePosition(raw: unknown, now: number, previous: StoredPosition | null):
  {ok: true; position: StoredPosition} | {ok: false; reason: Rejection} {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !Number.isFinite(now))
    return {ok: false, reason: 'invalid_position'};
  const p = raw as Record<string, unknown>;
  if (Object.keys(p).length !== 4 || !['latitude','longitude','accuracy','capturedAt'].every(k => Object.hasOwn(p,k)))
    return {ok: false, reason: 'invalid_position'};
  const {latitude, longitude, accuracy, capturedAt} = p;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
      typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy <= 0 ||
      accuracy > TRACKING_POLICY.maxAccuracyMeters ||
      typeof capturedAt !== 'number' || !Number.isSafeInteger(capturedAt) || capturedAt <= 0)
    return {ok: false, reason: 'invalid_position'};
  if (capturedAt > now + TRACKING_POLICY.futureToleranceMs) return {ok: false, reason: 'future_position'};
  if (capturedAt < now - TRACKING_POLICY.maxAgeMs) return {ok: false, reason: 'old_position'};
  if (previous && capturedAt <= previous.capturedAt) return {ok: false, reason: 'out_of_order'};
  if (previous && now - previous.receivedAt < TRACKING_POLICY.minIntervalMs)
    return {ok: false, reason: 'rate_limited'};
  return {ok: true, position: {latitude, longitude, accuracy, capturedAt, receivedAt: now}};
}
/** A delayed packet is never fresh merely because it just arrived.
 * Suppress coordinates completely when sharing is not authorized.
 */
export function positionVisibility(authorized: boolean, position: StoredPosition | null, now: number):
  'unavailable' | 'stale' | 'live' {
  if (!authorized || !position || !Number.isFinite(now)) return 'unavailable';
  return now - Math.min(position.capturedAt, position.receivedAt) >= TRACKING_POLICY.staleAfterMs
    ? 'stale' : 'live';
}
