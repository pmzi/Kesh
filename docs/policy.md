# Policy considerations

This page explains two policy questions that affect where Kesh can go next. It is a description of the project's design and its risks, written by the author. It is not legal advice and makes no claim about what Apple or Anthropic would decide. Read the current policies yourself; they change.

## Apple: running downloaded code in an App Store app

Today you build Kesh yourself and install it on your own devices with a development signature. That is ordinary development use. The questions below matter if Kesh were ever submitted to TestFlight external testing or the App Store.

Relevant parts of the [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):

- **2.5.2.** In summary, apps should be self-contained and should not download, install or execute code that introduces or changes features or functionality of the app. Kesh's whole purpose is to receive JavaScript from a Mac and run it inside the app, with the plugin deciding the app's behavior. Reviewers could read this as a conflict with 2.5.2.
- **4.7** covers "mini apps, mini games, streaming games, chatbots, plug-ins and game emulators", and describes conditions under which an app can offer such software, including that it runs within the app's own interpreter or WebKit and complies with other guidelines. Kesh's plugins are React Native code evaluated by the app's own JavaScript engine (Hermes). Whether that fits 4.7 is a question for Apple.
- **4.7.2.** In summary, such software must not extend or expose native platform APIs to the software without Apple's prior permission. The `@kesh/sdk` gives plugins haptics, clipboard, local storage, and AI (on-device through FoundationModels, and Claude through the Mac). It also passes the whole `react-native` module through to plugin code (see [security.md](security.md)), which exposes far more native functionality than the SDK documents. Both are likely points of concern.
- Other parts of 4.7 (for example, age ratings and content rules applying to the plugins, and giving users an index of the software) would also need attention.

What is true about Kesh as designed:

- The code comes from the user's own computer and own Claude Code, not from a Kesh-operated server or marketplace. There is no store inside the app.
- The user reviews each plugin's name and permissions before it runs.
- The app has no Kesh-run backend and collects nothing.

Those facts may help or may not; none of them is a documented exemption. The author has not asked Apple and has not submitted the app. Plans such as TestFlight are listed in the roadmap as goals, not as something that is known to be allowed.

## Anthropic: using Claude Code from another program

Kesh does not call the Anthropic API and does not hold any Claude credential. Two things use Claude:

1. **You, in a terminal**, running `claude` in `~/.kesh/workspace`. This is normal Claude Code use.
2. **The companion**, which for AI requests from plugins spawns the user's own installed `claude` binary in headless mode (`claude -p`, no tools, no session) and returns its output to the phone. It uses whatever login `claude` already has, which may be a Claude subscription. The companion never reads, copies or transmits OAuth tokens or API keys, and the phone never sees one.

The second point is the gray area. Anthropic has policies about how its products and subscription authentication may be used by third-party software; see the [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) of the Claude Code documentation (the general docs are at https://code.claude.com/docs). Wrapping a locally installed official CLI, as some existing tools do, is different from extracting a subscription token and using it elsewhere, and Kesh does the former. But whether a given automated or third-party wrapper is acceptable under the terms of a given plan is Anthropic's decision, not this project's, and it could change.

What this means in practice:

- Use Kesh's AI features only on your own Mac, for yourself, under your own account and terms.
- Do not run the companion as a shared service for other people.
- If you want to avoid the question, use `'on-device'` models only, or change the runner (`packages/companion/src/claude.ts`) to call the Anthropic API with your own API key. The project does not do this today.
- If Anthropic's guidance changes, this project will follow it, including by removing the Claude backend.

## Summary

| Question | Status |
|---|---|
| Building and running Kesh on your own devices | Ordinary development use. |
| Distributing the app through TestFlight or the App Store | Unclear and potentially blocked by 2.5.2 and 4.7, especially 4.7.2. Not attempted. |
| Using your own `claude` CLI from the companion | A gray area under Anthropic's policies for third-party use of subscription auth. No tokens are handled by Kesh. |
