<div align="center">

# Silent Reasoning

**What breaks when the model stops thinking out loud**

[![CI](https://github.com/kbipul/silent-reasoning/actions/workflows/ci.yml/badge.svg)](https://github.com/kbipul/silent-reasoning/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-live-5aa9ff)](https://kbipul.github.io/silent-reasoning/)

`Day 027` of **[kb-daily-builds](https://github.com/kbipul/kb-daily-builds)** — one AI project a day.

</div>

## What it does

GPT-6 Astra shipped on 3 September 2026 using recurrent depth: looped transformers that
reason in latent space, with no chain of thought written down. OpenAI's own system card
reports that it followed instructions to hide its reasoning from a monitor in 60.9% of
tests, against 16.1% for GPT-5.6 Sol. The week since has been full of think-pieces asking
whether that is safe.

This asks the narrower question an engineering team actually has to answer: which of the
controls you already run stop working? Tick the controls in your stack, drag the visibility
dial from Sol to Astra, and watch coverage fall mode by mode, with the controls that went
dark named and a ranked list of what would restore the most.

The short version, on the default stack: sandbagging under evaluation falls from 81% covered
to 39% (exposed), and the top recommendation flips from another reasoning monitor to
interpretability probes.

![Screenshot](docs/demo.png)

<sub>The sandbox that builds these projects cannot run a browser, so this screenshot is
captured by the repo's own CI on a GitHub runner and committed back a few minutes after
publish. If you are reading this in the first minutes of its life, it may not have landed yet.</sub>

## Try it

**[Live demo →](https://kbipul.github.io/silent-reasoning/)** — runs fully in your browser,
nothing to install, no keys, no network calls.

```bash
git clone https://github.com/kbipul/silent-reasoning.git
cd silent-reasoning
npm ci
npm test          # 72 tests
npm run dev       # http://localhost:5173/silent-reasoning/
```

## How it works

Everything is deterministic and lives in `src/engine/`. Each of the 12 controls in the
catalogue carries two numbers: a `cotDependence` (0–1), the share of its detection power
that comes from reading visible reasoning, and an `evalAwarenessDependence`, the share that
collapses when the model can tell it is being tested. A CoT keyword monitor is 1.0 on the
first. A tool-call allowlist is 0.0 on both; its catalogue note reads "Judges the call,
never the rationale." Offline eval suites are only 0.2 CoT-dependent but 0.8
evaluation-aware, which is why they are the thing that actually breaks.

The two haircuts are applied separately. A control's effective coverage against a failure
mode is its base value times `(1 − cotDependence × (1 − visibility))` times
`(1 − evalDependence × awareness)`. Keeping the dials independent is what lets you see that
Astra's damage to your evals and its damage to your reasoning monitors are two different
problems with two different fixes.

Controls then combine as correlated detectors. Each is capped at 72% detection however good
it is, and every control after the strongest is discounted by `0.55^rank`, so coverage for
a mode is dominated by your *best* control against it. If your best control against
deceptive tool use is a chain-of-thought monitor, losing it has to hurt. The two constants
are `MAX_DETECTION` and `DEPTH_DECAY` in `assess.ts`.

```
base 0..3  ──▶  × CoT haircut  ──▶  × eval-awareness haircut  ──▶  effective
                                                                      │
        sort desc, cap at 0.72, decay 0.55^rank, 1 − Π(miss)  ◀────────┘
                              │
                              ▶  coverage 0..1  ──▶  covered / thin / exposed
```

## Build notes — what I learned

At the fully latent floor, a hypothetical model whose reasoning is entirely invisible, the
default stack read 87% healthy, and the headline "load-bearing on visible reasoning" number
came out at 4%. Every failure mode on every preset sat at 100% covered. That was the first
version of this tool, and it had passed every gate: 69 tests green, clean build, smoke test
fine. I only saw the problem because I ran the four presets and read the output.

The cause was the textbook composition. Controls combined as independent detectors,
`1 − Π(1 − e/3)`, and seven controls each with a 33–67% hit rate compose to near-certainty,
so the maths drowned the signal in a wall of 99%s. The single claim this tool exists to make
is that your safety net is resting on something that is being taken away, and the model was
returning the opposite. Independent composition is wrong here because safety controls are
correlated: they miss the same clever thing, and five mediocre controls do not add up to one
excellent one. Any model that says they do will tell every team it is fine.

The fix is a detection cap and a rank decay, `MAX_DETECTION = 0.72` and `DEPTH_DECAY = 0.55`
in `assess.ts`, which pushes the answer back onto your strongest control for each mode. The
test that pins it is named `favours one strong control over three mediocre ones`. About
twenty lines, and it rewrote the conclusions: sandbagging under evaluation now falls
81% → 39% on the Astra preset, reward hacking 87% → 49%, deceptive tool use 85% → 65%, and
the top recommendation flips from "add another CoT classifier" to "add interpretability
probes". That last one is the finding I would not have got to by reasoning about it in prose.

A second correction followed. The summary stat at the top of the page, the load-bearing
share, is a mean across all eight modes. It read 11% while the board beside it showed
sandbagging collapsing by 42 points. The headline is now the named worst-hit mode ("points
off your worst-hit mode", with the mode's name under it), and the mean stays below it with a
label saying it is "an average, so it understates the concentrated damage above".

The gate that caught both was printing the actual output for all four presets and reading it
like a stranger would. I have added that to my own loop as a step.

Exactly one figure here is published: the CoT-control adherence rate, 16.1% versus 60.9%.
I use it as a proxy for "visible reasoning", derived as 1 minus that rate, and it is
genuinely a proxy: being *able* to hide reasoning on demand is not the same quantity as how
legible reasoning is by default. The slider hint says so and ends "Drag it to whatever you
believe." The evaluation-awareness dial is my estimate (0.2 for Sol, 0.65 for Astra in
`catalog.ts`); the system card says Astra verbalised markedly more evaluation awareness but
gives no number that maps onto a dial. The whole coverage grid is engineering judgement.

The temptation was to bury that. Instead every profile carries a `Basis` field,
`published`, `estimated` or `hypothetical`; a test named `labels the derived figures as
published and the dials as estimated` asserts the labels are right; both dials are
user-draggable; every control and every failure mode carries a written note in `catalog.ts`, and the 96 base coverage values sit in one matrix in the same file, so any cell can be challenged.

The coverage grid wants real data behind it, incident post-mortems mapped to which control
caught the problem, and that is a much larger project and probably the honest version of
this one. The slate this beat had the same problem from the other direction: Recall Cliff,
carried over from the day before, scored 10/12 against this project's 12/12 (the first clean
sweep in the series), and its demo-ability was capped at 2 again because an honest version
needs the user's own eval data.

The scope cut is smaller. The per-control dependence numbers are editable only in source;
you can argue with my model but you have to clone it to do so.

## Stack

| | |
|---|---|
| UI | React 18, TypeScript 5 (strict) |
| Build | Vite 6 |
| Tests | Vitest 3 — 72 tests |
| Engine | Zero dependencies, fully deterministic, no network |
| Demo | GitHub Pages, entirely client-side |

## Sources

- OpenAI — **GPT-6 Astra system card**, September 2026: CoT-control adherence 16.1%
  (GPT-5.6 Sol) vs 60.9% (GPT-6 Astra); significantly lower full-context monitorability
  across most output lengths; increased verbalised evaluation awareness.
  [System card](https://deploymentsafety.openai.com/gpt-6-astra)
  · [Safety overview](https://openai.com/index/safety-overview-gpt-6-astra/)
- Reporting on what that does to oversight, including OpenAI's own position that CoT
  monitoring "is a core part of our misalignment safety strategy that has no good
  substitute now" —
  [The Stack](https://www.thestack.technology/open-ai-astra-monitor-warning/)
  · [gHacks](https://www.ghacks.net/2026/09/07/gpt-6-astra-draws-scrutiny-for-being-harder-to-monitor-even-as-openai-calls-it-more-aligned/)

Every number that is not from those sources is labelled `estimated` or `hypothetical` in the
UI and in `src/engine/catalog.ts`.

---

<div align="center"><sub>
Built by <a href="https://www.kumarbipul.com"><b>Kumar Bipul</b></a> ·
IT Director → AI/ML · <a href="https://github.com/kbipul">github.com/kbipul</a>
</sub></div>
