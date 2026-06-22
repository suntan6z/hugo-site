---
title: "Contact"
description: "Get in touch with Lorenzo Loconsole — questions, collaborations, feedback, or just to say hi. I read every message."
url: "/contact"
---
<div style="padding-top:4rem">
  <section class="page-hero">
    <div class="container">
      <div id="contact-hero-wrap" class="fade-up" style="display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:2rem">
        <div style="max-width:36rem">
          <h1>Get in <span class="text-gradient">Touch</span></h1>
          <p style="color:var(--muted-foreground);margin-top:1rem;line-height:1.75">Have a question, project idea, or just want to say hello? I'd love to hear from you. Drop me a message and I'll get back to you as soon as possible.</p>
        </div>
        <div style="flex-shrink:0">
          <img src="/images/contact-chill.gif" alt="Relaxing animation" style="width:min(12rem,60vw);height:auto;object-fit:contain" />
        </div>
      </div>
    </div>
  </section>
  <section class="page-content">
    <div class="container">
      <div class="contact-grid">
        <div class="contact-form fade-up">
          <h2>Send a Message</h2>
          <p class="form-note">Fields marked with <span style="color:var(--primary)">*</span> are mandatory.</p>
          <div id="form-success" style="display:none;padding:3rem 2rem;text-align:center">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:4rem;height:4rem;border-radius:50%;background:hsl(350 45% 40% / 0.1);margin-bottom:1.5rem">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary)"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style="font-family:'Fraunces',Georgia,serif;font-size:1.75rem;font-weight:600;color:var(--foreground);margin-bottom:0.75rem">Message sent!</h2>
            <p style="color:var(--muted-foreground);line-height:1.7;max-width:22rem;margin:0 auto 0.5rem">Thanks for reaching out. I'll get back to you as soon as possible — usually within a couple of days.</p>
            <p style="font-size:0.875rem;color:var(--muted-foreground)">A confirmation has been sent to your email.</p>
          </div>
          <form id="contact-form" novalidate>
            <div class="form-row">
              <div class="form-group">
                <label for="firstName">First name <span class="req">*</span></label>
                <input type="text" id="firstName" name="firstName" placeholder="Your first name" minlength="3" required />
                <p class="field-error" id="firstName-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
              </div>
              <div class="form-group">
                <label for="lastName">Last name <span class="req">*</span></label>
                <input type="text" id="lastName" name="lastName" placeholder="Your last name" minlength="3" required />
                <p class="field-error" id="lastName-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="email">Email address <span class="req">*</span></label>
                <input type="email" id="email" name="email" placeholder="your@email.com" required />
                <p class="field-error" id="email-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
              </div>
              <div class="form-group">
                <label for="phone">Phone number</label>
                <input type="tel" id="phone" name="phone" placeholder="+33 6 00 00 00 00" />
              </div>
            </div>
            <div class="form-group">
              <label for="subject">Subject <span class="req">*</span></label>
              <select id="subject" name="subject" required>
                <option value="">Select a subject</option>
                <option value="job">Job opportunity</option>
                <option value="collaboration">Collaboration</option>
                <option value="feedback">Feedback</option>
                <option value="bug">Bug report</option>
                <option value="hello">Just saying hi</option>
                <option value="other">Other</option>
              </select>
              <p class="field-error" id="subject-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
            </div>
            <div class="form-group" id="custom-subject-wrap" style="display:none">
              <label for="customSubject">Describe your subject <span class="req">*</span></label>
              <input type="text" id="customSubject" name="customSubject" placeholder="What's this about?" />
            </div>
            <div class="form-group">
              <label for="message">Message <span class="req">*</span></label>
              <textarea id="message" name="message" placeholder="Your message... (min 50 characters)" minlength="50" maxlength="500" required></textarea>
              <p id="char-count" style="font-size:0.75rem;color:var(--muted-foreground);text-align:right;margin-top:0.3rem">0 / 500</p>
              <p class="field-error" id="message-error" style="display:none;font-size:0.8rem;color:var(--primary);margin-top:0.3rem"></p>
            </div>
            <button type="submit" class="btn-primary" id="submit-btn" style="width:100%;justify-content:center;padding:0.875rem 1.5rem;font-size:1rem">
              Send Message
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </form>
        </div>
        <div class="fade-up" style="display:flex;flex-direction:column;gap:1.5rem">
          <h2 style="font-size:1.25rem">Other Ways to Reach Me</h2>
          <div class="contact-methods">
            <div class="contact-method">
              <div class="contact-method-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <div>
                <h3>Email</h3>
                <p><a href="mailto:lorenzo@loconsole.eu" style="color:var(--primary)">lorenzo@loconsole.eu</a></p>
              </div>
            </div>
            <div class="contact-method">
              <div class="contact-method-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div>
                <h3>Location</h3>
                <p>France, Europe 🇪🇺</p>
              </div>
            </div>
            <div class="contact-method">
              <div class="contact-method-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <h3>Local Time</h3>
                <p id="local-time">Europe/Paris</p>
              </div>
            </div>
          </div>
          <div style="padding:1.5rem;background:var(--accent);border-radius:var(--radius);margin-top:1rem">
            <div style="display:flex;align-items:flex-start;gap:1rem">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);flex-shrink:0;margin-top:0.1rem"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <div>
            <h3 style="font-size:1rem;margin-bottom:0.5rem">Why this website?</h3>
            <p style="font-size:0.875rem;color:var(--muted-foreground);line-height:1.7">Since I'm no longer active on social media, this website serves as my personal space to share updates, articles, and connect with people. Feel free to reach out anytime!</p>
            </div></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
