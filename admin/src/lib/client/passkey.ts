import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

async function post(url: string, body?: unknown) {
	const r = await fetch(url, {
		method: 'POST',
		headers: body ? { 'Content-Type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(data.error ?? `request failed (${r.status})`);
	return data;
}

export async function login(): Promise<void> {
	const options = await post('/api/auth/options');
	const response = await startAuthentication({ optionsJSON: options });
	await post('/api/auth/verify', response);
}

export async function enroll(label: string, search: string): Promise<void> {
	const options = await post(`/api/auth/enroll-options${search}`);
	const response = await startRegistration({ optionsJSON: options });
	await post(`/api/auth/enroll-verify${search}`, { ...response, label });
}
