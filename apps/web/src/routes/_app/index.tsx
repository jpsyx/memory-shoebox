import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Page } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";

/**
 * A filtered pile is the pile with search parameters on it, not a different
 * surface: "the result is the pile again: same spine, same prints, same
 * stacks" (`design-spec.md` § User flows). Surfaces 2, 5 and 6 are all here.
 */
const searchSchema = z.object({
  tag: z.array(z.string()).optional(),
  person: z.array(z.string()).optional(),
  from: z.string().optional(),
  until: z.string().optional(),
  /** Whether the filter sheet is open. The "Find" button sets it. */
  find: z.boolean().optional(),
});

export const Route = createFileRoute("/_app/")({
  validateSearch: searchSchema,
  component: TimelinePage,
});

function TimelinePage() {
  return (
    <Page wide>
      <Lede>The timeline.</Lede>
      <Prose onPanel>
        Surfaces 2, 5 and 6. Built in step 5b, against the timeline step 4a
        delivers.
      </Prose>
    </Page>
  );
}
