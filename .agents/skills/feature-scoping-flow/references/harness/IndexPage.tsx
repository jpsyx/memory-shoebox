import { Stack } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { Page } from "@/system/Chrome";
import { LabelText, Lede, Prose } from "@/system/typography";
import { SURFACES } from "@/surfaces";
import type { Surface } from "@/surfaces/registry";
import classes from "@/harness/harness.module.css";
import systemClasses from "@/system/system.module.css";
import type { ReactNode } from "react";

function SurfaceCard({ surface }: { readonly surface: Surface }) {
  const firstState = surface.states[0];
  return (
    <Link
      to="/s/$surfaceId"
      params={{ surfaceId: surface.id }}
      search={{ state: firstState?.id }}
      className={classes.indexCard}
    >
      <span className={classes.indexCardHead}>
        <span className={classes.indexNumber}>{surface.number}</span>
        <span className={classes.indexTitle}>{surface.title}</span>
      </span>
      <span className={classes.indexBlurb}>{surface.blurb}</span>
      <span className={classes.indexStates}>
        {surface.who} · {surface.states.length} states
      </span>
    </Link>
  );
}

export function IndexPage(): ReactNode {
  const memberSurfaces = SURFACES.filter((surface) => {
    return surface.group === "member";
  });
  const adminSurfaces = SURFACES.filter((surface) => {
    return surface.group === "admin";
  });
  const totalStates = SURFACES.reduce((sum, surface) => {
    return sum + surface.states.length;
  }, 0);

  return (
    <Page wide>
      <Stack gap="md">
        <Lede>Every surface in the spec, at full fidelity.</Lede>
        <Prose onPanel>
          {SURFACES.length} surfaces and {totalStates} states, built from the
          tokens in <b>DESIGN.md</b> against the feature spec in{" "}
          <b>docs/spec.md</b>. None of it is wired to anything: there is no API,
          no database and no upload. The names, comments and counts are written
          demonstration content, and the photographs are real family files that
          never leave this machine.
        </Prose>
        <Prose onPanel>
          The black rail at the foot of the window is the harness, not the
          product. It switches between a surface's states, between the four
          palettes, and between the tidy and messy pile.
        </Prose>
      </Stack>

      <section className={classes.indexSection}>
        <LabelText component="h2">Member surfaces</LabelText>
        <div className={classes.indexList}>
          {memberSurfaces.map((surface) => {
            return <SurfaceCard key={surface.id} surface={surface} />;
          })}
        </div>
      </section>

      {adminSurfaces.length === 0 ? null : (
        <section className={classes.indexSection}>
          <LabelText component="h2">Admin surfaces</LabelText>
          <div className={classes.indexList}>
            {adminSurfaces.map((surface) => {
              return <SurfaceCard key={surface.id} surface={surface} />;
            })}
          </div>
        </section>
      )}

      <section className={classes.indexSection}>
        <LabelText component="h2">What this round decides</LabelText>
        <dl className={systemClasses.defs}>
          <dt>What is settled</dt>
          <dd>
            How each surface is laid out, what states it has to solve, and what
            it says in words. The visual language was settled in the round
            before this one and is not reopened here.
          </dd>
          <dt>What is not built</dt>
          <dd>
            Everything behind it. Data model, API, authentication, upload,
            storage and mail all follow from these mockups rather than the other
            way round.
          </dd>
          <dt>Where the design lives</dt>
          <dd>
            Colour and scale are in <b>src/styles/tokens.css</b>; the Mantine
            theme in <b>src/theme/theme.ts</b> bridges them onto Mantine's own
            variables, so a component picks up the world without being told
            about it. Both are meant to move into <b>apps/web</b> as they are.
          </dd>
        </dl>
      </section>
    </Page>
  );
}
