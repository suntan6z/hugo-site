---
title: "Contatti"
description: "Mettiti in contatto con Lorenzo Loconsole — domande, collaborazioni, feedback o solo per salutare. Leggo ogni messaggio."
---
<div style="padding-top:4rem">
  <section class="page-hero">
    <div class="container">
      <div id="contact-hero-wrap" class="fade-up" style="display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:2rem">
        <div style="max-width:36rem">
          <h1>Mettiti in <span class="text-gradient">contatto</span></h1>
          <p style="color:var(--muted-foreground);margin-top:1rem;line-height:1.75">Hai una domanda, un'idea per un progetto o vuoi solo salutare? Mi farebbe piacere sentirti. Lasciami un messaggio e ti risponderò il prima possibile.</p>
        </div>
        <div style="flex-shrink:0">
          <img src="/img/contact-chill.gif" alt="Animazione rilassante" style="width:min(12rem,60vw);height:auto;object-fit:contain" />
        </div>
      </div>
    </div>
  </section>
  <section class="page-content">
    <div class="container">
      <div class="contact-grid">
        <div class="contact-form fade-up">
          <h2>Invia un messaggio</h2>
          <p class="form-note">I campi contrassegnati con <span style="color:var(--primary)">*</span> sono obbligatori.</p>
          <div id="form-success" style="display:none;padding:3rem 2rem;text-align:center">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:4rem;height:4rem;border-radius:50%;background:hsl(350 45% 40% / 0.1);margin-bottom:1.5rem">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary)"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style="font-family:'Fraunces',Georgia,serif;font-size:1.75rem;font-weight:600;color:var(--foreground);margin-bottom:0.75rem">Messaggio inviato!</h2>
            <p style="color:var(--muted-foreground);line-height:1.7;max-width:22rem;margin:0 auto 0.5rem">Grazie per avermi scritto. Ti risponderò il prima possibile — di solito entro un paio di giorni.</p>
            <p style="font-size:0.875rem;color:var(--muted-foreground)">Una conferma è stata inviata alla tua e-mail.</p>
          </div>
          <form id="contact-form" novalidate>
            <div class="form-row">
              <div class="form-group">
                <label for="firstName">Nome <span class="req">*</span></label>
                <input type="text" id="firstName" name="firstName" placeholder="Il tuo nome" minlength="3" required />
                <p class="field-error" id="firstName-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
              </div>
              <div class="form-group">
                <label for="lastName">Cognome <span class="req">*</span></label>
                <input type="text" id="lastName" name="lastName" placeholder="Il tuo cognome" minlength="3" required />
                <p class="field-error" id="lastName-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="email">Indirizzo e-mail <span class="req">*</span></label>
                <input type="email" id="email" name="email" placeholder="tua@email.com" required />
                <p class="field-error" id="email-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
              </div>
              <div class="form-group">
                <label for="phone">Numero di telefono</label>
                <input type="tel" id="phone" name="phone" placeholder="+33 6 00 00 00 00" />
              </div>
            </div>
            <div class="form-group">
              <label for="subject">Oggetto <span class="req">*</span></label>
              <select id="subject" name="subject" required>
                <option value="">Seleziona un oggetto</option>
                <option value="job">Offerta di lavoro</option>
                <option value="collaboration">Collaborazione</option>
                <option value="feedback">Feedback</option>
                <option value="bug">Segnalazione bug</option>
                <option value="hello">Solo un saluto</option>
                <option value="other">Altro</option>
              </select>
              <p class="field-error" id="subject-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
            </div>
            <div class="form-group" id="custom-subject-wrap" style="display:none">
              <label for="customSubject">Descrivi il tuo oggetto <span class="req">*</span></label>
              <input type="text" id="customSubject" name="customSubject" placeholder="Di cosa si tratta?" />
            </div>
            <div class="form-group">
              <label for="message">Messaggio <span class="req">*</span></label>
              <textarea id="message" name="message" placeholder="Il tuo messaggio... (min 50 caratteri)" minlength="50" maxlength="500" required></textarea>
              <p id="char-count" style="font-size:0.75rem;color:var(--muted-foreground);text-align:right;margin-top:0.3rem">0 / 500</p>
              <p class="field-error" id="message-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
            </div>
            <button type="submit" class="btn-primary" id="submit-btn" style="width:100%;justify-content:center;padding:0.875rem 1.5rem;font-size:1rem">
              Invia il messaggio
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </form>
        </div>
        <div class="fade-up" style="display:flex;flex-direction:column;gap:1.5rem">
          <h2 style="font-size:1.25rem">Altri modi per contattarmi</h2>
          <div class="contact-methods">
            <div class="contact-method">
              <div class="contact-method-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <div>
                <h3>E-mail</h3>
                <p><a href="mailto:lorenzo@loconsole.eu" style="color:var(--primary)">lorenzo@loconsole.eu</a></p>
              </div>
            </div>
            <div class="contact-method">
              <div class="contact-method-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </div>
              <div>
                <h3>Telegram</h3>
                <p><a href="https://t.me/loconsole_bot" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">@loconsole_bot</a></p>
              </div>
            </div>
            <div class="contact-method">
              <div class="contact-method-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div>
                <h3>Posizione</h3>
                <p>Francia, Europa 🇪🇺</p>
              </div>
            </div>
            <div class="contact-method">
              <div class="contact-method-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <h3>Ora locale</h3>
                <p id="local-time">Europe/Paris</p>
              </div>
            </div>
          </div>
          <div style="padding:1.5rem;background:var(--accent);border-radius:var(--radius);margin-top:1rem">
            <div style="display:flex;align-items:flex-start;gap:1rem">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);flex-shrink:0;margin-top:0.1rem"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <div>
            <h3 style="font-size:1rem;margin-bottom:0.5rem">Perché questo sito?</h3>
            <p style="font-size:0.875rem;color:var(--muted-foreground);line-height:1.7">Dato che non sono più attivo sui social media, questo sito è il mio spazio personale per condividere aggiornamenti, articoli e mettermi in contatto con le persone. Sentiti libero di scrivermi quando vuoi!</p>
            </div></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
