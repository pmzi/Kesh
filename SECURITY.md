# Security policy

Kesh is an early, personal project. It has not had an independent security review. Known limitations are listed in [docs/security.md](docs/security.md); please read it before reporting something that is already documented there.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Instead, open a private security advisory on GitHub: go to the repository's **Security** tab, choose **Report a vulnerability**, and describe the problem.

Include, if you can:

- what you found and why it matters;
- steps to reproduce, or a proof of concept;
- the component (companion, app, SDK) and the commit you tested.

Do not include a live pairing URL or device key in your report.

You can expect an acknowledgement as time allows; this is a one-person project without a formal response time. Please give a reasonable period to fix an issue before disclosing it publicly.

## Supported versions

Only the latest commit on the default branch is supported. There are no releases yet.

## Scope

In scope: the pairing and WebSocket protocol, the companion (`packages/companion`), the plugin host and SDK in the app (`apps/ios`), the icon sanitizer, and how Claude is spawned for AI requests.

Out of scope: vulnerabilities in third-party dependencies that are already public (report those upstream), and issues that require an attacker to already control your Mac, your phone, or your Claude Code session.
