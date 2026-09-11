import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { readAuthState, removeCredential, bumpEpoch } from '$lib/server/auth/state.ts';
import { issueSession } from '$lib/server/auth/session.ts';
import { store, audit } from '$lib/server/store/kv.ts';
import { MODE, auth, integrations } from '$lib/server/env.ts';
import { readQueue } from '$lib/server/integrations/indexnow.ts';
import { isConfigured as bingConfigured } from '$lib/server/integrations/bing.ts';

export const load: PageServerLoad = async () => {
	const state = await readAuthState();
	const auditKeys = await store.list('audit');
	const recent = await Promise.all(
		auditKeys.slice(-15).reverse().map((k) => store.get<Record<string, unknown>>(k))
	);

	return {
		credentials: state.credentials.map((c) => ({
			id: c.id,
			label: c.label,
			createdAt: c.createdAt
		})),
		mode: MODE,
		rpId: auth.rpId,
		origin: auth.origin,
		siteUrl: integrations.siteUrl,
		integrations: {
			bing: bingConfigured(),
			indexNow: !!integrations.indexNowKey,
			indexNowQueued: (await readQueue()).length,
			resend: !!integrations.resendApiKey
		},
		audit: recent.filter((e): e is Record<string, unknown> => !!e)
	};
};

export const actions: Actions = {
	removePasskey: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const state = await readAuthState();

		// Removing the last credential would lock the account out of everything
		// except the bootstrap-token recovery path.
		if (state.credentials.length <= 1) {
			return fail(400, {
				message: 'This is your only passkey. Enrol another device first — removing it would leave the Scaleway console as the only way back in.'
			});
		}
		if (!state.credentials.some((c) => c.id === id)) return fail(404, { message: 'No such passkey.' });

		await removeCredential(id);
		await audit('passkey-removed', { id });
		return { message: 'Passkey removed.' };
	},

	signOutEverywhere: async ({ cookies }) => {
		// Bumping the epoch invalidates every token ever issued, including this
		// one — so re-issue immediately or the click logs you out too.
		const epoch = await bumpEpoch();
		await issueSession(cookies, epoch);
		await audit('sign-out-everywhere', { epoch });
		return { message: 'Every other session has been signed out.' };
	}
};
