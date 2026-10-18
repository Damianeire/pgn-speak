# Third-party notices

PGN Speak is MIT-licensed (see LICENSE). Its built files include the following third-party work.

## chess.js

https://github.com/jhlywa/chess.js, used to check moves and work out positions. BSD-2-Clause:

```
Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## Chess pieces (cburnett)

The board pieces are the cburnett set from Wikimedia Commons (for example https://commons.wikimedia.org/wiki/File:Chess_klt45.svg), which Cburnett released under GFDL, BSD and GPL. PGN Speak uses them under the BSD-3-Clause option, and they are in src/web/pieces.ts:

```
" comment below keeps the notice in minified builds.

/*!
Copyright (c) 2006, Cburnett
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this
   list of conditions and the following disclaimer in the documentation and/or
   other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may
   be used to endorse or promote products derived from this software without
   specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## High-quality voice (`site/tts-worker.js`)

Loaded only when someone picks the high-quality voice. It is a separate file from the MIT app code (`site/app.js`) and bundles:

| Component | Licence | Source |
| --- | --- | --- |
| kokoro-js | Apache-2.0 | https://github.com/hexgrad/kokoro (kokoro.js) |
| Transformers.js | Apache-2.0 | https://github.com/huggingface/transformers.js |
| ONNX Runtime Web | MIT | https://github.com/microsoft/onnxruntime |
| phonemizer | Apache-2.0 | https://github.com/xenova/phonemizer |
| eSpeak NG (inside phonemizer, compiled to WebAssembly) | GPL-3.0-or-later | https://github.com/espeak-ng/espeak-ng |

Because eSpeak NG is GPL-3.0, `site/tts-worker.js` as a whole is distributed under the GPL-3.0. Its complete corresponding source is this repository's `src/tts/worker.ts` plus the npm packages listed above at the versions pinned in `package-lock.json`, built with `npm run build`.

The Kokoro-82M voice model itself is not part of this repository. The page downloads it from Hugging Face (https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), where it is published under Apache-2.0.

## MP3 encoder (`site/mp3-worker.js`)

lamejs (https://github.com/breezystack/lamejs), a JavaScript port of LAME, under LGPL-3.0. It is kept in its own file, loaded only to make an MP3, so it can be replaced with any other build. Its source is the `@breezystack/lamejs` npm package at the version pinned in `package-lock.json`.
