<script lang="ts">
	/** A trend line with no axes: the shape is the message, the number is beside it. Colour comes from `color`. */
	let { values, height = 38 }: { values: number[]; height?: number } = $props();

	const W = 120;
	const geometry = $derived.by(() => {
		if (values.length < 2) return null;
		const max = Math.max(...values);
		const min = Math.min(...values);
		const span = max - min;
		const step = W / (values.length - 1);
		// A line that never moves is drawn level, with nothing filled under it.
		const pts = values.map((v, i) => [i * step, span === 0 ? height / 2 : height - 3 - ((v - min) / span) * (height - 8)] as const);
		const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
		return { line, flat: span === 0, area: `0,${height} ${line} ${W},${height}` };
	});
</script>

{#if geometry}
	<svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" width="100%" {height} aria-hidden="true">
		{#if !geometry.flat}<polygon points={geometry.area} fill="currentColor" opacity="0.13" />{/if}
		<polyline points={geometry.line} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
	</svg>
{:else}
	<div class="none" style="height:{height}px"></div>
{/if}

<style>
	svg { display: block; overflow: visible; }
	.none { border-bottom: 2px dashed var(--border); }
</style>
