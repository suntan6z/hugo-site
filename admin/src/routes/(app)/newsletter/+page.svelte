<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import { buildBroadcastHtml, validateBroadcast, forSingleRecipient, looksLikeEmail } from '$lib/newsletter-email.ts';
	let { data, form } = $props();

	// ---- the four steps ---------------------------------------------------
	const STEPS = ['Article', 'Write', 'Test', 'Send'] as const;
	// Arriving from an article's schedule panel: that article is already chosen.
	let step = $state(untrack(() => (data.chosen ? 2 : 1)));
	let tab = $state<'compose' | 'subscribers' | 'sent'>(untrack(() => (form?.removed || form?.removeError ? 'subscribers' : data.tab)));

	let slug = $state(untrack(() => data.chosen?.slug ?? ''));
	let subject = $state(untrack(() => data.chosen?.title ?? ''));
	let title = $state(untrack(() => data.chosen?.title ?? ''));
	let intro = $state(untrack(() => data.chosen?.description ?? ''));
	let note = $state('');
	let device = $state<'desktop' | 'mobile'>('desktop');

	// Each step opens at its top, not wherever the last one was scrolled to.
	$effect(() => {
		step;
		untrack(() => window.scrollTo({ top: 0 }));
	});

	const post = $derived(data.posts.find((p) => p.slug === slug));
	// Now, or a later morning: the trigger sends it at 9:30 Paris time, once the site is live.
	let when = $state<'now' | 'later'>('now');
	let sendDay = $state(untrack(() => data.earliestDay));
	const dayOk = $derived(sendDay >= data.earliestDay && /^\d{4}-\d{2}-\d{2}$/.test(sendDay));
	const dayLabel = $derived(
		dayOk ? new Date(sendDay + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : ''
	);
	const held = $derived(data.held.find((h) => h.slug === slug));
	const alreadySent = $derived(data.sent.filter((s) => s.slug === slug));
	const readers = $derived(data.audience?.subscribed ?? 0);

	function choose(p: (typeof data.posts)[number]) {
		// Re-picking the same article keeps what was already written.
		if (p.slug !== slug) {
			slug = p.slug;
			subject = title = p.title;
			intro = p.description;
			note = '';
		}
		step = 2;
	}

	// The preview is the same function the sender runs, so it cannot drift from
	// what goes out. Its unsubscribe token is only meaningful to Resend.
	const rawHtml = $derived(
		post
			? buildBroadcastHtml({
					title, intro, url: post.url, imageUrl: post.imageUrl ?? undefined,
					note: note.trim() || undefined, siteName: data.siteName, siteUrl: data.siteUrl
				})
			: ''
	);
	const previewHtml = $derived(forSingleRecipient(rawHtml, '#'));
	const verdict = $derived(
		validateBroadcast({ subject, title, intro, url: post?.url ?? '', html: rawHtml })
	);
	const blocking = $derived(verdict.errors.length > 0 || (when === 'later' && !dayOk));

	// A test only vouches for the content it was sent with.
	const contentKey = $derived(JSON.stringify([slug, subject, title, intro, note]));
	let testedFor = $state('');
	const testedOk = $derived(testedFor === contentKey);
	let testTo = $state('');
	let testing = $state(false);
	let testError = $state('');
	onMount(() => {
		try { testTo = localStorage.getItem('newsletter-test-to') ?? ''; } catch {}
	});

	type Level = 'ok' | 'warn' | 'bad';
	const checks = $derived.by(() => {
		const out: { level: Level; text: string }[] = [];
		for (const e of verdict.errors) out.push({ level: 'bad', text: e });
		if (subject.trim()) {
			out.push(
				subject.length > 60
					? { level: 'warn', text: `Subject is ${subject.length} characters; many inboxes cut it off around 60.` }
					: { level: 'ok', text: `Subject fits in an inbox (${subject.length} characters).` }
			);
		}
		if (title.trim() && intro.trim()) out.push({ level: 'ok', text: 'Headline and intro are written.' });
		out.push(
			post?.imageUrl
				? { level: 'ok', text: 'The article’s picture is included.' }
				: { level: 'warn', text: 'No picture: the email will be text only.' }
		);
		if (alreadySent.length > 0) {
			out.push({
				level: 'warn',
				text: `Already sent ${alreadySent.map((s) => new Date(s.at).toLocaleDateString('en-GB')).join(', ')}. Sending again reaches the same people twice.`
			});
		}
		if (held) {
			const when2 = new Date(held.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
			out.push({
				level: 'warn',
				text: when === 'later' ? `One is already scheduled for ${when2}. This replaces it.` : `One is already scheduled for ${when2}. It will still go out then, so they would get it twice.`
			});
		}
		if (when === 'later' && !dayOk) out.push({ level: 'bad', text: 'Pick a day after today.' });
		out.push(
			testedOk
				? { level: 'ok', text: 'A test copy was sent and nothing has changed since.' }
				: { level: 'warn', text: 'No test copy sent for this version. Recommended, not required.' }
		);
		return out;
	});

	// ---- send --------------------------------------------------------------
	let dialog = $state<HTMLDialogElement | null>(null);
	let sending = $state(false);
	let sendError = $state('');
	let sentInfo = $state<{ subject: string; to: number; warnings: string[]; at: string | null } | null>(null);

	// ---- subscribers -------------------------------------------------------
	let who = $state('');
	let confirmRemove = $state<string | null>(null);
	const shownSubscribers = $derived(
		(data.subscribers ?? []).filter((s) => who === '' || s.email.toLowerCase().includes(who.trim().toLowerCase()))
	);
	const day = (iso: string) =>
		iso ? new Date(iso.replace(' ', 'T')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
	const lastSent = $derived(data.sent[0]);
</script>

<div class="page-head">
	<div>
		<h1>Newsletter</h1>
		<p>Send an article to everyone who subscribed. Four steps, and nothing goes out until the last one.</p>
	</div>
</div>

{#if !data.configured}
	<section class="setup">
		<h2>Resend is not connected</h2>
		<p>You can write and preview an email here, but test copies and sending need Resend.</p>
		<ol>
			<li>Use the same API key the contact form already uses, from <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer">resend.com/api-keys</a>.</li>
			<li>Add it to <code>admin/.env</code> as <code>RESEND_API_KEY=…</code>.</li>
			<li>Run <code>cd admin && ./scripts/create-container.sh</code>.</li>
		</ol>
	</section>
{/if}

<!-- Numbers first: who a send reaches, and when the last one went. -->
<section class="stats" aria-label="Audience">
	<div class="stat">
		<span class="num">{data.audience ? data.audience.subscribed : '–'}</span>
		<span class="lbl">Subscribers</span>
	</div>
	<div class="stat">
		<span class="num">{data.audience ? data.audience.unsubscribed : '–'}</span>
		<span class="lbl">Unsubscribed</span>
	</div>
	<div class="stat">
		<span class="num">{data.sent.length}</span>
		<span class="lbl">Sent so far</span>
	</div>
	<div class="stat wide">
		<span class="num small">{lastSent ? new Date(lastSent.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}</span>
		<span class="lbl">{lastSent ? `Last: ${lastSent.subject}` : 'No broadcast sent yet'}</span>
	</div>
</section>

<div class="tabs" role="tablist">
	<button role="tab" aria-selected={tab === 'compose'} class:on={tab === 'compose'} onclick={() => (tab = 'compose')}>New broadcast</button>
	<button role="tab" aria-selected={tab === 'subscribers'} class:on={tab === 'subscribers'} onclick={() => (tab = 'subscribers')}>
		Subscribers{#if data.audience}<span class="n">{data.audience.total}</span>{/if}
	</button>
	<button role="tab" aria-selected={tab === 'sent'} class:on={tab === 'sent'} onclick={() => (tab = 'sent')}>
		Sent<span class="n">{data.sent.length}</span>
	</button>
</div>

<!-- Both forms below carry the same hidden copy of what was written. -->
{#snippet fields()}
	<input type="hidden" name="slug" value={slug} />
	<input type="hidden" name="subject" value={subject} />
	<input type="hidden" name="title" value={title} />
	<input type="hidden" name="intro" value={intro} />
	<input type="hidden" name="note" value={note} />
{/snippet}

{#snippet preview()}
	<div class="preview">
		<div class="preview-bar">
			<span class="eyebrow">Live preview</span>
			<div class="seg" role="group" aria-label="Preview width">
				<button type="button" class:on={device === 'desktop'} onclick={() => (device = 'desktop')}>Desktop</button>
				<button type="button" class:on={device === 'mobile'} onclick={() => (device = 'mobile')}>Phone</button>
			</div>
		</div>
		<div class="device" class:phone={device === 'mobile'}>
			<div class="inbox-row">
				<span class="from">{data.fromName}</span>
				<span class="subj">{subject || 'Your subject line'}</span>
				<span class="snip">{(note.trim() || intro).replace(/\s+/g, ' ').slice(0, 90)}</span>
			</div>
			<iframe title="Newsletter preview" srcdoc={previewHtml} sandbox=""></iframe>
		</div>
	</div>
{/snippet}

{#if tab === 'compose'}
	{#if sentInfo}
		<section class="all-sent card" aria-live="polite">
			<span class="tick" aria-hidden="true">
				<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg>
			</span>
			{#if sentInfo.at}
				<h2>Scheduled</h2>
				<p>“{sentInfo.subject}” goes to {sentInfo.to} {sentInfo.to === 1 ? 'person' : 'people'} on
					<strong>{new Date(sentInfo.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })} at 9:30</strong>,
					once the site is live. You can cancel it from the Sent tab until then.</p>
			{:else}
				<h2>Sent to {sentInfo.to} {sentInfo.to === 1 ? 'person' : 'people'}</h2>
				<p>“{sentInfo.subject}” is on its way. Delivery takes a few minutes.</p>
			{/if}
			{#each sentInfo.warnings as w}<p class="chip warn">{w}</p>{/each}
			<div class="row-actions">
				<a class="btn-primary" href="/newsletter" data-sveltekit-reload>Write another</a>
				<button class="btn-outline" onclick={() => { sentInfo = null; tab = 'sent'; }}>See what has been sent</button>
			</div>
		</section>
	{:else}
		<!-- Stepper: done steps are buttons back to them, later ones are not clickable yet. -->
		<ol class="stepper" aria-label="Progress">
			{#each STEPS as label, i}
				{@const n = i + 1}
				<li class:done={n < step} class:current={n === step}>
					{#if n < step}
						<button type="button" onclick={() => (step = n)} aria-label="Back to step {n}, {label}">
							<span class="dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg></span>
							<span class="name">{label}</span>
						</button>
					{:else}
						<span class="step-static" aria-current={n === step ? 'step' : undefined}>
							<span class="dot">{n}</span>
							<span class="name">{label}</span>
						</span>
					{/if}
				</li>
			{/each}
		</ol>

		<!-- 1 · Article -->
		{#if step === 1}
			<section class="pane">
				<h2 class="pane-title">Which article?</h2>
				<p class="pane-sub">Only published articles can be sent. Newest first.</p>
				{#if data.posts.length === 0}
					<p class="note">Nothing is published yet.</p>
				{/if}
				<ul class="cards">
					{#each data.posts as p (p.slug)}
						{@const sentBefore = data.sent.filter((s) => s.slug === p.slug)}
						<li>
							<button type="button" class="pick" class:chosen={p.slug === slug} onclick={() => choose(p)}>
								<span class="thumb">
									{#if p.imageUrl}<img src={p.imageUrl} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{/if}
								</span>
								<span class="body">
									<span class="date">{p.date}</span>
									<strong>{p.title}</strong>
									<span class="desc">{p.description}</span>
									{#if sentBefore.length > 0}
										<span class="chip warn">Sent {new Date(sentBefore[0].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
									{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- 2 · Write -->
		{#if step === 2 && post}
			<section class="pane split">
				<div class="col">
					<h2 class="pane-title">Write the email</h2>
					<p class="pane-sub">Starts from the article’s own words. Change anything; the preview follows.</p>

					<label>
						Subject line
						<input bind:value={subject} />
						<span class="hint" class:warnish={subject.length > 60}>{subject.length} characters · inboxes cut off around 60</span>
					</label>
					<label>
						A word before the article <span class="opt">optional</span>
						<textarea rows="3" bind:value={note} placeholder="Anything you want to say before the article card. Leave empty to skip."></textarea>
					</label>
					<label>
						Headline
						<input bind:value={title} />
					</label>
					<label>
						Intro
						<textarea rows="4" bind:value={intro}></textarea>
					</label>
					<label>
						The button links to
						<input value={post.url} readonly />
					</label>
					{#if !post.imageUrl}<p class="note">This article has no images, so the email has no picture.</p>{/if}

					<div class="nav">
						<button type="button" class="btn-outline" onclick={() => (step = 1)}>← Article</button>
						<button type="button" class="btn-primary" disabled={blocking} onclick={() => (step = 3)}>Continue to test →</button>
					</div>
					{#if blocking}<p class="chip bad block">{verdict.errors[0]}</p>{/if}
				</div>
				<div class="col">{@render preview()}</div>
			</section>
		{/if}

		<!-- 3 · Test -->
		{#if step === 3 && post}
			<section class="pane split">
				<div class="col">
					<h2 class="pane-title">Send yourself a test</h2>
					<p class="pane-sub">See it in a real inbox, on your phone if you like, before it reaches anyone else. Optional, but the best way to catch a surprise.</p>

					<form
						method="POST" action="?/test" class="test"
						use:enhance={() => {
							testing = true; testError = '';
							return async ({ result, update }) => {
								testing = false;
								if (result.type === 'success') testedFor = contentKey;
								else testError = (result.type === 'failure' && (result.data as { testError?: string })?.testError) || 'The test could not be sent.';
								try { localStorage.setItem('newsletter-test-to', testTo); } catch {}
								await update({ reset: false, invalidateAll: false });
							};
						}}
					>
						{@render fields()}
						<label>
							Send the test to
							<input type="email" name="to" bind:value={testTo} placeholder="you@example.com" autocomplete="email" />
						</label>
						<button class="btn-outline" type="submit" disabled={testing || !data.configured || !looksLikeEmail(testTo.trim())}>
							{testing ? 'Sending…' : 'Send test email'}
						</button>
					</form>
					{#if testedOk}<p class="chip ok block">Test sent. Look for “[Test] {subject}” in your inbox, and in spam.</p>{/if}
					{#if testError}<p class="chip bad block">{testError}</p>{/if}
					{#if !data.configured}<p class="note">Connect Resend to send a test.</p>{/if}

					<div class="nav">
						<button type="button" class="btn-outline" onclick={() => (step = 2)}>← Write</button>
						<button type="button" class="btn-primary" onclick={() => (step = 4)}>
							{testedOk ? 'Continue to review →' : 'Skip the test, review →'}
						</button>
					</div>
				</div>
				<div class="col">{@render preview()}</div>
			</section>
		{/if}

		<!-- 4 · Review and send -->
		{#if step === 4 && post}
			<section class="pane split">
				<div class="col">
					<h2 class="pane-title">Ready to send?</h2>
					<p class="pane-sub">One last look. Sending cannot be undone.</p>

					<dl class="summary">
						<div><dt>To</dt><dd><strong>{readers}</strong> {readers === 1 ? 'subscriber' : 'subscribers'}</dd></div>
						<div><dt>From</dt><dd>{data.fromName}</dd></div>
						<div><dt>Subject</dt><dd>{subject}</dd></div>
						<div><dt>Article</dt><dd>{post.title}</dd></div>
					</dl>

					<ul class="checks" aria-label="Checks">
						{#each checks as c}
							<li class={c.level}>
								<span class="mark" aria-hidden="true">{c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '×'}</span>
								<span class="sr-only">{c.level === 'ok' ? 'Fine:' : c.level === 'warn' ? 'Look at this:' : 'Problem:'}</span>
								{c.text}
							</li>
						{/each}
					</ul>

					{#if sendError}<p class="chip bad block">{sendError}</p>{/if}

					<form
						method="POST" action="?/send"
						use:enhance={() => {
							sending = true; sendError = '';
							return async ({ result, update }) => {
								sending = false;
								dialog?.close();
								if (result.type === 'success') {
									const r = result.data as { warnings?: string[]; at?: string };
									sentInfo = { subject, to: readers, warnings: r?.warnings ?? [], at: r?.at ?? null };
								} else if (result.type === 'failure') {
									sendError = (result.data as { message?: string })?.message ?? 'Sending failed.';
								} else sendError = 'Sending failed.';
								await update({ reset: false });
							};
						}}
					>
						{@render fields()}
						<input type="hidden" name="confirm" value="send" />

						<fieldset class="when">
							<legend>When</legend>
							<label class="opt-row"><input type="radio" bind:group={when} value="now" /> Send now</label>
							<label class="opt-row"><input type="radio" bind:group={when} value="later" /> Send on a later morning</label>
							{#if when === 'later'}
								<div class="day">
									<input type="date" name="day" bind:value={sendDay} min={data.earliestDay} aria-label="Day to send" />
									<span class="hint">{dayOk ? `${dayLabel}, 9:30 Paris time, once the site is live.` : 'Pick a day after today.'}</span>
								</div>
							{/if}
						</fieldset>

						<div class="nav">
							<button type="button" class="btn-outline" onclick={() => (step = 3)}>← Test</button>
							<button type="button" class={when === 'now' ? 'btn-danger btn-lg' : 'btn-primary btn-lg'} disabled={blocking || !data.configured || readers === 0}
								onclick={() => dialog?.showModal()}>
								{when === 'now' ? `Send to ${readers} ${readers === 1 ? 'subscriber' : 'subscribers'}…` : `Schedule for ${dayOk ? dayLabel : '…'}…`}
							</button>
						</div>
						{#if !data.configured}<p class="note">Connect Resend to send.</p>
						{:else if readers === 0}<p class="note">There is nobody to send to yet.</p>{/if}

						<dialog bind:this={dialog} aria-labelledby="confirm-title">
							{#if when === 'now'}
								<h2 id="confirm-title">Send to {readers} {readers === 1 ? 'person' : 'people'} now?</h2>
								<p>“{subject}” goes out immediately and cannot be recalled.</p>
							{:else}
								<h2 id="confirm-title">Schedule for {dayLabel}?</h2>
								<p>“{subject}” goes to everyone on the list at 9:30 that morning, once the site is live. It cannot be recalled after that, and you can cancel it until then.</p>
							{/if}
							{#if alreadySent.length > 0}<p class="chip warn block">This article was already sent. These readers will get it twice.</p>{/if}
							<div class="dlg-actions">
								<button type="button" class="btn-outline" onclick={() => dialog?.close()} disabled={sending}>Go back</button>
								<button type="submit" formaction={when === 'now' ? '?/send' : '?/schedule'} class={when === 'now' ? 'btn-danger' : 'btn-primary'} disabled={sending}>
									{sending ? (when === 'now' ? 'Sending…' : 'Scheduling…') : when === 'now' ? 'Yes, send it now' : 'Yes, schedule it'}
								</button>
							</div>
						</dialog>
					</form>
				</div>
				<div class="col">{@render preview()}</div>
			</section>
		{/if}
	{/if}
{/if}

{#if tab === 'subscribers'}
	<section class="pane plain">
		{#if form?.removed}<p class="chip ok block">{form.removed} has been removed from the list.</p>{/if}
		{#if form?.removeError}<p class="chip bad block">{form.removeError}</p>{/if}
		{#if data.subscribers === null}
			<p class="note">Resend did not answer, so the list cannot be shown right now.</p>
		{:else if data.subscribers.length === 0}
			<p class="note">Nobody has subscribed yet.</p>
		{:else}
			{#if data.subscribers.length > 8}
				<input class="who" type="search" bind:value={who} placeholder="Find an address…" autocomplete="off" />
			{/if}
			<ul class="people">
				{#each shownSubscribers as s (s.id)}
					<li class:gone={s.unsubscribed}>
						<span class="email">{s.email}</span>
						<span class="meta">
							{#if s.unsubscribed}<span class="chip">unsubscribed</span>{/if}joined {day(s.createdAt)}
						</span>
						{#if confirmRemove === s.id}
							<form method="POST" action="?/removeSubscriber" use:enhance={() => async ({ update }) => { confirmRemove = null; await update(); }}>
								<input type="hidden" name="id" value={s.id} />
								<input type="hidden" name="email" value={s.email} />
								<button type="submit" class="btn-danger btn-sm">Remove for good</button>
								<button type="button" class="btn-outline btn-sm" onclick={() => (confirmRemove = null)}>Keep</button>
							</form>
						{:else}
							<button type="button" class="btn-danger-quiet btn-sm" onclick={() => (confirmRemove = s.id)}>Remove</button>
						{/if}
					</li>
				{:else}
					<li class="none">No address matches.</li>
				{/each}
			</ul>
			<p class="note">
				Removing deletes the address from Resend, for someone who asks to be forgotten. People who only
				want to stop receiving it can use the unsubscribe link in any email.
			</p>
		{/if}
	</section>
{/if}

{#if tab === 'sent'}
	<section class="pane plain">
		{#if form?.cancelled}<p class="chip ok block">The scheduled newsletter for “{form.cancelled}” is cancelled.</p>{/if}
		{#if data.held.length > 0}
			<h3 class="sub-title">Scheduled</h3>
			<ul class="sent">
				{#each data.held as h (h.slug)}
					<li>
						<span class="subj">{h.subject ?? data.posts.find((p) => p.slug === h.slug)?.title ?? h.slug}</span>
						{#if h.error}<span class="chip danger" title={h.error}>Failed, will retry</span>{:else}<span class="chip info">Waiting</span>{/if}
						<span class="meta">{new Date(h.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })} · 9:30</span>
						<form method="POST" action="?/cancelScheduled" use:enhance>
							<input type="hidden" name="slug" value={h.slug} />
							<button type="submit" class="btn-danger-quiet btn-sm">Cancel</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<h3 class="sub-title">Sent</h3>
		{#if data.sent.length === 0}
			<p class="note">Nothing has been sent from here yet.</p>
		{:else}
			<ul class="sent">
				{#each data.sent as s}
					<li>
						<span class="subj">{s.subject}</span>
						<!-- Resend's own word for it fills in when it answers; until then it was sent. -->
						{#await data.states}
							<span class="chip">Sent</span>
						{:then states}
							{@const st = states[s.id]}
							{#if st?.status === 'sent'}<span class="chip ok">Sent</span>
							{:else if st?.status === 'queued'}<span class="chip info">Sending</span>
							{:else if st?.status === 'draft'}<span class="chip warn" title="Created at Resend but never sent">Not sent</span>
							{:else}<span class="chip">Sent</span>{/if}
						{/await}
						<span class="meta">{new Date(s.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {s.recipients} {s.recipients === 1 ? 'recipient' : 'recipients'}</span>
						<a class="btn-ghost btn-sm" href="https://resend.com/broadcasts/{s.id}" target="_blank" rel="noreferrer" title="Opens, clicks and bounces are in Resend">Opens and clicks ↗</a>
					</li>
				{/each}
			</ul>
			<p class="note">Resend does not share opens and clicks with other tools, so they are one click away in its own dashboard.</p>
		{/if}
	</section>
{/if}

<style>
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.note { font-size: 0.85rem; color: var(--muted-foreground); margin: 0.6rem 0 0; }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
	.block { display: flex; margin: 0.8rem 0 0; border-radius: 0.6rem; padding: 0.55rem 0.8rem; font-size: 0.85rem; font-weight: 500; }
	.chip.bad { background: var(--danger-bg); color: var(--danger); border-color: var(--danger-line); }

	.setup { background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: var(--radius); padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
	.setup h2 { margin: 0 0 0.3rem; font-size: 1.05rem; color: var(--warn); }
	.setup p { margin: 0 0 0.6rem; font-size: 0.9rem; }
	.setup ol { margin: 0; padding-left: 1.2rem; font-size: 0.88rem; }
	.setup li { margin-bottom: 0.3rem; }

	/* numbers */
	.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 2fr); gap: 0.8rem; margin-bottom: 1.5rem; }
	.stat { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.9rem 1.1rem; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--card-shadow); min-width: 0; }
	.stat .num { font-family: 'Fraunces', Georgia, serif; font-size: 2rem; font-weight: 600; line-height: 1.1; color: var(--primary-strong); }
	.stat .num.small { font-size: 1.35rem; padding-top: 0.45rem; }
	.stat .lbl { font-size: 0.8rem; color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* tabs */
	.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); margin-bottom: 1.75rem; overflow-x: auto; }
	.tabs button { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.7rem 1rem; border: 0; border-bottom: 3px solid transparent; margin-bottom: -1px; background: none; font-size: 0.93rem; font-weight: 600; color: var(--muted-foreground); cursor: pointer; white-space: nowrap; }
	.tabs button:hover { color: var(--foreground); }
	.tabs button.on { color: var(--primary-strong); border-bottom-color: var(--primary); }
	.tabs .n { font-size: 0.72rem; padding: 0.05rem 0.5rem; border-radius: 2rem; background: var(--muted); color: var(--muted-foreground); }
	.tabs button.on .n { background: var(--accent); color: var(--primary-strong); }

	/* stepper */
	.stepper { list-style: none; display: flex; margin: 0 0 1.75rem; padding: 0; counter-reset: none; }
	.stepper li { flex: 1; position: relative; }
	.stepper li:not(:last-child)::after { content: ''; position: absolute; top: 1.05rem; left: calc(50% + 1.5rem); right: calc(-50% + 1.5rem); height: 3px; border-radius: 3px; background: var(--border); }
	.stepper li.done:not(:last-child)::after { background: var(--ok); }
	.stepper button, .step-static { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; width: 100%; padding: 0; border: 0; background: none; font: inherit; cursor: default; }
	.stepper button { cursor: pointer; }
	.dot { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 50%; border: 2px solid var(--border); background: var(--card); font-weight: 700; font-size: 0.9rem; color: var(--muted-foreground); }
	.name { font-size: 0.84rem; font-weight: 600; color: var(--muted-foreground); }
	.done .dot { background: var(--ok); border-color: var(--ok); color: #fff; }
	.done .name { color: var(--ok); }
	.stepper button:hover .dot { box-shadow: 0 0 0 4px var(--ok-bg); }
	.current .dot { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); box-shadow: 0 0 0 4px var(--accent); }
	.current .name { color: var(--primary-strong); }

	/* panes */
	.pane { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--card-shadow); padding: 1.6rem 1.75rem; }
	.pane.plain { max-width: 48rem; }
	.pane-title { margin: 0; font-size: 1.35rem; }
	.pane-sub { margin: 0.3rem 0 1.4rem; color: var(--muted-foreground); font-size: 0.92rem; }
	.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 2.25rem; align-items: start; }
	.col { min-width: 0; display: flex; flex-direction: column; }
	.col label { margin-bottom: 1rem; }
	.opt { opacity: 0.65; font-style: italic; font-weight: 400; }
	.hint { display: block; margin-top: 0.3rem; font-size: 0.75rem; font-weight: 400; color: var(--muted-foreground); }
	.hint.warnish { color: var(--warn); font-weight: 600; }
	.nav { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; margin-top: 1rem; padding-top: 1.1rem; border-top: 1px solid var(--border); }

	/* article cards */
	.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 1rem; }
	.pick { display: flex; flex-direction: column; width: 100%; height: 100%; padding: 0; text-align: left; border: 2px solid var(--border); border-radius: var(--radius); background: var(--card); overflow: hidden; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s; }
	.pick:hover { border-color: var(--primary); box-shadow: var(--card-shadow); transform: translateY(-2px); }
	.pick.chosen { border-color: var(--primary); }
	.thumb { position: relative; display: block; flex: none; aspect-ratio: 16 / 9; overflow: hidden; background: linear-gradient(135deg, var(--accent), var(--muted)); }
	.thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
	.pick .body { display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem; padding: 0.85rem 1rem 1rem; }
	.pick .date { font-size: 0.74rem; color: var(--muted-foreground); }
	.pick strong { font-size: 0.98rem; line-height: 1.3; }
	.pick .desc { font-size: 0.82rem; color: var(--muted-foreground); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

	/* preview */
	.preview-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
	.seg { display: inline-flex; padding: 0.2rem; border-radius: 0.65rem; background: var(--muted); }
	.seg button { padding: 0.28rem 0.8rem; border: 0; border-radius: 0.5rem; background: none; font-size: 0.8rem; font-weight: 600; color: var(--muted-foreground); cursor: pointer; }
	.seg button.on { background: var(--card); color: var(--foreground); box-shadow: 0 1px 3px hsl(0 0% 0% / 0.15); }
	.device { margin-inline: auto; width: 100%; max-width: 40rem; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: #f9f7f5; box-shadow: var(--card-shadow); transition: max-width 0.2s; }
	.device.phone { max-width: 23.5rem; }
	.inbox-row { display: grid; grid-template-columns: 1fr; gap: 0.1rem; padding: 0.7rem 1rem; background: var(--card); border-bottom: 1px solid var(--border); font-size: 0.82rem; }
	.inbox-row .from { font-weight: 700; color: var(--foreground); }
	.inbox-row .subj { font-weight: 600; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.inbox-row .snip { color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.device iframe { display: block; width: 100%; height: 34rem; border: 0; background: #f9f7f5; }

	/* test + review */
	.test { display: grid; gap: 0.2rem; max-width: 26rem; }
	.test button { justify-self: start; }
	.summary { margin: 0 0 1.1rem; display: grid; border: 1px solid var(--border); border-radius: 0.75rem; overflow: hidden; }
	.summary div { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.8rem; padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.92rem; }
	.summary div:last-child { border-bottom: 0; }
	.summary dt { color: var(--muted-foreground); font-size: 0.82rem; padding-top: 0.1rem; }
	.summary dd { margin: 0; overflow-wrap: anywhere; }
	.checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
	.checks li { display: flex; gap: 0.65rem; align-items: flex-start; padding: 0.5rem 0.75rem; border-radius: 0.6rem; font-size: 0.88rem; border: 1px solid transparent; }
	.checks .mark { flex: none; display: grid; place-items: center; width: 1.3rem; height: 1.3rem; border-radius: 50%; font-size: 0.78rem; font-weight: 800; color: #fff; margin-top: 0.05rem; }
	.checks .ok { background: var(--ok-bg); border-color: var(--ok-line); }
	.checks .ok .mark { background: var(--ok); }
	.checks .warn { background: var(--warn-bg); border-color: var(--warn-line); }
	.checks .warn .mark { background: var(--warn); }
	.checks .bad { background: var(--danger-bg); border-color: var(--danger-line); }
	.checks .bad .mark { background: var(--danger); }

	dialog { width: min(27rem, calc(100vw - 2rem)); padding: 1.6rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--foreground); box-shadow: 0 24px 60px -12px hsl(0 0% 0% / 0.45); }
	dialog::backdrop { background: hsl(0 0% 0% / 0.5); }
	dialog h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
	dialog p { margin: 0 0 1rem; color: var(--muted-foreground); font-size: 0.93rem; }
	.dlg-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; }

	/* done */
	.all-sent { max-width: 34rem; margin: 1rem auto; padding: 2.5rem 2rem; text-align: center; border-radius: var(--radius); }
	.all-sent h2 { margin: 1rem 0 0.4rem; font-size: 1.5rem; }
	.all-sent p { margin: 0 0 0.8rem; color: var(--muted-foreground); }
	.tick { display: inline-grid; place-items: center; width: 4rem; height: 4rem; border-radius: 50%; background: var(--ok-bg); color: var(--ok); border: 2px solid var(--ok-line); }
	.row-actions { display: flex; justify-content: center; gap: 0.7rem; flex-wrap: wrap; margin-top: 1.4rem; }

	/* lists */
	.sub-title { margin: 0 0 0.4rem; font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); }
	.sub-title:not(:first-child) { margin-top: 1.6rem; }
	.when { margin: 1.1rem 0 0; padding: 0.8rem 1rem 0.9rem; border: 1px solid var(--border); border-radius: 0.75rem; display: grid; gap: 0.35rem; }
	.when legend { padding: 0 0.4rem; font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); }
	.opt-row { display: flex; align-items: center; gap: 0.55rem; margin: 0; font-weight: 500; cursor: pointer; }
	.opt-row input { accent-color: var(--primary); width: 1rem; height: 1rem; }
	.day { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; padding: 0.3rem 0 0 1.55rem; }
	.day input { width: auto; }
	.day .hint { margin: 0; }
	.who { width: 100%; margin-bottom: 0.8rem; }
	.people, .sent { list-style: none; padding: 0; margin: 0 0 0.8rem; font-size: 0.9rem; }
	.people li, .sent li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.9rem; padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
	.people .email, .sent .subj { flex: 1; min-width: 12rem; overflow-wrap: anywhere; }
	.sent .subj { font-weight: 600; }
	.meta { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--muted-foreground); font-size: 0.8rem; white-space: nowrap; }
	.people li.gone .email { color: var(--muted-foreground); text-decoration: line-through; }
	.people li.none { color: var(--muted-foreground); }
	.people form { display: flex; gap: 0.4rem; }

	@media (min-width: 961px) {
		.split > .col:last-child { position: sticky; top: 1.25rem; }
	}
	@media (max-width: 960px) {
		.split { grid-template-columns: 1fr; gap: 1.5rem; }
		.stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.stat.wide { grid-column: 1 / -1; }
	}
	@media (max-width: 560px) {
		.pane { padding: 1.1rem 1rem; }
		.stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.name { font-size: 0.74rem; }
		.stepper li:not(:last-child)::after { left: calc(50% + 1.3rem); right: calc(-50% + 1.3rem); }
	}
</style>
