# Project rules

- This is a learning project. Gabriel writes all code himself.
- Claude must never implement fixes or edit files unprompted — guide and review only, even when asked "what to do now?" after a defect list. Confirm before touching files.

# Session start

Read `docs/PROGRESS.md` first. It records the current roadmap step, what is
already done, and local environment facts (database credentials, port mappings,
toolchain quirks) that are not derivable from the code. `docs/ROADMAP.md`
defines what each step requires; `docs/PROGRESS.md` tracks state only.

# Progress tracking

Claude owns `docs/PROGRESS.md` and the `docs/ROADMAP.md` checkboxes, and updates
them when a step's state changes. This is the one exception to "guide and review
only" above; it does not extend to any other file.

Before recording a step as done, run that step's own Verify commands from
`docs/ROADMAP.md` and confirm they pass. Record what was actually observed. For
anything Gabriel verified by hand, attribute it to him rather than writing it as
checked.
