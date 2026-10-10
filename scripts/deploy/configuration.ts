import type { Deployment } from "./environment";

/** Generates a private ephemeral Fly config from operator inputs. */
export function makeFlyConfigFromDeployment(deployment: Deployment): object {
  const operator = deployment.operator;
  return {
    app: operator.FLY_APP,
    primary_region: operator.FLY_REGION,
    // Default Dockerfile discovery uses the explicit deploy working directory.
    // A relative configured path would resolve against the temporary config.
    processes: { app: "node src/index.ts" },
    mounts: [
      {
        source: operator.FLY_VOLUME_NAME,
        destination: operator.FLY_MOUNT_PATH,
        processes: ["app"],
      },
    ],
    http_service: {
      internal_port: Number(deployment.server.PORT),
      force_https: true,
      auto_stop_machines: operator.FLY_AUTO_STOP_MACHINES,
      auto_start_machines: true,
      min_machines_running: Number(operator.FLY_MIN_MACHINES_RUNNING),
      processes: ["app"],
      checks: [
        {
          interval: "30s",
          timeout: "5s",
          grace_period: "30s",
          method: "GET",
          path: "/api/health",
        },
      ],
    },
    vm: [
      {
        size: operator.FLY_VM_SIZE,
        memory: `${operator.FLY_VM_MEMORY_MB}mb`,
        processes: ["app"],
      },
    ],
  };
}
