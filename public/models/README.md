# Bundled models

## isnet-quint8.onnx (about 44 MB)

Background-removal network used by Tool 06 (AI Background Remover). It is served from the site's own origin, so the tool needs no download and works offline.

- Architecture: IS-Net (DIS, "Highly Accurate Dichotomous Image Segmentation", Qin et al., ECCV 2022). Upstream code and weights: https://github.com/xuebinqin/DIS (Apache-2.0).
- Quantised 8-bit ONNX export, taken from the `@imgly/background-removal-data` npm package (`/models/small`, v1.4.5). Only the weight chunks are used (concatenated into this one file). The imgly JavaScript wrapper, which is AGPL-3.0, is NOT used or shipped.
- Input: 1x3x1024x1024 float, values (pixel - 128) / 256. Output: a 1024x1024 alpha matte.
- Runtime: onnxruntime-web (MIT), WASM backend only. The int8 operators in this file are not supported by WebGPU, which is why the old WebGPU path failed.

Check the licence terms of the weights yourself before commercial redistribution.
