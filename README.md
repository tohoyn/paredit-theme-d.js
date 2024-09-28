![](http://robert.kra.hn/images/paredit-logo.jpg)


## Purpose

This package provides Paredit support for the Theme-D programming language. In particular, indentation is implemented.

## Usage

Use command `npm install https://github.com/tohoyn/paredit-theme-d.js` to install.


## Dev

### build

Update `paredit-bundle.min.js` and `paredit-bundle.js`:

```shell
node build.js
```

### Testing

Unit tests: `npm run test`

### With Lively

Load via lively.modules:

```js
await load();

async function load() {
  var lm = lively.modules,
      files = ["./index.js",
               './lib/util.js',
               "./lib/reader.js",
               "./lib/navigator.js",
               "./lib/editor.js",
               // "./tests/reader-test.js",
               // "./tests/navigator-test.js",
               // "./tests/editor-test.js"
              ],
      p = lm.getPackage("paredit.js");
  for (let f of files) await lm.module(lively.lang.string.joinPath(p.url, f)).reload();
}
```
