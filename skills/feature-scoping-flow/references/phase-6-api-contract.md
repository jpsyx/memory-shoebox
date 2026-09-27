# Phase 6: the API contract

Every route the product needs, with request and response types precise enough
to generate from, the transformations the schema does not imply, the
performance note per route, and the error rules.

## Plan the fan-out before you run it

Dispatch **one planning agent first**. Give it the data model, the spec and the
surfaces, and ask it for: how many agents and what each one's slice is, the
actual prompt text for each, the shared conventions that make the outputs
merge, what must not be delegated, and the collision points with a tie-break
for each.

That last item is what makes the merge cheap. Predicting the collisions and
deciding them in advance turns a merge full of judgement calls into a merge
full of lookups.

## The output is a directory

`<specdir>/tech-specs/apis/`, never a single `api.md`:

```
<specdir>/tech-specs/apis/
  conventions.md     written first, binding on everything else
  <slice>.md         one per route group, written in parallel
  README.md          written last: the index and master route table
```

One file cannot be written by eight agents at once, and nobody reads nine
thousand lines of routes top to bottom. Each agent writes **directly to its
final path**, so merging is index work and tie-breaks rather than nine-way
prose surgery.

## Write the conventions file first

**Nothing dispatches until `conventions.md` exists.** Eight documents written
in parallel merge into one contract only if they were written against one set
of rules. Without it you get eight dialects and a rewrite.

It must settle, at minimum:

| Thing                                        | Why it cannot be per slice                                            |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Path shape, casing, nesting depth            | Two agents will nest differently                                      |
| Response envelope, collection shape          | Three will disagree on wrappers                                       |
| Pagination style and what the cursor encodes | Offset creeps in otherwise                                            |
| The frozen shared DTOs                       | Five slices need the central entity; eight would define five versions |
| Error shape, status table, code naming       | The security-relevant one, below                                      |
| The permission or visibility predicate       | Eight paraphrases of one predicate is how a leak happens              |
| The request context the middleware attaches  | Every route depends on it; no route owns it                           |
| Background jobs                              | Not HTTP, so no slice owns them, but several depend on them           |
| Status code on create                        | Three agents will each pick differently                               |

Hand agents the frozen DTOs **by name** and forbid redefining them. Tell them
that a missing field goes in an "Additions requested" section rather than being
widened inline, or you will merge five near-duplicates.

Also forbid writing schema validation code. Have them write plain TypeScript
interfaces and generate one validation dialect after the merge.

## Slicing

**By domain (route group)**, which lines up with how route modules are
organised, so each agent's output is already shaped like the module somebody
will write. Assign every surface state to exactly one slice and check the total
adds up.

Tell each agent explicitly what **not** to document, naming the slice that owns
it. Cross-slice references should be citations, never dependencies, so nothing
blocks.

## Merging

Merge in dependency order: where slice B's contract constrains slice A's route,
read B first and edit A to match.

Then verify the invariants **by grep, not by trust**. Pick the four or five
that would be security bugs and check every file:

- No count that permissions can filter, served from a stored column
- No status code that confirms the existence of something the viewer may not
  see
- States that must be indistinguishable on the wire, actually identical
- No internal ordering column leaking into a payload where it would reveal
  filtered rows

Build the master route table sorted by path, which is the only place a
duplicate route is visible. Zero collisions is the pass condition.

## Expect the slices to find holes in the schema

This is the phase's second product. Building against a schema finds what
designing it could not. In the reference run the slices found four real holes,
including one security hole created by an earlier decision: removing a token
from an invitation had made the account row the only thing granting access,
while the invitation row was still the only thing closing it.

Fix them in the data model, not in the contract, and list them in the API
index so the next reader knows what changed underneath them.

## Finish with a conventions pass

**Dispatch one last subagent after the merge.** The slice agents were
concentrating on getting the contract right and nobody told them the
repository's own code conventions, so their snippets will be idiomatic
TypeScript rather than idiomatic _here_.

Give it: read every file in `docs/rules/` in full, then bring every code
snippet in the written markdown into line. Tell it this is a style pass, not a
review: it must not change a route path, a field name, an error code, or any
prose describing behaviour.

Two things make this dispatch worth doing carefully rather than as an
afterthought:

- **Name the violation you already know about**, so it has a starting point,
  but tell it explicitly not to stop there and to audit against every rule.
- **Name the carve-outs.** A rule usually has an exception that applies to
  exactly this content, and an agent applying the rule mechanically will
  "fix" something that was correct. In the reference run the TypeScript rules
  prefer `undefined` over `null` but except JSON over HTTP, which is every
  type in the contract. Without that carve-out spelled out, the pass would
  have rewritten several hundred deliberate nulls.

Have it run the repo's check command and report the exit code.

## Output

`<specdir>/tech-specs/apis/README.md` is the index: the slices, the master route table,
what was settled centrally, what the merge changed, and what holes were found.
`conventions.md` and one file per slice sit beside it.

Templates: `api-conventions-template.md` and `api-readme-template.md`.
