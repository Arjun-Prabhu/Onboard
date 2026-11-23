/**
 * @file HTTP implementation of {@link ApiClient} for the local Express API.
 *
 * Onboard is a local web app: the browser and the API share one origin
 * (`http://localhost:3000` in production; Vite proxies `/api` in development), so requests use
 * relative URLs and the httpOnly session cookie travels automatically. No token is ever stored
 * in JavaScript.
 *
 * Every method maps one-to-one onto the REST route documented on it in `contract.ts`.
 */
import { AppError, type AppErrorBody } from '@shared/errors';
import type { ApiClient } from './contract';

/** Base path of the REST API on the same origin. */
export const API_BASE = '/api';

/** Fired on `window` when the server says the session is gone, so the app can sign out. */
export const UNAUTHORIZED_EVENT = 'onboard:unauthorized';

/** Fired on `window` after the same person signs back in, so screens that failed can reload. */
export const SIGNED_BACK_IN_EVENT = 'onboard:signed-back-in';

/** HTTP verbs the API uses. */
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Sends a JSON request to the local API and converts error bodies into {@link AppError}s.
 * @param method - HTTP method.
 * @param path - Path under the API base, e.g. `/me/orgs`.
 * @param body - Optional JSON body.
 * @returns The parsed JSON response (`undefined` for 204 No Content).
 * @throws AppError for any non-2xx response or network failure.
 */
export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AppError(
      'UNKNOWN',
      'Could not reach the Onboard server. Check that it is running (npm start).',
    );
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T | AppErrorBody;
  if (!res.ok) {
    const err = json as Partial<AppErrorBody>;
    // A signed-in screen lost its session (expired, or the demo was reset elsewhere).
    if (res.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new AppError(
      err.code ?? 'UNKNOWN',
      err.message ?? 'Request failed.',
      err.field,
      err.fieldErrors,
    );
  }
  return json as T;
}

/**
 * Builds a query string from defined, non-empty values: `{ a: 1, b: undefined }` → `?a=1`.
 * @param params - Query values.
 * @returns `""` or `?…`.
 */
export function query(params: object = {}): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== null && value !== '' && value !== false)
      qs.set(key, String(value));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Encodes one path segment. */
const seg = encodeURIComponent;

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
const del = <T>(path: string) => request<T>('DELETE', path);

