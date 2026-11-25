# Third-party code

`kokoro.web.js` is the browser build of [kokoro-js](https://www.npmjs.com/package/kokoro-js) 1.2.1
(Apache License 2.0, see `kokoro-LICENSE.txt`). It runs the Kokoro-82M voice model in the browser.
The model and the "Heart" voice file are downloaded from Hugging Face
(`onnx-community/Kokoro-82M-v1.0-ONNX`) the first time the natural voice is turned on, and the browser caches them.
