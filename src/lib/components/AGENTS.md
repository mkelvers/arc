# Components

A Svelte component earns its boundary by owning a coherent piece of markup, accessibility, interaction, or styling. It does not need to be generic or reused across unrelated products. `HomeHero` and search result cards may be product-specific components when their names accurately describe their UI role.

Do not make a component generic only to make its name broader. Generalize after multiple real consumers vary the same behavior. Conversely, extract a shared primitive such as a modal only when existing consumers need the same focus management, dismissal, keyboard, backdrop, and accessibility contract; do not add a speculative wrapper around one dialog.

Keep a component's small `$props` interface in the Svelte file. It documents the component boundary and is required for useful type checking; moving it to a global type file adds navigation without reuse.

`triggerClass`, `menuClass`, and similar styling props must be justified by real caller-controlled variation. Prefer a fixed internal class when every consumer passes the same value. Use `cn` only for conditional or conflicting Tailwind classes; static classes remain plain strings.

If a component is only a fragment moved out to shorten a parent, verify that it owns a recognizable UI concept or independent interaction. Otherwise put the markup back beside its owner.
