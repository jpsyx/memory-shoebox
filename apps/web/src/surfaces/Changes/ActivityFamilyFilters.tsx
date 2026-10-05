import type { ActivityFamily, ActivityRequest } from "@memory-shoebox/shared";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Chip } from "@/system/Chip/Chip";
import { ChipRow } from "@/system/Chip/ChipRow";
import { activityFamilyLabel } from "./activityFamilyLabel";

/** Family choices preserve the addressed actor and historical subject. */
export function ActivityFamilyFilters({
  filters,
}: Readonly<{
  filters: Omit<ActivityRequest, "cursor" | "limit">;
}>): ReactNode {
  const navigate = useNavigate({ from: "/changes" });
  const setFamily = (family: ActivityFamily | undefined) => {
    void navigate({ search: { ...filters, family } });
  };
  return (
    <ChipRow>
      <Chip
        onPanel
        active={filters.family === undefined}
        onClick={() => {
          return setFamily(undefined);
        }}
      >
        Everything
      </Chip>
      {(["authority", "destruction", "access"] as const).map((family) => {
        return (
          <Chip
            key={family}
            onPanel
            active={filters.family === family}
            onClick={() => {
              return setFamily(family);
            }}
          >
            {activityFamilyLabel(family)}
          </Chip>
        );
      })}
    </ChipRow>
  );
}
