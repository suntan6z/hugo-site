<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	let { data, form } = $props();

	// An article asked for by ?slug= wins: that is why this page was opened.
	let slug = $state(untrack(() => form?.values?.slug ?? data.chosen?.slug ?? data.posts[0]?.slug ?? ''));
	let subject = $state(untrack(() => form?.values?.subject ?? ''));
	let title = $state(untrack(() => form?.values?.title ?? ''));
	let intro = $state(untrack(() => form?.values?.intro ?? ''));
	let note = $state(untrack(() => form?.values?.note ?? ''));
	let confirm = $state('');
	let busy = $state(false);
	let touched = $state(false);

	const post = $derived(data.posts.find((p) => p.slug === slug));
	const alreadySent = $derived(data.sent.filter((s) => s.slug === slug));

	// Pre-fill from the article until the author edits something, so switching
	// articles does not silently keep the previous one's copy.
	$effect(() => {
		const p = data.posts.find((x) => x.slug === slug);
		if (!p || touched) return;
		untrack(() => {
			title = p.title;
			intro = p.description;
			subject = p.title;
		});
	});

	// Subscribers: filtered as you type, and removed only after a second click.
	let who = $state('');
	let confirmRemove = $state<string | null>(null);
	const shownSubscribers = $derived(
		(data.subscribers ?? []).filter((s) => who === '' || s.email.toLowerCase().includes(who.trim().toLowerCase()))
	);
	const joined = (iso: string) =>
		iso ? new Date(iso.replace(' ', 'T')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

	const canSend = $derived(
		!!post && subject.trim() !== '' && title.trim() !== '' && intro.trim() !== '' &&
		confirm.trim() === subject.trim()
	);
</script>

<div class="head">
	<h1>Newsletter</h1>
	{#if data.audience}
		<span class="count">
			<strong>{data.audience.subscribed}</strong> subscriber{data.audience.subscribed === 1 ? '' : 's'}
			{#if data.audience.unsubscribed > 0}<span>· {data.audience.unsubscribed} unsubscribed</span>{/if}
		</span>
	{/if}
</div>

{#if !data.configured}
	<section class="setup">
		<h2>Resend is not connected</h2>
		<ol>
			<li>Use the same API key the contact form already uses, from <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer">resend.com/api-keys</a>.</li>
			<li>Add it to <code>admin/.env</code> as <code>RESEND_API_KEY=…</code>.</li>
			<li>Run <code>cd admin && ./scripts/create-container.sh</code>.</li>
		</ol>
		<p class="note">
			Broadcasts go to the same audience <code>functions/newsletter.js</code> enrols people into,
			from the same verified sender its welcome email uses.
		</p>
	</section>

	{#if data.preview}
		<!-- Rendering the email needs no key: only sending it does. -->
		<section class="preview">
			<h2>Preview<span class="as-is"> · {data.chosen?.title}</span></h2>
			<iframe title="Newsletter preview" srcdoc={data.preview} sandbox=""></iframe>
		</section>
	{/if}
{:else}
	{#if form?.sent}
		<p class="msg ok">
			Sent. Resend broadcast <code>{form.id}</code>.
			{#if form.warnings?.length}<br />{form.warnings.join(' ')}{/if}
		</p>
	{/if}
	{#if form?.message}<p class="msg err">{form.message}</p>{/if}

	<form method="POST" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
		<label>
			Article
			<select name="slug" bind:value={slug}>
				{#each data.posts as p}<option value={p.slug}>{p.date} · {p.title}</option>{/each}
			</select>
		</label>

		{#if alreadySent.length > 0}
			<p class="warn">
				A broadcast for this article was already sent
				{alreadySent.map((s) => new Date(s.at).toLocaleDateString('en-GB')).join(', ')}.
				Sending again will reach the same people a second time.
			</p>
		{/if}

		<label>
			Subject
			<input name="subject" bind:value={subject} oninput={() => (touched = true)} />
			<span class="count-hint" class:warn={subject.length > 60}>
				{subject.length} characters · inboxes truncate around 60
			</span>
		</label>

		<label>
			A word before the article <span class="opt">optional</span>
			<textarea name="note" rows="3" bind:value={note} oninput={() => (touched = true)}
				placeholder="Anything you want to say before the article card. Leave empty to skip."></textarea>
		</label>

		<div class="row">
			<label>Headline<input name="title" bind:value={title} oninput={() => (touched = true)} /></label>
			<label>Links to<input value={post?.url ?? ''} readonly /></label>
		</div>

		<label>
			Intro
			<textarea name="intro" rows="4" bind:value={intro} oninput={() => (touched = true)}></textarea>
		</label>

		{#if post && !post.image}
			<p class="note">This article has no images, so the email has no picture.</p>
		{/if}

		<div class="actions">
			<button type="submit" formaction="?/preview" disabled={busy || !post}>Preview</button>
		</div>

		<fieldset class="send">
			<legend>Send</legend>
			<p>
				This reaches <strong>{data.audience?.subscribed ?? '…'}</strong> subscribers immediately
				and cannot be recalled. Type the subject line to confirm.
			</p>
			<input name="confirm" bind:value={confirm} placeholder={subject || 'the subject line'} autocomplete="off" />
			<button type="submit" formaction="?/send" class="danger" disabled={busy || !canSend}>
				{busy ? 'Sending…' : 'Send to subscribers'}
			</button>
		</fieldset>
	</form>

	{#if form?.preview || data.preview}
		<section class="preview">
			<h2>Preview{#if !form?.preview}<span class="as-is"> · as it stands</span>{/if}</h2>
			<iframe title="Newsletter preview" srcdoc={form?.preview ?? data.preview} sandbox=""></iframe>
		</section>
	{/if}

	<section class="subscribers">
		<h2>Subscribers</h2>
		{#if form?.removed}<p class="msg ok">{form.removed} has been removed from the list.</p>{/if}
		{#if form?.removeError}<p class="msg err">{form.removeError}</p>{/if}
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
							{#if s.unsubscribed}unsubscribed · {/if}joined {joined(s.createdAt)}
						</span>
						{#if confirmRemove === s.id}
							<form method="POST" action="?/removeSubscriber" use:enhance={() => async ({ update }) => { confirmRemove = null; await update(); }}>
								<input type="hidden" name="id" value={s.id} />
								<input type="hidden" name="email" value={s.email} />
								<button type="submit" class="remove sure">Remove for good</button>
								<button type="button" class="remove" onclick={() => (confirmRemove = null)}>Keep</button>
							</form>
						{:else}
							<button type="button" class="remove" onclick={() => (confirmRemove = s.id)}>Remove</button>
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

	{#if data.sent.length > 0}
		<section>
			<h2>Previously sent</h2>
			<ul class="sent">
				{#each data.sent.slice(0, 10) as s}
					<li>
						<span class="subj">{s.subject}</span>
						<span class="meta">{new Date(s.at).toLocaleDateString('en-GB')} · {s.recipients} recipients</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style>
	.as-is { font-weight: 400; color: var(--muted-foreground); font-size: 0.8rem; }
	.subscribers { margin-top: 2rem; max-width: 44rem; }
	.who { width: 100%; margin-bottom: 0.6rem; }
	.people { list-style: none; padding: 0; margin: 0 0 0.6rem; font-size: 0.86rem; }
	.people li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.8rem; padding: 0.45rem 0; border-bottom: 1px solid var(--border); }
	.people .email { flex: 1; min-width: 12rem; overflow-wrap: anywhere; }
	.people .meta { color: var(--muted-foreground); font-size: 0.78rem; white-space: nowrap; }
	.people li.gone .email { color: var(--muted-foreground); text-decoration: line-through; }
	.people li.none { color: var(--muted-foreground); }
	.people form { display: flex; gap: 0.4rem; }
	.remove { background: none; border: 0; padding: 0; font-size: 0.78rem; color: var(--muted-foreground); text-decoration: underline; cursor: pointer; }
	.remove:hover, .remove.sure { color: var(--danger); }
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.015em; }
	.count { font-size: 0.88rem; color: var(--muted-foreground); }
	.count strong { color: var(--foreground); font-size: 1rem; }
	.count span { opacity: 0.8; }
	h2 { font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted-foreground); margin: 0 0 0.6rem; }

	.setup { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.25rem; }
	.setup h2 { font-size: 0.95rem; text-transform: none; letter-spacing: 0; color: var(--foreground); }
	.setup ol { margin: 0 0 0.75rem; padding-left: 1.2rem; font-size: 0.88rem; }
	.setup li { margin-bottom: 0.35rem; }

	.msg { padding: 0.75rem 0.95rem; border-radius: 8px; font-size: 0.88rem; margin: 0 0 1rem; }
	.msg.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
	.msg.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
	.warn { background: color-mix(in srgb, var(--warn) 12%, transparent); border-left: 3px solid var(--warn);
		padding: 0.7rem 0.9rem; border-radius: 0 8px 8px 0; font-size: 0.85rem; margin: 0; }

	form { display: grid; gap: 1rem; max-width: 44rem; }
	.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); gap: 1rem; }
	.opt { opacity: 0.7; font-style: italic; }
	.count-hint { display: block; margin-top: 0.3rem; font-size: 0.72rem; color: var(--muted-foreground); }
	.count-hint.warn { color: var(--warn); background: none; border: 0; padding: 0; }
	.note { font-size: 0.82rem; color: var(--muted-foreground); margin: 0; }
	.actions { display: flex; gap: 0.6rem; }
	.actions button { padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px;
		background: var(--card); font-weight: 600; font-size: 0.88rem; cursor: pointer; }

	.send { border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border)); border-radius: var(--radius);
		padding: 0.9rem 1rem 1rem; display: grid; gap: 0.6rem; }
	.send legend { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em;
		color: var(--danger); padding: 0 0.35rem; }
	.send p { font-size: 0.85rem; color: var(--muted-foreground); margin: 0; }
	.send .danger { justify-self: start; padding: 0.55rem 1.1rem; border: 1px solid var(--danger);
		border-radius: 8px; background: none; color: var(--danger); font-weight: 600; cursor: pointer; }
	.send .danger:disabled { opacity: 0.4; cursor: default; }

	.preview { margin-top: 2rem; }
	.preview iframe { width: 100%; height: 620px; border: 1px solid var(--border); border-radius: var(--radius); background: #f9f7f5; }
	.sent { list-style: none; padding: 0; margin: 0; font-size: 0.86rem; }
	.sent li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid var(--border); }
	.sent .meta { color: var(--muted-foreground); white-space: nowrap; font-size: 0.8rem; }
	code { font-size: 0.85em; background: color-mix(in srgb, var(--foreground) 8%, transparent); padding: 0.05em 0.3em; border-radius: 3px; }
</style>
