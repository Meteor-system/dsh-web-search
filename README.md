# dsh-web-search

A DeepSeek Harness **web profile** plugin. It gives the agent free web search through DuckDuckGo and Bing, so no DeepSeek search key is needed.

- [中文说明](./README.zh.md)

It is split out of [`dsh-fixes`](../dsh-fixes). Install it on its own.

## What it does

| Part | Behavior |
| --- | --- |
| Search provider | Registers the `duckduckgo` provider on Harness `web`; the web row selects it |
| Engines | DuckDuckGo HTML results and Bing web results. There is no official search API. |
| Engine order | Automatic probing by default, or a fixed order you choose under **General** settings. See below. |
| Switch | `启用联网搜索` under **General** settings. Off means the agent cannot call search. Read on every offer, so no restart is needed. |

`web_fetch` is not affected; it still uses Harness's own `http` provider.

## Engine order

Choose one of three options under `搜索引擎顺序`:

- **Automatic** (`自动（测速排序）`, the default). On the first search, both engines are queried in parallel with a fixed probe query and one result each, with a 5-second limit per engine. Engines that return results come first, fastest first; the others follow in the default order. The ranking is kept in memory for 10 minutes. A probe where no engine answered is not kept, so the next search probes again. The first search in each 10-minute window can take up to about 5 seconds longer.
- **DuckDuckGo → Bing**, or **Bing → DuckDuckGo**. Probing is skipped and the chosen order is tried first.

Either way, searches go through the engines in order. An engine that fails or returns no results hands over to the next one. If every engine returns nothing, the search is empty. If every engine fails, the search reports each failure. A fixed order still falls back to the other engine.

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
  engineOrder: []        # [] = automatic; or e.g. ["bing", "duckduckgo"]
```

| Field | Meaning |
| --- | --- |
| `enabled` | Absent or any value other than `false` means on. |
| `engineOrder` | `[]` means automatic probing. A non-empty list is tried in order; engines it leaves out are appended in the default order, and unknown names are ignored. |

## Upgrade note

The switch used to live in `dsh-fixes` (`webSearchEnabled`). It now lives here. A value stored under the old key is ignored, so the switch starts on again after the move.

## Limits

- Search results come from HTML pages, so a markup change at DuckDuckGo or Bing can break parsing without a hard error.
- Both providers may challenge automated traffic; the agent then gets a failed search, not results.
- The search requests do not use a system proxy. On a machine where direct connections to DuckDuckGo time out (for example behind a system proxy), every search comes from Bing and the first search of each window pays the probe cost.
- The tool output does not name the engine that answered, so the agent cannot tell which engine a result came from.
- The ranking lives in process memory only. A restart probes again.
- Only these two engines are supported; third-party search APIs are out of scope.
