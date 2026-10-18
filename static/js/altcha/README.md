# ALTCHA widget (vendored)

Unmodified files from the `altcha` npm package, version 3.2.4 (MIT, see LICENSE.txt):

- `altcha.min.js` is `dist/external/altcha.min.js`, the build without bundled workers.
- `pbkdf2.worker.js` is `dist/workers/pbkdf2.js`, the worker that solves the challenge.

They are served from the site's own origin so the content security policy needs nothing
extra. The glue (which worker to use, where the challenge comes from) is in
`static/js/main.js`; the server half is `functions/lib/altcha.js`.

To update: `npm pack altcha@<version>`, copy the two files, bump the version here, and
check the forms in a browser. The version should be at least two weeks old.
