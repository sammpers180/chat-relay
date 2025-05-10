# Provider Utils Architecture (`provider-utils.js`)

This document outlines the purpose and structure of [`provider-utils.js`](extension/providers/provider-utils.js:1), which manages provider registration and dynamic lookup based on domain.

---

## 🧩 Overview

This module is injected into the global `window` object as `window.providerUtils` and offers two core functions:

- [`registerProvider()`](extension/providers/provider-utils.js:7): Registers a provider instance with one or more domains.
- [`detectProvider()`](extension/providers/provider-utils.js:19): Looks up a provider instance based on the current hostname.

---

## 🌍 Provider Registry

Internally, the registry is held in:

```js
const providerMap = {}; // domain -> { name, instance }
```

Providers are registered like:

```js
registerProvider("AIStudioProvider", ["aistudio.google.com"], new AIStudioProvider());
```

This allows matching providers to be reused across multiple domains if necessary.

---

## 🔍 Provider Detection

The function [`detectProvider(hostname)`](extension/providers/provider-utils.js:19) performs a partial match against the registered `domainKey`s to determine the best match.

If no match is found, it returns `null` and logs the result.

---

## 🔐 Error Handling

- Validates types of all registration arguments.
- Logs malformed or missing hostnames during detection.
- Silently fails for misconfiguration, aiding fault tolerance.

---

## 🧪 Debug Logging

- Logs the entire provider map for visibility on each detection.
- Confirms successful matches and domain checks.

---

## ✅ Summary

[`provider-utils.js`](extension/providers/provider-utils.js:1) provides a lightweight and dynamic mechanism for associating hostnames with provider implementations. It ensures extensibility for future integrations while remaining simple and debuggable.