# Shared library guidance

Code under `src/lib` must have a stable owner and more than incidental convenience value. Shared placement is earned by actual reuse across routes or by a real browser/server domain boundary; it is not a place to hide code that made a route file look long.

Before adding a file or export:

- Search production call sites separately from tests. Delete symbols used only by their own tests unless they protect a meaningful independently testable rule.
- Inline a one-use expression when its name adds no policy. Do not create files like a one-function document-title or episode-label module for an obvious conditional expression.
- Keep a helper when it centralizes genuinely identical parsing, serialization, formatting, or ordering used by several consumers.
- Keep types beside the owning behavior. Do not repeat the same provider or generated type alias in multiple folders, and do not create pass-through aliases that only rename another type.
- Do not add module-level constants for incidental one-use values. Localize values used by one operation. Keep module constants only for shared policy, protocol values, caches, lookup data, or parameters used by multiple related algorithms.

Readable control flow is part of the contract. Use braces for every `if`, leave blank lines between separate guards, and format nested conditions so the reader can identify each branch without mentally reparsing a dense expression.
