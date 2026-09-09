import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// The portal is single-origin behind Scaleway's TLS-terminating proxy.
		// ORIGIN must be set as a container env var: without it SvelteKit's CSRF
		// check compares against http://localhost:3000 and every form action 403s.
		adapter: adapter()
	}
};