/** The real API client: every call goes to Express over same-origin HTTP. */
export const httpApi: ApiClient = {
  auth: {
    login: (input) => post('/auth/login', input),
    me: () => get('/auth/me'),
    logout: () => post('/auth/logout'),
    completeTour: () => post('/me/tour-complete'),
    publicOrgs: () => get('/public/orgs'),
    apply: (input) => post('/public/applications', input),
    guestSessions: () => get('/public/guest-sessions'),
    guestSignUp: (input) => post('/public/guest-signups', input),
  },
  orgs: {
    mine: () => get('/me/orgs'),
    directory: () => get('/orgs'),
    create: (input) => post('/orgs', input),
    joinAsVolunteer: (orgId) => post(`/orgs/${seg(orgId)}/volunteers/me`),
    members: (orgId) => get(`/orgs/${seg(orgId)}/members`),
    appoint: (orgId, input) => post(`/orgs/${seg(orgId)}/members`, input),
    changeRole: (orgId, membershipId, orgRole) =>
      put(`/orgs/${seg(orgId)}/members/${seg(membershipId)}`, { orgRole }),
    removeMember: (orgId, membershipId) => del(`/orgs/${seg(orgId)}/members/${seg(membershipId)}`),
    stepDown: (orgId) => post(`/orgs/${seg(orgId)}/members/me/step-down`, {}),
    ownershipOffers: (orgId) => get(`/orgs/${seg(orgId)}/ownership-offers`),
    offerOwnership: (orgId, input) => post(`/orgs/${seg(orgId)}/ownership-offers`, input),
    myOwnershipOffers: () => get('/me/ownership-offers'),
    answerOwnershipOffer: (offerId, accept) =>
      post(`/ownership-offers/${seg(offerId)}/${accept ? 'accept' : 'decline'}`, {}),
    withdrawOwnershipOffer: (offerId) => del(`/ownership-offers/${seg(offerId)}`),
  },
  profile: {
    get: () => get('/me/profile'),
    update: (input) => put('/me/profile', input),
  },
  volunteers: {
    list: (orgId, q) => get(`/orgs/${seg(orgId)}/volunteers${query(q)}`),
    metrics: (orgId) => get(`/orgs/${seg(orgId)}/volunteers/metrics`),
    add: (orgId, input) => post(`/orgs/${seg(orgId)}/volunteers`, input),
    remove: (orgId, userId) => del(`/orgs/${seg(orgId)}/volunteers/${seg(userId)}`),
    leave: (orgId) => del(`/orgs/${seg(orgId)}/volunteers/me`),
    get: (orgId, userId) => get(`/orgs/${seg(orgId)}/volunteers/${seg(userId)}`),
    setStatus: (orgId, userId, status, note) =>
      post(`/orgs/${seg(orgId)}/volunteers/${seg(userId)}/status`, { status, note }),
    recordCompletion: (orgId, userId, requirementId, input) =>
      put(
        `/orgs/${seg(orgId)}/volunteers/${seg(userId)}/requirements/${seg(requirementId)}`,
        input,
      ),
    clearCompletion: (orgId, userId, requirementId) =>
      del(`/orgs/${seg(orgId)}/volunteers/${seg(userId)}/requirements/${seg(requirementId)}`),
  },
  settings: {
    update: (orgId, input) => put(`/orgs/${seg(orgId)}/settings`, input),
    requirements: (orgId) => get(`/orgs/${seg(orgId)}/requirements`),
    createRequirement: (orgId, input) => post(`/orgs/${seg(orgId)}/requirements`, input),
    updateRequirement: (id, input) => put(`/requirements/${seg(id)}`, input),
    moveRequirement: (id, direction) => post(`/requirements/${seg(id)}/move`, { direction }),
    archiveRequirement: (id) => del(`/requirements/${seg(id)}`),
  },
  sites: {
    list: (orgId, includeArchived) => get(`/orgs/${seg(orgId)}/sites${query({ includeArchived })}`),
    create: (orgId, input) => post(`/orgs/${seg(orgId)}/sites`, input),
    update: (id, input) => put(`/sites/${seg(id)}`, input),
    remove: (id) => del(`/sites/${seg(id)}`),
    archive: (id) => post(`/sites/${seg(id)}/archive`),
  },
  programs: {
    list: (orgId, includeArchived) =>
      get(`/orgs/${seg(orgId)}/programs${query({ includeArchived })}`),
    create: (input) => post('/programs', input),
    update: (id, input) => put(`/programs/${seg(id)}`, input),
    remove: (id) => del(`/programs/${seg(id)}`),
    archive: (id) => post(`/programs/${seg(id)}/archive`),
  },
  sessions: {
    list: (orgId, filters) => get(`/orgs/${seg(orgId)}/sessions${query(filters)}`),
    browse: (filters) => get(`/me/sessions/open${query(filters)}`),
    get: (id) => get(`/sessions/${seg(id)}`),
    create: (input) => post('/sessions', input),
    createRepeating: (session, repeat) => post('/sessions/bulk', { session, repeat }),
    update: (id, input) => put(`/sessions/${seg(id)}`, input),
    cancel: (id) => post(`/sessions/${seg(id)}/cancel`),
  },
  signups: {
    signUp: (sessionId, role) => post(`/sessions/${seg(sessionId)}/signups`, { role }),
    assign: (sessionId, userId, role) =>
      post(`/sessions/${seg(sessionId)}/assign`, { userId, role }),
    cancel: (signUpId) => post(`/signups/${seg(signUpId)}/cancel`),
    checkIn: (signUpId) => post(`/signups/${seg(signUpId)}/check-in`),
    checkOut: (signUpId) => post(`/signups/${seg(signUpId)}/check-out`),
    markNoShow: (signUpId) => post(`/signups/${seg(signUpId)}/no-show`),
    mine: () => get('/me/signups'),
    forVolunteer: (orgId, userId) => get(`/orgs/${seg(orgId)}/volunteers/${seg(userId)}/signups`),
  },
  hours: {
    mine: () => get('/me/hours'),
    list: (orgId, q) => get(`/orgs/${seg(orgId)}/hours${query(q)}`),
    create: (input) => post('/me/hours', input),
    review: (id, status, note) => post(`/hours/${seg(id)}/review`, { status, note }),
  },
  equipment: {
    list: (orgId) => get(`/orgs/${seg(orgId)}/equipment`),
    create: (orgId, input) => post(`/orgs/${seg(orgId)}/equipment`, input),
    checkOut: (equipmentId, programId) =>
      post(`/equipment/${seg(equipmentId)}/checkout`, { programId }),
    returnEquipment: (equipmentId) => post(`/equipment/${seg(equipmentId)}/return`),
  },
  matching: {
    recommend: (sessionId, limit) =>
      get(`/sessions/${seg(sessionId)}/recommendations${query({ limit })}`),
    forMe: (limit) => get(`/me/recommended-sessions${query({ limit })}`),
  },
  risk: {
    sessions: (orgId) => get(`/orgs/${seg(orgId)}/alerts/staffing`),
    inactivity: (orgId) => get(`/orgs/${seg(orgId)}/alerts/inactivity`),
  },
  reports: {
    run: (orgId, params) => post(`/orgs/${seg(orgId)}/reports/run`, params),
  },
  dashboard: {
    admin: (orgId) => get(`/orgs/${seg(orgId)}/dashboard`),
  },
  assistant: {
    ask: (question, orgId) => post('/assistant/ask', { question, orgId }),
  },
  presets: {
    list: () => get('/me/filter-presets'),
    save: (name, filters) => post('/me/filter-presets', { name, filters }),
    remove: (id) => del(`/me/filter-presets/${seg(id)}`),
  },
  meta: {
    skills: () => get('/meta/skills'),
    status: () => get('/health'),
    resetDemo: () => post('/meta/reset-demo'),
  },
};
