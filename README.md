# dsh-web-search

A DeepSeek Harness **web profile** plugin. It gives the agent free web search through DuckDuckGo, with Bing as the fallback, so no DeepSeek search key is needed.

It is split out of [`dsh-fixes`](../dsh-fixes). Install it on its own.

## What it does

| Part | Behavior |
| --- | --- |
| Search provider | Registers the `duckduckgo` provider on Harness `web`; the web row selects it |
| Fallback | DuckDuckGo HTML results first; Bing web results if DuckDuckGo is unreachable or challenged. There is no official search API. |
| Switch | `启用联网搜索` under **General** settings. Off means the agent cannot call search. Read on every offer, so no restart is needed. |

`web_fetch` is not affected; it still uses Harness's own `http` provider.

## Install

From this directory:

```sh
npm install
npm run build
```

Then install the bundle into the profile with Harness's plugin manager (`install_bundle` with this directory as the target).

Development:

```sh
npm test
npm run typecheck
```

## Settings

Plugin-owned namespace `dsh-web-search`:

```yaml
dsh-web-search:
  enabled: true
```

Absent or any value other than `false` means on.

## Upgrade note

The switch used to live in `dsh-fixes` (`webSearchEnabled`). It now lives here. A value stored under the old key is ignored, so the switch starts on again after the move.

## Limits

- Search results come from HTML pages, so a markup change at DuckDuckGo or Bing can break parsing without a hard error.
- Both providers may challenge automated traffic; the agent then gets a failed search, not results.
