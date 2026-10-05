import type { TimezoneImpactDto } from "@memory-shoebox/shared";
import { Stack } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import classes from "@/surfaces/Settings/SettingsTimezone/TimezoneImpact.module.css";
/**
 * Displays consequences from the actual preview or committed write, with real
 * fix addresses.
 */
export function TimezoneImpact({
  impact,
  isPreview,
}: Readonly<{ impact: TimezoneImpactDto; isPreview: boolean }>): ReactNode {
  return (
    <Banner>
      <Stack gap="sm">
        <strong>
          {isPreview
            ? "Changing this moves photographs between days."
            : "The timezone change was saved."}
        </strong>
        <span>
          {impact.movingItemCount} items {isPreview ? "would move" : "moved"}{" "}
          between days.
        </span>
        <span>
          {impact.burstEjectionItemCount} items{" "}
          {isPreview ? "would leave their bursts" : "left their bursts"}.
        </span>
        {impact.milestoneMismatches.length === 0 ? (
          <span>No milestone mismatches.</span>
        ) : (
          impact.milestoneMismatches.map(({ milestone, itemCount }) => {
            return (
              <Link
                className={classes.link}
                key={milestone.milestoneId}
                to="/milestones"
                search={{ milestone: milestone.milestoneId, mode: "fix" }}
              >
                {milestone.name}: {itemCount} items outside its dates. Review
                the milestone.
              </Link>
            );
          })
        )}
      </Stack>
    </Banner>
  );
}
