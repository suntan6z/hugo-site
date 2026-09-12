<script lang="ts">
	let { children } = $props();
</script>

<!-- Deliberately no header and no navigation: one thing at a time is the point.
     The root layout still provides the brand tokens and global controls. -->
<main>{@render children()}</main>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.25rem 1.25rem 2rem;
	}
</style>
