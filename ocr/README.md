# Pinned on-device OCR assets

Used by the tag and cart readers; photos are processed locally, never uploaded.
Tesseract.js and Tesseract.js-core: 5.1.1. English model: 4.0.0_best_int (same model as v2.3).
Library and core are Apache-2.0; included license files and the two upstream bundle notice files retain their notices. English tessdata_best is also Apache-2.0.

Sources:
- https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/
- https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/
- https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz
- https://github.com/tesseract-ocr/tessdata_best

Both LSTM SIMD and non-SIMD cores, library, worker and English model are precached (about 11 MB) so the first OCR run works offline after installation completes. The folder also contains both legacy cores required by the supported directory configuration, but they are not precached or used by our LSTM-only worker.

SHA-256:
- core-5.1.1/LICENSE: c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08
- core-5.1.1/tesseract-core-lstm.wasm.js: 8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa
- core-5.1.1/tesseract-core-simd-lstm.wasm.js: ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf
- core-5.1.1/tesseract-core-simd.wasm.js: 63f232c4f7a97b04e52eb940202700b2c6239783a75d0ff0553274fac530cd5c
- core-5.1.1/tesseract-core.wasm.js: 2b8c8c92b8788807061fb4bb16c5acdf000c149e100255f879f78d2c58ca9969
- lang/eng.traineddata.gz: 45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91
- tesseract-5.1.1/LICENSE.md: b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1
- tesseract-5.1.1/tesseract.min.js: a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8
- tesseract-5.1.1/tesseract.min.js.LICENSE.txt: cdf963ced7d25a0f98901a547647b4d6e2dbe0197fd78c87a059a87b0e542fe2
- tesseract-5.1.1/worker.min.js: aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc
- tesseract-5.1.1/worker.min.js.LICENSE.txt: 45f54171aeaa1d10c0c1a66f374b7bba1f02472b1487fbe892eec04f840002ac
