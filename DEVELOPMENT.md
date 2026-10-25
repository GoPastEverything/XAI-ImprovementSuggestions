# Development

Start with the [README](README.md) and [saved-versus-live data guide](docs/before-live-data.md).

The included timeline is bundled saved data and works without API access. Your own imports and local discussions remain ignored. The app is a local development prototype; it is not ready for public multiuser hosting.

The isolated PULSE module is vendored under `vendor/pulse/` with its upstream license. Its Cargo harness is self-contained in this repository.

Run the verification commands in the README after changing source or dependencies. Keep sensitive values out of `VITE_` variables, frontend code, Git, and sample data. See [SECURITY.md](SECURITY.md).
